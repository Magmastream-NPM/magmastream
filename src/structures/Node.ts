import {
	PlayerEvent,
	PlayerEvents,
	Structure,
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	WebSocketClosedEvent,
	SponsorBlockChapterStarted,
	SponsorBlockChaptersLoaded,
	SponsorBlockSegmentsLoaded,
	SponsorBlockSegmentSkipped,
} from "./Utils";
import { Manager, PlayerStateEventTypes } from "./Manager";
import { Player, Track, UnresolvedTrack } from "./Player";
import { Rest } from "./Rest";
import nodeCheck from "../utils/nodeCheck";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { ClientUser } from "discord.js";
import axios from "axios";

export const validSponsorBlocks = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic", "filler"];
export type SponsorBlockSegment = "sponsor" | "selfpromo" | "interaction" | "intro" | "outro" | "preview" | "music_offtopic" | "filler";

const sessionIdsFilePath = path.join(process.cwd(), "magmastream", "dist", "sessionData", "sessionIds.json");
let sessionIdsMap: Map<string, string> = new Map();

const configDir = path.dirname(sessionIdsFilePath);
if (!fs.existsSync(configDir)) {
	fs.mkdirSync(configDir, { recursive: true });
}

export class Node {
	/** The socket for the node. */
	public socket: WebSocket | null = null;
	/** The stats for the node. */
	public stats: NodeStats;
	public manager: Manager;
	/** The node's session ID. */
	public sessionId: string | null;
	/** The REST instance. */
	public readonly rest: Rest;

	private static _manager: Manager;
	private reconnectTimeout?: NodeJS.Timeout;
	private reconnectAttempts = 1;

	/** Actual Lavalink information of the node. */
	public info: LavalinkInfo | null = null;

	/** Returns if connected to the Node. */
	public get connected(): boolean {
		if (!this.socket) return false;
		return this.socket.readyState === WebSocket.OPEN;
	}

	/** Returns the address for this node. */
	public get address(): string {
		return `${this.options.host}:${this.options.port}`;
	}

	/** @hidden */
	public static init(manager: Manager): void {
		this._manager = manager;
	}

	/**
	 * Creates an instance of Node.
	 * @param options
	 */
	constructor(public options: NodeOptions) {
		if (!this.manager) this.manager = Structure.get("Node")._manager;
		if (!this.manager) throw new RangeError("Manager has not been initiated.");

		if (this.manager.nodes.has(options.identifier || options.host)) {
			return this.manager.nodes.get(options.identifier || options.host);
		}

		nodeCheck(options);

		this.options = {
			port: 2333,
			password: "youshallnotpass",
			secure: false,
			retryAmount: 30,
			retryDelay: 60000,
			priority: 0,
			...options,
		};

		if (this.options.secure) {
			this.options.port = 443;
		}

		this.options.identifier = options.identifier || options.host;
		this.stats = {
			players: 0,
			playingPlayers: 0,
			uptime: 0,
			memory: {
				free: 0,
				used: 0,
				allocated: 0,
				reservable: 0,
			},
			cpu: {
				cores: 0,
				systemLoad: 0,
				lavalinkLoad: 0,
			},
			frameStats: {
				sent: 0,
				nulled: 0,
				deficit: 0,
			},
		};

		this.manager.nodes.set(this.options.identifier, this);
		this.manager.emit("nodeCreate", this);
		this.rest = new Rest(this, this.manager);

		this.createSessionIdsFile();
		this.loadSessionIds();

		// Create README file to inform the user about the magmastream folder
		this.createReadmeFile();
	}

	/** Creates the sessionIds.json file if it doesn't exist. */
	public createSessionIdsFile(): void {
		if (!fs.existsSync(sessionIdsFilePath)) {
			this.manager.emit("debug", `[NODE] Creating sessionId file at: ${sessionIdsFilePath}`);
			fs.writeFileSync(sessionIdsFilePath, JSON.stringify({}), "utf-8");
		}
	}

	/** Loads session IDs from the sessionIds.json file. */
	public loadSessionIds(): void {
		if (fs.existsSync(sessionIdsFilePath)) {
			this.manager.emit("debug", `[NODE] Loading sessionIds from file: ${sessionIdsFilePath}`);
			const sessionIdsData = fs.readFileSync(sessionIdsFilePath, "utf-8");
			sessionIdsMap = new Map(Object.entries(JSON.parse(sessionIdsData)));
		}
	}

	/** Updates the session ID in the sessionIds.json file. */
	public updateSessionId(): void {
		this.manager.emit("debug", `[NODE] Updating sessionIds to file: ${sessionIdsFilePath}`);
		sessionIdsMap.set(this.options.identifier, this.sessionId);
		fs.writeFileSync(sessionIdsFilePath, JSON.stringify(Object.fromEntries(sessionIdsMap)));
	}

	/** Connects to the Node. */
	public connect(): void {
		if (this.connected) return;

		const headers = {
			Authorization: this.options.password,
			"User-Id": this.manager.options.clientId,
			"Client-Name": this.manager.options.clientName,
		};

		if (this.sessionId) {
			headers["Session-Id"] = this.sessionId;
		} else if (this.options.resumeStatus && sessionIdsMap.has(this.options.identifier)) {
			this.sessionId = sessionIdsMap.get(this.options.identifier) || null;
			headers["Session-Id"] = this.sessionId;
		}

		this.socket = new WebSocket(`ws${this.options.secure ? "s" : ""}://${this.address}/v4/websocket`, { headers });
		this.socket.on("open", this.open.bind(this));
		this.socket.on("close", this.close.bind(this));
		this.socket.on("message", this.message.bind(this));
		this.socket.on("error", this.error.bind(this));

		const debugInfo = {
			connected: this.connected,
			address: this.address,
			sessionId: this.sessionId,
			options: {
				clientId: this.manager.options.clientId,
				clientName: this.manager.options.clientName,
				secure: this.options.secure,
				identifier: this.options.identifier,
			},
		};

		this.manager.emit("debug", `[NODE] Connecting ${JSON.stringify(debugInfo)}`);
	}

	/** Destroys the Node and all players connected with it. */
	public destroy(): void {
		if (!this.connected) return;

		const debugInfo = {
			connected: this.connected,
			identifier: this.options.identifier,
			address: this.address,
			sessionId: this.sessionId,
			playerCount: this.manager.players.filter((p) => p.node == this).size,
		};

		this.manager.emit("debug", `[NODE] Destroying node: ${JSON.stringify(debugInfo)}`);

		const players = this.manager.players.filter((p) => p.node == this);
		if (players.size) players.forEach((p) => p.destroy());

		this.socket.close(1000, "destroy");
		this.socket.removeAllListeners();
		this.socket = null;

		this.reconnectAttempts = 1;
		clearTimeout(this.reconnectTimeout);

		this.manager.emit("nodeDestroy", this);
		this.manager.destroyNode(this.options.identifier);
	}

	private reconnect(): void {
		const debugInfo = {
			identifier: this.options.identifier,
			connected: this.connected,
			reconnectAttempts: this.reconnectAttempts,
			retryAmount: this.options.retryAmount,
			retryDelay: this.options.retryDelay,
		};

		this.manager.emit("debug", `[NODE] Reconnecting node: ${JSON.stringify(debugInfo)}`);

		this.reconnectTimeout = setTimeout(() => {
			if (this.reconnectAttempts >= this.options.retryAmount) {
				const error = new Error(`Unable to connect after ${this.options.retryAmount} attempts.`);
				this.manager.emit("nodeError", this, error);
				return this.destroy();
			}

			this.socket?.removeAllListeners();
			this.socket = null;
			this.manager.emit("nodeReconnect", this);
			this.connect();
			this.reconnectAttempts++;
		}, this.options.retryDelay);
	}

	protected open(): void {
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
		const debugInfo = {
			identifier: this.options.identifier,
			connected: this.connected,
		};
		this.manager.emit("nodeConnect", this);
		this.manager.emit("debug", `[NODE] Connected node: ${JSON.stringify(debugInfo)}`);
	}

	protected close(code: number, reason: string): void {
		const debugInfo = {
			identifier: this.options.identifier,
			code,
			reason,
		};
		this.manager.emit("nodeDisconnect", this, { code, reason });
		this.manager.emit("debug", `[NODE] Disconnected node: ${JSON.stringify(debugInfo)}`);
		if (code !== 1000 || reason !== "destroy") this.reconnect();
	}

	protected error(error: Error): void {
		if (!error) return;
		const debugInfo = {
			identifier: this.options.identifier,
			error: error.message,
		};
		this.manager.emit("debug", `[NODE] Error on node: ${JSON.stringify(debugInfo)}`);
		this.manager.emit("nodeError", this, error);
	}

	protected async message(d: Buffer | string): Promise<void> {
		if (Array.isArray(d)) d = Buffer.concat(d);
		else if (d instanceof ArrayBuffer) d = Buffer.from(d);

		const payload = JSON.parse(d.toString());

		if (!payload.op) return;
		this.manager.emit("nodeRaw", payload);

		let player: Player;

		switch (payload.op) {
			case "stats":
				delete payload.op;
				this.stats = { ...payload } as unknown as NodeStats;
				break;
			case "playerUpdate":
				player = this.manager.players.get(payload.guildId);
				if (player) player.position = payload.state.position || 0;
				break;
			case "event":
				this.manager.emit("debug", `[NODE] Node message: ${JSON.stringify(payload)}`);
				this.handleEvent(payload);
				break;
			case "ready":
				this.manager.emit("debug", `[NODE] Node message: ${JSON.stringify(payload)}`);
				this.rest.setSessionId(payload.sessionId);
				this.sessionId = payload.sessionId;
				this.updateSessionId(); // Call to update session ID
				this.info = await this.fetchInfo();
				// Log if the session was resumed successfully
				if (payload.resumed) {
					// Load player states from the JSON file
					await this.manager.loadPlayerStates(this.options.identifier);
				}

				if (this.options.resumeStatus) {
					this.rest.patch(`/v4/sessions/${this.sessionId}`, {
						resuming: this.options.resumeStatus,
						timeout: this.options.resumeTimeout,
					});
				}
				break;
			default:
				this.manager.emit("nodeError", this, new Error(`Unexpected op "${payload.op}" with data: ${payload.message}`));
				return;
		}
	}

	protected async handleEvent(payload: PlayerEvent & PlayerEvents): Promise<void> {
		if (!payload.guildId) return;

		const player = this.manager.players.get(payload.guildId);
		if (!player) return;

		const track = player.queue.current;
		const type = payload.type;

		let error: Error;
		switch (type) {
			case "TrackStartEvent":
				this.trackStart(player, track as Track, payload);
				break;

			case "TrackEndEvent":
				if (player?.nowPlayingMessage && player?.nowPlayingMessage.deletable) {
					await player?.nowPlayingMessage?.delete().catch(() => {});
				}

				this.trackEnd(player, track as Track, payload);
				break;

			case "TrackStuckEvent":
				this.trackStuck(player, track as Track, payload);
				break;

			case "TrackExceptionEvent":
				this.trackError(player, track, payload);
				break;

			case "WebSocketClosedEvent":
				this.socketClosed(player, payload);
				break;

			case "SegmentsLoaded":
				this.sponsorBlockSegmentLoaded(player, player.queue.current as Track, payload);
				break;
			case "SegmentSkipped":
				this.sponsorBlockSegmentSkipped(player, player.queue.current as Track, payload);
				break;
			case "ChaptersLoaded":
				this.sponsorBlockChaptersLoaded(player, player.queue.current as Track, payload);
				break;
			case "ChapterStarted":
				this.sponsorBlockChapterStarted(player, player.queue.current as Track, payload);
				break;

			default:
				error = new Error(`Node#event unknown event '${type}'.`);
				this.manager.emit("nodeError", this, error);
				break;
		}
	}

	protected trackStart(player: Player, track: Track, payload: TrackStartEvent): void {
		const oldPlayer = player;
		player.playing = true;
		player.paused = false;
		this.manager.emit("trackStart", player, track, payload);
		this.manager.emit("playerStateUpdate", oldPlayer, player, {
			changeType: PlayerStateEventTypes.TRACK_CHANGE,
			details: {
				changeType: "start",
				track: track,
			},
		});
	}

	protected async trackEnd(player: Player, track: Track, payload: TrackEndEvent): Promise<void> {
		const { reason } = payload;

		const oldPlayer = player;

		// If the track failed to load or was cleaned up
		if (["loadFailed", "cleanup"].includes(reason)) {
			this.handleFailedTrack(player, track, payload);
		}
		// If the track was forcibly replaced
		else if (reason === "replaced") {
			this.manager.emit("trackEnd", player, track, payload);
			player.queue.previous = player.queue.current;
		}
		// If the track ended and it's set to repeat (track or queue)
		else if (track && (player.trackRepeat || player.queueRepeat)) {
			this.handleRepeatedTrack(player, track, payload);
		}
		// If there's another track in the queue
		else if (player.queue.length) {
			this.playNextTrack(player, track, payload);
		}
		// If there are no more tracks in the queue
		else {
			await this.queueEnd(player, track, payload);
		}
		this.manager.emit("playerStateUpdate", oldPlayer, player, {
			changeType: PlayerStateEventTypes.TRACK_CHANGE,
			details: {
				changeType: "end",
				track: track,
			},
		});
	}

	public extractSpotifyTrackID(url: string): string | null {
		const regex = /https:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
		const match = url.match(regex);
		return match ? match[1] : null;
	}

	public extractSpotifyArtistID(url: string): string | null {
		const regex = /https:\/\/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/;
		const match = url.match(regex);
		return match ? match[1] : null;
	}

	// Handle autoplay
	private async handleAutoplay(player: Player, track: Track, attempt: number = 0): Promise<boolean> {
		if (!player.isAutoplay || attempt === player.autoplayTries || !player.queue.previous) return false;

		const previousTrack = player.queue.previous;
		const apiKey = this.manager.options.lastFmApiKey;

		// If Last.fm API is not available and YouTube is not supported
		if (!apiKey && !this.info.sourceManagers.includes("youtube")) return false;

		// Handle YouTube autoplay logic
		if (
			(!apiKey && this.info.sourceManagers.includes("youtube")) ||
			(attempt === player.autoplayTries - 1 && !(apiKey && player.autoplayTries === 1) && this.info.sourceManagers.includes("youtube"))
		) {
			const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => previousTrack.uri.includes(url));
			const videoID = hasYouTubeURL
				? previousTrack.uri.split("=").pop()
				: (await player.search(`${previousTrack.author} - ${previousTrack.title}`, player.get("Internal_BotUser") as ClientUser)).tracks[0]?.uri.split("=").pop();

			if (!videoID) return false;

			let randomIndex: number;
			let searchURI: string;
			do {
				randomIndex = Math.floor(Math.random() * 23) + 2;
				searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}&index=${randomIndex}`;
			} while (track.uri.includes(searchURI));

			const res = await player.search(searchURI, player.get("Internal_BotUser") as ClientUser);
			if (res.loadType === "empty" || res.loadType === "error") return false;

			const foundTrack = res.tracks.find((t) => t.uri !== track.uri && t.author !== track.author && t.title !== track.title);
			if (!foundTrack) return false;

			player.queue.add(foundTrack);
			player.play();
			return true;
		}

		// Handle Last.fm-based autoplay logic
		let { author: artist } = previousTrack;
		const { title, uri } = previousTrack;

		const enabledSources = this.info.sourceManagers;

		const isSpotifyEnabled = enabledSources.includes("spotify");
		const isSpotifyUri = uri.includes("spotify.com");

		let selectedSource: string | null = null;

		if (isSpotifyEnabled && isSpotifyUri) {
			selectedSource = "spotify";
		} else {
			selectedSource = this.manager.options.defaultSearchPlatform;
		}

		if (!artist || !title) {
			if (!title) {
				const noTitleUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
				const response = await axios.get(noTitleUrl);

				if (response.data.error || !response.data.toptracks?.track?.length) return false;

				const randomTrack = response.data.toptracks.track[Math.floor(Math.random() * response.data.toptracks.track.length)];
				const res = await player.search(
					{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: selectedSource },
					player.get("Internal_BotUser") as ClientUser
				);
				if (res.loadType === "empty" || res.loadType === "error") return false;

				const foundTrack = res.tracks.find((t) => t.uri !== track.uri);
				if (!foundTrack) return false;

				player.queue.add(foundTrack);
				player.play();
				return true;
			} else if (!artist) {
				const noArtistUrl = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${title}&api_key=${apiKey}&format=json`;
				const response = await axios.get(noArtistUrl);
				artist = response.data.results.trackmatches?.track?.[0]?.artist;
				if (!artist) return false;
			}
		}

		const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${artist}&track=${title}&limit=10&autocorrect=1&api_key=${apiKey}&format=json`;
		const response = await axios.get(url);

		if (response.data.error || !response.data.similartracks?.track?.length) {
			const retryUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
			const retryResponse = await axios.get(retryUrl);

			if (retryResponse.data.error || !retryResponse.data.toptracks?.track?.length) return false;

			const randomTrack = retryResponse.data.toptracks.track[Math.floor(Math.random() * retryResponse.data.toptracks.track.length)];
			const res = await player.search(
				{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: selectedSource },
				player.get("Internal_BotUser") as ClientUser
			);
			if (res.loadType === "empty" || res.loadType === "error") return false;

			const foundTrack = res.tracks.find((t) => t.uri !== track.uri);
			if (!foundTrack) return false;

			player.queue.add(foundTrack);
			player.play();
			return true;
		}

		const randomTrack = response.data.similartracks.track[Math.floor(Math.random() * response.data.similartracks.track.length)];
		const res = await player.search(
			{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: selectedSource },
			player.get("Internal_BotUser") as ClientUser
		);
		if (res.loadType === "empty" || res.loadType === "error") return false;

		const foundTrack = res.tracks.find((t) => t.uri !== track.uri);
		if (!foundTrack) return false;

		player.queue.add(foundTrack);
		player.play();
		return true;
	}

	// Handle the case when a track failed to load or was cleaned up
	private handleFailedTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.previous = player.queue.current;
		player.queue.current = player.queue.shift();

		if (!player.queue.current) {
			this.queueEnd(player, track, payload);
			return;
		}

		this.manager.emit("trackEnd", player, track, payload);
		if (this.manager.options.autoPlay) player.play();
	}

	// Handle the case when a track ended and it's set to repeat (track or queue)
	private handleRepeatedTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		const { queue, trackRepeat, queueRepeat } = player;
		const { autoPlay } = this.manager.options;

		if (trackRepeat) {
			queue.unshift(queue.current);
		} else if (queueRepeat) {
			queue.add(queue.current);
		}

		queue.previous = queue.current;
		queue.current = queue.shift();

		this.manager.emit("trackEnd", player, track, payload);

		if (payload.reason === "stopped" && !(queue.current = queue.shift())) {
			this.queueEnd(player, track, payload);
			return;
		}

		if (autoPlay) player.play();
	}

	// Handle the case when there's another track in the queue
	private playNextTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.previous = player.queue.current;
		player.queue.current = player.queue.shift();

		this.manager.emit("trackEnd", player, track, payload);
		if (this.manager.options.autoPlay) player.play();
	}

	public async queueEnd(player: Player, track: Track, payload: TrackEndEvent): Promise<void> {
		player.queue.previous = player.queue.current;
		player.queue.current = null;

		if (!player.isAutoplay) {
			player.playing = false;
			this.manager.emit("queueEnd", player, track, payload);
			return;
		}

		let attempts = 1;
		let success = false;

		while (attempts <= player.autoplayTries) {
			success = await this.handleAutoplay(player, track, attempts);
			if (success) return;
			attempts++;
		}

		// If all attempts fail, reset the player state and emit queueEnd
		player.queue.previous = null;
		player.playing = false;
		this.manager.emit("queueEnd", player, track, payload);
	}

	protected trackStuck(player: Player, track: Track, payload: TrackStuckEvent): void {
		player.stop();
		this.manager.emit("trackStuck", player, track, payload);
	}

	protected trackError(player: Player, track: Track | UnresolvedTrack, payload: TrackExceptionEvent): void {
		player.stop();
		this.manager.emit("trackError", player, track, payload);
	}

	protected socketClosed(player: Player, payload: WebSocketClosedEvent): void {
		this.manager.emit("socketClosed", player, payload);
		this.manager.emit("debug", `[NODE] Websocket closed for player: ${player.guild} with payload: ${JSON.stringify(payload)}`);
	}

	private sponsorBlockSegmentLoaded(player: Player, track: Track, payload: SponsorBlockSegmentsLoaded) {
		return this.manager.emit("segmentsLoaded", player, track, payload);
	}

	private sponsorBlockSegmentSkipped(player: Player, track: Track, payload: SponsorBlockSegmentSkipped) {
		return this.manager.emit("segmentSkipped", player, track, payload);
	}

	private sponsorBlockChaptersLoaded(player: Player, track: Track, payload: SponsorBlockChaptersLoaded) {
		return this.manager.emit("chaptersLoaded", player, track, payload);
	}

	private sponsorBlockChapterStarted(player: Player, track: Track, payload: SponsorBlockChapterStarted) {
		return this.manager.emit("chapterStarted", player, track, payload);
	}
	public async fetchInfo() {
		return (await this.rest.get(`/v4/info`)) as LavalinkInfo;
	}

	public async getSponsorBlock(player: Player): Promise<SponsorBlockSegment[]> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "sponsorblock-plugin"))
			throw new RangeError(`there is no sponsorblock-plugin available in the lavalink node: ${this.options.identifier}`);

		return (await this.rest.get(`/v4/sessions/${this.sessionId}/players/${player.guild}/sponsorblock/categories`)) as SponsorBlockSegment[];
	}

	/**
	 * Set the current sponsorblocks for the sponsorblock plugin
	 * @param player passthrough the player
	 * @returns void
	 *
	 * @example
	 * ```ts
	 * // use it on the player via player.setSponsorBlock();
	 * const sponsorBlockSegments = await player.node.setSponsorBlock(player, ["sponsor", "selfpromo"]);
	 * ```
	 */
	public async setSponsorBlock(player: Player, segments: SponsorBlockSegment[] = ["sponsor", "selfpromo"]): Promise<void> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "sponsorblock-plugin"))
			throw new RangeError(`there is no sponsorblock-plugin available in the lavalink node: ${this.options.identifier}`);

		if (!segments.length) throw new RangeError("No Segments provided. Did you mean to use 'deleteSponsorBlock'?");

		if (segments.some((v) => !validSponsorBlocks.includes(v.toLowerCase())))
			throw new SyntaxError(`You provided a sponsorblock which isn't valid, valid ones are: ${validSponsorBlocks.map((v) => `'${v}'`).join(", ")}`);

		await this.rest.put(`/v4/sessions/${this.sessionId}/players/${player.guild}/sponsorblock/categories`, JSON.stringify(segments.map((v) => v.toLowerCase())));
		return;
	}

	/**
	 * Delete the sponsorblock plugins
	 * @param player passthrough the player
	 * @returns void
	 *
	 * @example
	 * ```ts
	 * // use it on the player via player.deleteSponsorBlock();
	 * const sponsorBlockSegments = await player.node.deleteSponsorBlock(player);
	 * ```
	 */
	public async deleteSponsorBlock(player: Player): Promise<void> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "sponsorblock-plugin"))
			throw new RangeError(`there is no sponsorblock-plugin available in the lavalink node: ${this.options.identifier}`);

		await this.rest.delete(`/v4/sessions/${this.sessionId}/players/${player.guild}/sponsorblock/categories`);
		return;
	}

	// Creates a README.md or README.txt file in the magmastream directory
	private createReadmeFile(): void {
		const readmeFilePath = path.join(process.cwd(), "magmastream", "README.md");
		const message = "Please do NOT delete the magmastream/ folder as it is used to store player data for autoresume etc.";

		if (!fs.existsSync(readmeFilePath)) {
			fs.writeFileSync(readmeFilePath, message, "utf-8");
			this.manager.emit("debug", `[NODE] Created README file at: ${readmeFilePath}`);
		}
	}
}

export interface NodeOptions {
	/** The host for the node. */
	host: string;
	/** The port for the node. */
	port?: number;
	/** The password for the node. */
	password?: string;
	/** Whether the host uses SSL. */
	secure?: boolean;
	/** The identifier for the node. */
	identifier?: string;
	/** The retryAmount for the node. */
	retryAmount?: number;
	/** The retryDelay for the node. */
	retryDelay?: number;
	/** Whether to resume the previous session. */
	resumeStatus?: boolean;
	/** The time the manager will wait before trying to resume the previous session. */
	resumeTimeout?: number;
	/** The timeout used for api calls. */
	requestTimeout?: number;
	/** Priority of the node. */
	priority?: number;
}

export interface NodeStats {
	/** The amount of players on the node. */
	players: number;
	/** The amount of playing players on the node. */
	playingPlayers: number;
	/** The uptime for the node. */
	uptime: number;
	/** The memory stats for the node. */
	memory: MemoryStats;
	/** The cpu stats for the node. */
	cpu: CPUStats;
	/** The frame stats for the node. */
	frameStats: FrameStats;
}

export interface MemoryStats {
	/** The free memory of the allocated amount. */
	free: number;
	/** The used memory of the allocated amount. */
	used: number;
	/** The total allocated memory. */
	allocated: number;
	/** The reservable memory. */
	reservable: number;
}

export interface CPUStats {
	/** The core amount the host machine has. */
	cores: number;
	/** The system load. */
	systemLoad: number;
	/** The lavalink load. */
	lavalinkLoad: number;
}

export interface FrameStats {
	/** The amount of sent frames. */
	sent?: number;
	/** The amount of nulled frames. */
	nulled?: number;
	/** The amount of deficit frames. */
	deficit?: number;
}

export interface LavalinkInfo {
	version: { semver: string; major: number; minor: number; patch: number; preRelease: string };
	buildTime: number;
	git: { branch: string; commit: string; commitTime: number };
	jvm: string;
	lavaplayer: string;
	sourceManagers: string[];
	filters: string[];
	plugins: { name: string; version: string }[];
}
