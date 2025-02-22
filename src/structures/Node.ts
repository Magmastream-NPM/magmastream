import {
	LoadTypes,
	PlayerEvent,
	PlayerEvents,
	SponsorBlockChaptersLoaded,
	SponsorBlockChapterStarted,
	SponsorBlockSegmentSkipped,
	SponsorBlockSegmentsLoaded,
	Structure,
	TrackEndEvent,
	TrackEndReasonTypes,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	WebSocketClosedEvent,
} from "./Utils";
import { Manager, ManagerEventTypes, PlayerStateEventTypes, SearchPlatform } from "./Manager";
import { Player, Track } from "./Player";
import { Rest } from "./Rest";
import nodeCheck from "../utils/nodeCheck";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { ClientUser } from "discord.js";
import axios from "axios";

export enum SponsorBlockSegment {
	Sponsor = "sponsor",
	SelfPromo = "selfpromo",
	Interaction = "interaction",
	Intro = "intro",
	Outro = "outro",
	Preview = "preview",
	MusicOfftopic = "music_offtopic",
	Filler = "filler",
}

const validSponsorBlocks = Object.values(SponsorBlockSegment).map((v) => v.toLowerCase());

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
	/** The manager for the node */
	public manager: Manager;
	/** The node's session ID. */
	public sessionId: string | null;
	/** The REST instance. */
	public readonly rest: Rest;
	/** Actual Lavalink information of the node. */
	public info: LavalinkInfo | null = null;

	private static _manager: Manager;
	private reconnectTimeout?: NodeJS.Timeout;
	private reconnectAttempts = 1;

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
		this.manager.emit(ManagerEventTypes.NodeCreate, this);
		this.rest = new Rest(this, this.manager);

		this.createSessionIdsFile();
		this.loadSessionIds();

		// Create README file to inform the user about the magmastream folder
		this.createReadmeFile();
	}

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
	 * Creates the sessionIds.json file if it doesn't exist. This file is used to
	 * store the session IDs for each node. The session IDs are used to identify
	 * the node when resuming a session.
	 */
	public createSessionIdsFile(): void {
		// If the sessionIds.json file does not exist, create it
		if (!fs.existsSync(sessionIdsFilePath)) {
			this.manager.emit(ManagerEventTypes.Debug, `[NODE] Creating sessionId file at: ${sessionIdsFilePath}`);
			// Create the file with an empty object as the content
			fs.writeFileSync(sessionIdsFilePath, JSON.stringify({}), "utf-8");
		}
	}

	/**
	 * Loads session IDs from the sessionIds.json file if it exists.
	 * The session IDs are used to resume sessions for each node.
	 *
	 * The session IDs are stored in the sessionIds.json file as a composite key
	 * of the node identifier and cluster ID. This allows multiple clusters to
	 * be used with the same node identifier.
	 */
	public loadSessionIds(): void {
		// Check if the sessionIds.json file exists
		if (fs.existsSync(sessionIdsFilePath)) {
			// Emit a debug event indicating that session IDs are being loaded
			this.manager.emit(ManagerEventTypes.Debug, `[NODE] Loading sessionIds from file: ${sessionIdsFilePath}`);

			// Read the content of the sessionIds.json file as a string
			const sessionIdsData = fs.readFileSync(sessionIdsFilePath, "utf-8");

			// Parse the JSON string into an object and convert it into a Map
			sessionIdsMap = new Map(Object.entries(JSON.parse(sessionIdsData)));

			// Check if the session IDs Map contains the session ID for this node
			const compositeKey = `${this.options.identifier}::${this.manager.options.clusterId}`;
			if (sessionIdsMap.has(compositeKey)) {
				// Set the session ID on this node if it exists in the session IDs Map
				this.sessionId = sessionIdsMap.get(compositeKey);
			}
		}
	}

	/**
	 * Updates the session ID in the sessionIds.json file.
	 *
	 * This method is called after the session ID has been updated, and it
	 * writes the new session ID to the sessionIds.json file.
	 *
	 * @remarks
	 * The session ID is stored in the sessionIds.json file as a composite key
	 * of the node identifier and cluster ID. This allows multiple clusters to
	 * be used with the same node identifier.
	 */
	public updateSessionId(): void {
		// Emit a debug event indicating that the session IDs are being updated
		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Updating sessionIds to file: ${sessionIdsFilePath}`);

		// Create a composite key using identifier and clusterId
		const compositeKey = `${this.options.identifier}::${this.manager.options.clusterId}`;

		// Update the session IDs Map with the new session ID
		sessionIdsMap.set(compositeKey, this.sessionId);

		// Write the updated session IDs Map to the sessionIds.json file
		fs.writeFileSync(sessionIdsFilePath, JSON.stringify(Object.fromEntries(sessionIdsMap)));
	}

	/**
	 * Connects to the Node.
	 *
	 * @remarks
	 * If the node is already connected, this method will do nothing.
	 * If the node has a session ID, it will be sent in the headers of the WebSocket connection.
	 * If the node has no session ID but the `resumeStatus` option is true, it will use the session ID
	 * stored in the sessionIds.json file if it exists.
	 */
	public connect(): void {
		if (this.connected) return;

		const headers = {
			Authorization: this.options.password,
			"User-Id": this.manager.options.clientId,
			"Client-Name": this.manager.options.clientName,
		};

		const compositeKey = `${this.options.identifier}::${this.manager.options.clusterId}`;

		if (this.sessionId) {
			headers["Session-Id"] = this.sessionId;
		} else if (this.options.resumeStatus && sessionIdsMap.has(compositeKey)) {
			this.sessionId = sessionIdsMap.get(compositeKey) || null;
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

		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Connecting ${JSON.stringify(debugInfo)}`);
	}

	/**
	 * Destroys the Node and all players connected with it.
	 *
	 * @remarks
	 * This method will:
	 * - Destroy all players connected to the node
	 * - Close the WebSocket connection
	 * - Remove all event listeners on the WebSocket
	 * - Clear the reconnect timeout
	 * - Emit a "nodeDestroy" event with the node as the argument
	 * - Destroy the node from the manager
	 */
	public destroy(): void {
		if (!this.connected) return;

		// Emit a debug event indicating that the node is being destroyed
		const debugInfo = {
			connected: this.connected,
			identifier: this.options.identifier,
			address: this.address,
			sessionId: this.sessionId,
			playerCount: this.manager.players.filter((p) => p.node == this).size,
		};

		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Destroying node: ${JSON.stringify(debugInfo)}`);

		// Automove all players connected to that node
		const players = this.manager.players.filter((p) => p.node == this);
		if (players.size) {
			players.forEach(async (player) => {
				await player.autoMoveNode();
			});
		}

		// Close the WebSocket connection
		this.socket.close(1000, "destroy");

		// Remove all event listeners on the WebSocket
		this.socket.removeAllListeners();

		// Clear the reconnect timeout
		this.reconnectAttempts = 1;
		clearTimeout(this.reconnectTimeout);

		// Emit a "nodeDestroy" event with the node as the argument
		this.manager.emit(ManagerEventTypes.NodeDestroy, this);

		// Destroy the node from the manager
		this.manager.destroyNode(this.options.identifier);
	}

	/**
	 * Attempts to reconnect the node if the connection is lost.
	 *
	 * This method will emit a debug event with the current state of the node and
	 * schedule a reconnection attempt. If the maximum number of retry attempts is reached,
	 * an error event is emitted and the node is destroyed.
	 */
	private reconnect(): void {
		// Collect debug information regarding the current state of the node
		const debugInfo = {
			identifier: this.options.identifier,
			connected: this.connected,
			reconnectAttempts: this.reconnectAttempts,
			retryAmount: this.options.retryAmount,
			retryDelay: this.options.retryDelay,
		};

		// Emit a debug event indicating the node is attempting to reconnect
		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Reconnecting node: ${JSON.stringify(debugInfo)}`);

		// Schedule the reconnection attempt after the specified retry delay
		this.reconnectTimeout = setTimeout(() => {
			// Check if the maximum number of retry attempts has been reached
			if (this.reconnectAttempts >= this.options.retryAmount) {
				// Emit an error event and destroy the node if retries are exhausted
				const error = new Error(`Unable to connect after ${this.options.retryAmount} attempts.`);
				this.manager.emit(ManagerEventTypes.NodeError, this, error);
				return this.destroy();
			}

			// Remove all listeners from the current WebSocket and reset it
			this.socket?.removeAllListeners();
			this.socket = null;

			// Emit a nodeReconnect event and attempt to connect again
			this.manager.emit(ManagerEventTypes.NodeReconnect, this);
			this.connect();

			// Increment the reconnect attempts counter
			this.reconnectAttempts++;
		}, this.options.retryDelay);
	}

	/**
	 * Handles the "open" event emitted by the WebSocket connection.
	 *
	 * This method is called when the WebSocket connection is established.
	 * It clears any existing reconnect timeouts, emits a debug event
	 * indicating the node is connected, and emits a "nodeConnect" event
	 * with the node as the argument.
	 */
	protected open(): void {
		// Clear any existing reconnect timeouts
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

		// Collect debug information regarding the current state of the node
		const debugInfo = {
			identifier: this.options.identifier,
			connected: this.connected,
		};

		// Emit a debug event indicating the node is connected
		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Connected node: ${JSON.stringify(debugInfo)}`);

		// Emit a "nodeConnect" event with the node as the argument
		this.manager.emit(ManagerEventTypes.NodeConnect, this);
	}

	/**
	 * Handles the "close" event emitted by the WebSocket connection.
	 *
	 * This method is called when the WebSocket connection is closed.
	 * It emits a "nodeDisconnect" event with the node and the close event
	 * as arguments and a debug event indicating the node is disconnected.
	 * If the close event was not initiated by the user (i.e. the code is
	 * not 1000 or the reason is not "destroy"), it will attempt to reconnect
	 * to the node.
	 * @param {number} code The close code.
	 * @param {string} reason The close reason.
	 */
	protected async close(code: number, reason: string): Promise<void> {
		const debugInfo = {
			identifier: this.options.identifier,
			code,
			reason,
		};
		// Emit a "nodeDisconnect" event with the node and the close event as arguments
		this.manager.emit(ManagerEventTypes.NodeDisconnect, this, { code, reason });
		// Emit a debug event indicating the node is disconnected
		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Disconnected node: ${JSON.stringify(debugInfo)}`);
		// Try moving all players connected to that node to a useable one

		if (this.manager.useableNode) {
			const players = this.manager.players.filter((p) => p.node.options.identifier == this.options.identifier);
			if (players.size) {
				await Promise.all(Array.from(players.values(), (player) => player.autoMoveNode()));
			}
		}
		// If the close event was not initiated by the user, attempt to reconnect
		if (code !== 1000 || reason !== "destroy") this.reconnect();
	}

	/**
	 * Handles the "error" event emitted by the WebSocket connection.
	 *
	 * This method is called when an error occurs on the WebSocket connection.
	 * It emits a "nodeError" event with the node and the error as arguments and
	 * a debug event indicating the error on the node.
	 * @param {Error} error The error that occurred.
	 */
	protected error(error: Error): void {
		if (!error) return;
		// Collect debug information regarding the error
		const debugInfo = {
			identifier: this.options.identifier,
			error: error.message,
		};
		// Emit a debug event indicating the error on the node
		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Error on node: ${JSON.stringify(debugInfo)}`);
		// Emit a "nodeError" event with the node and the error as arguments
		this.manager.emit(ManagerEventTypes.NodeError, this, error);
	}

	/**
	 * Handles an incoming message from the Lavalink node.
	 * @param {Buffer | string} d The incoming message.
	 */
	protected async message(d: Buffer | string): Promise<void> {
		if (Array.isArray(d)) d = Buffer.concat(d);
		else if (d instanceof ArrayBuffer) d = Buffer.from(d);

		const payload = JSON.parse(d.toString());

		if (!payload.op) return;
		this.manager.emit(ManagerEventTypes.NodeRaw, payload);

		let player: Player;
		switch (payload.op) {
			case "stats":
				delete payload.op;
				this.stats = { ...payload } as unknown as NodeStats;
				break;
			case "playerUpdate":
				player = this.manager.players.get(payload.guildId);
				if (player && player.node.options.identifier !== this.options.identifier) {
					return;
				}
				if (player) player.position = payload.state.position || 0;
				break;
			case "event":
				player = this.manager.players.get(payload.guildId);
				if (player && player.node.options.identifier !== this.options.identifier) {
					return;
				}
				this.manager.emit(ManagerEventTypes.Debug, `[NODE] Node message: ${JSON.stringify(payload)}`);
				this.handleEvent(payload);
				break;
			case "ready":
				this.manager.emit(ManagerEventTypes.Debug, `[NODE] Node message: ${JSON.stringify(payload)}`);
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
				this.manager.emit(ManagerEventTypes.NodeError, this, new Error(`Unexpected op "${payload.op}" with data: ${payload.message}`));
				return;
		}
	}

	/**
	 * Handles an event emitted from the Lavalink node.
	 * @param {PlayerEvent & PlayerEvents} payload The event emitted from the node.
	 * @returns {Promise<void>} A promise that resolves when the event has been handled.
	 * @private
	 */
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
				this.manager.emit(ManagerEventTypes.NodeError, this, error);
				break;
		}
	}

	/**
	 * Emitted when a new track starts playing.
	 * @param {Player} player The player that started playing the track.
	 * @param {Track} track The track that started playing.
	 * @param {TrackStartEvent} payload The payload of the event emitted by the node.
	 * @private
	 */
	protected trackStart(player: Player, track: Track, payload: TrackStartEvent): void {
		const oldPlayer = player;

		player.playing = true;
		player.paused = false;

		this.manager.emit(ManagerEventTypes.TrackStart, player, track, payload);

		const botUser = player.get("Internal_BotUser") as ClientUser;

		if (botUser && botUser.id === track.requester.id) {
			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, player, {
				changeType: PlayerStateEventTypes.TrackChange,
				details: {
					changeType: "autoPlay",
					track: track,
				},
			});
			return;
		}
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, player, {
			changeType: PlayerStateEventTypes.TrackChange,
			details: {
				changeType: "start",
				track: track,
			},
		});
	}

	/**
	 * Emitted when a track ends playing.
	 * @param {Player} player - The player that the track ended on.
	 * @param {Track} track - The track that ended.
	 * @param {TrackEndEvent} payload - The payload of the event emitted by the node.
	 * @private
	 */
	protected async trackEnd(player: Player, track: Track, payload: TrackEndEvent): Promise<void> {
		const { reason } = payload;

		const oldPlayer = player;

		// If the track failed to load or was cleaned up
		const skipFlag = player.get<boolean>("skipFlag");
		if (!skipFlag && (!player.queue.previous.length || player.queue.previous.at(-1) !== player.queue.current)) {
			// Store the current track in the previous tracks queue
			player.queue.previous.unshift(player.queue.current);

			// Limit the previous tracks queue to maxPreviousTracks
			if (player.queue.previous.length > this.manager.options.maxPreviousTracks) {
				player.queue.previous.pop();
			}
		}
		// Handle track end events
		switch (reason) {
			case TrackEndReasonTypes.LoadFailed:
			case TrackEndReasonTypes.Cleanup:
				// Handle the case when a track failed to load or was cleaned up
				this.handleFailedTrack(player, track, payload);
				break;
			case TrackEndReasonTypes.Replaced:
			case TrackEndReasonTypes.Stopped:
				// If the track was forcibly replaced
				if (player.queue.length) {
					this.manager.emit(ManagerEventTypes.TrackEnd, player, track, payload);
				} else {
					await this.queueEnd(player, track, payload);
				}
				break;
			case TrackEndReasonTypes.Finished:
				// If the track ended and it's set to repeat (track or queue)
				if (track && (player.trackRepeat || player.queueRepeat)) {
					this.handleRepeatedTrack(player, track, payload);
					break;
				}
				// If there's another track in the queue
				if (player.queue.length) {
					this.playNextTrack(player, track, payload);
					break;
				} else {
					await this.queueEnd(player, track, payload);
				}
				// If there are no more tracks in the queue
				await this.queueEnd(player, track, payload);
				break;
			default:
				this.manager.emit(ManagerEventTypes.NodeError, this, new Error(`Unexpected track end reason "${reason}"`));
				break;
		}

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, player, {
			changeType: PlayerStateEventTypes.TrackChange,
			details: {
				changeType: "end",
				track: track,
			},
		});
	}

	/**
	 * Handles autoplay logic for a player.
	 * This method is responsible for selecting an appropriate method of autoplay
	 * and executing it. If autoplay is not enabled or all attempts have failed,
	 * it will return false.
	 * @param {Player} player - The player to handle autoplay for.
	 * @param {number} attempt - The current attempt number of the autoplay.
	 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating if autoplay was successful.
	 * @private
	 */
	private async handleAutoplay(player: Player, attempt: number = 0): Promise<boolean> {
		// If autoplay is not enabled or all attempts have failed, early exit
		if (!player.isAutoplay || attempt === player.autoplayTries || !player.queue.previous[0]) return false;

		// Get the Last.fm API key and the available source managers
		const apiKey = this.manager.options.lastFmApiKey;
		const enabledSources = this.info.sourceManagers;

		// Determine if YouTube should be used
		// If Last.fm is not available, use YouTube as a fallback
		// If YouTube is available and this is the last attempt, use YouTube
		const shouldUseYouTube =
			(!apiKey && enabledSources.includes("youtube")) || // Fallback to YouTube if Last.fm is not available
			(attempt === player.autoplayTries - 1 && player.autoplayTries > 1 && enabledSources.includes("youtube")); // Use YouTube on the last attempt

		if (shouldUseYouTube) {
			// Use YouTube-based autoplay
			// return this.handleYouTubeAutoplay(player, player.queue.previous);
			return this.handleYouTubeAutoplay(player, player.queue.previous?.at(-1) ?? null);
		}

		// Handle Last.fm-based autoplay (or other platforms)
		const selectedSource = this.selectPlatform(enabledSources);

		if (selectedSource) {
			// Use the selected source to handle autoplay
			// return this.handlePlatformAutoplay(player, player.queue.previous, selectedSource, apiKey);
			return this.handlePlatformAutoplay(player, player.queue.previous?.at(-1) ?? null, selectedSource, apiKey);
		}

		// If no source is available, return false
		return false;
	}

	/**
	 * Selects a platform from the given enabled sources.
	 * @param {string[]} enabledSources - The enabled sources to select from.
	 * @returns {SearchPlatform | null} - The selected platform or null if none was found.
	 */
	public selectPlatform(enabledSources: string[]): SearchPlatform | null {
		const { autoPlaySearchPlatform } = this.manager.options;
		const platformMapping: { [key in SearchPlatform]: string } = {
			[SearchPlatform.AppleMusic]: "applemusic",
			[SearchPlatform.Bandcamp]: "bandcamp",
			[SearchPlatform.Deezer]: "deezer",
			[SearchPlatform.Jiosaavn]: "jiosaavn",
			[SearchPlatform.SoundCloud]: "soundcloud",
			[SearchPlatform.Spotify]: "spotify",
			[SearchPlatform.Tidal]: "tidal",
			[SearchPlatform.VKMusic]: "vkmusic",
			[SearchPlatform.YouTube]: "youtube",
			[SearchPlatform.YouTubeMusic]: "youtube",
		};

		// Try the autoPlaySearchPlatform first
		if (enabledSources.includes(platformMapping[autoPlaySearchPlatform])) {
			return autoPlaySearchPlatform;
		}

		// Fallback to other platforms in a predefined order
		const fallbackPlatforms = [
			SearchPlatform.Spotify,
			SearchPlatform.Deezer,
			SearchPlatform.SoundCloud,
			SearchPlatform.AppleMusic,
			SearchPlatform.Bandcamp,
			SearchPlatform.Jiosaavn,
			SearchPlatform.Tidal,
			SearchPlatform.VKMusic,
			SearchPlatform.YouTubeMusic,
			SearchPlatform.YouTube,
		];

		for (const platform of fallbackPlatforms) {
			if (enabledSources.includes(platformMapping[platform])) {
				return platform;
			}
		}

		return null;
	}

	/**
	 * Handles Last.fm-based autoplay.
	 * @param {Player} player - The player instance.
	 * @param {Track} previousTrack - The previous track.
	 * @param {SearchPlatform} platform - The selected platform.
	 * @param {string} apiKey - The Last.fm API key.
	 * @returns {Promise<boolean>} - Whether the autoplay was successful.
	 */
	private async handlePlatformAutoplay(player: Player, previousTrack: Track, platform: SearchPlatform, apiKey: string): Promise<boolean> {
		let { author: artist } = previousTrack;
		const { title } = previousTrack;

		if (!artist || !title) {
			if (!title) {
				// No title provided, search for the artist's top tracks
				const noTitleUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
				const response = await axios.get(noTitleUrl);

				if (response.data.error || !response.data.toptracks?.track?.length) return false;

				const randomTrack = response.data.toptracks.track[Math.floor(Math.random() * response.data.toptracks.track.length)];
				const res = await player.search(
					{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: platform },
					player.get("Internal_BotUser") as ClientUser
				);
				if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return false;

				const foundTrack = res.tracks.find((t) => t.uri !== previousTrack.uri);
				if (!foundTrack) return false;

				player.queue.add(foundTrack);
				player.play();
				return true;
			}
			if (!artist) {
				// No artist provided, search for the track title
				const noArtistUrl = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${title}&api_key=${apiKey}&format=json`;
				const response = await axios.get(noArtistUrl);
				artist = response.data.results.trackmatches?.track?.[0]?.artist;
				if (!artist) return false;
			}
		}

		// Search for similar tracks to the current track
		const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${artist}&track=${title}&limit=10&autocorrect=1&api_key=${apiKey}&format=json`;
		let response: axios.AxiosResponse;

		try {
			response = await axios.get(url);
		} catch (error) {
			if (error) return false;
		}

		if (response.data.error || !response.data.similartracks?.track?.length) {
			// Retry the request if the first attempt fails
			const retryUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
			const retryResponse = await axios.get(retryUrl);

			if (retryResponse.data.error || !retryResponse.data.toptracks?.track?.length) return false;

			const randomTrack = retryResponse.data.toptracks.track[Math.floor(Math.random() * retryResponse.data.toptracks.track.length)];
			const res = await player.search(
				{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: platform },
				player.get("Internal_BotUser") as ClientUser
			);
			if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return false;

			const foundTrack = res.tracks.find((t) => t.uri !== previousTrack.uri);
			if (!foundTrack) return false;

			player.queue.add(foundTrack);
			player.play();
			return true;
		}

		const randomTrack = response.data.similartracks.track[Math.floor(Math.random() * response.data.similartracks.track.length)];
		const res = await player.search(
			{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: platform },
			player.get("Internal_BotUser") as ClientUser
		);
		if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return false;

		const foundTrack = res.tracks.find((t) => t.uri !== previousTrack.uri);
		if (!foundTrack) return false;

		player.queue.add(foundTrack);
		player.play();
		return true;
	}

	/**
	 * Handles YouTube-based autoplay.
	 * @param {Player} player - The player instance.
	 * @param {Track} previousTrack - The previous track.
	 * @returns {Promise<boolean>} - Whether the autoplay was successful.
	 */
	private async handleYouTubeAutoplay(player: Player, previousTrack: Track): Promise<boolean> {
		// Check if the previous track has a YouTube URL
		const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => previousTrack.uri.includes(url));
		// Get the video ID from the previous track's URL
		const videoID = hasYouTubeURL
			? previousTrack.uri.split("=").pop()
			: (
					await this.manager.search(
						{ query: `${previousTrack.author} - ${previousTrack.title}`, source: SearchPlatform.YouTube },
						player.get("Internal_BotUser") as ClientUser
					)
			  ).tracks[0]?.uri
					.split("=")
					.pop();

		// If the video ID is not found, return false
		if (!videoID) return false;

		// Get a random video index between 2 and 24
		let randomIndex: number;
		let searchURI: string;
		do {
			// Generate a random index between 2 and 24
			randomIndex = Math.floor(Math.random() * 23) + 2;
			// Build the search URI
			searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}&index=${randomIndex}`;
		} while (previousTrack.uri.includes(searchURI));

		// Search for the video and return false if the search fails
		const res = await this.manager.search({ query: searchURI, source: SearchPlatform.YouTube }, player.get("Internal_BotUser") as ClientUser);
		if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return false;

		// Find a track that is not the same as the current track
		const foundTrack = res.tracks.find((t) => t.uri !== previousTrack.uri && t.author !== previousTrack.author && t.title !== previousTrack.title);
		// If no track is found, return false
		if (!foundTrack) return false;

		// Add the found track to the queue and play it
		player.queue.add(foundTrack);
		player.play();
		return true;
	}
	// Handle the case when a track failed to load or was cleaned up
	private handleFailedTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		// player.queue.previous = player.queue.current;
		player.queue.current = player.queue.shift();

		if (!player.queue.current) {
			this.queueEnd(player, track, payload);
			return;
		}

		this.manager.emit(ManagerEventTypes.TrackEnd, player, track, payload);
		if (this.manager.options.autoPlay) player.play();
	}

	/**
	 * Handles the case when a track ended and it's set to repeat (track or queue)
	 * @param {Player} player - The player that ended the track
	 * @param {Track} track - The track that ended
	 * @param {TrackEndEvent} payload - The track end event payload
	 * @returns {void}
	 * @private
	 */
	private handleRepeatedTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		const { queue, trackRepeat, queueRepeat } = player;
		const { autoPlay } = this.manager.options;

		if (trackRepeat) {
			// Prevent duplicate repeat insertion
			if (queue[0] !== queue.current) {
				queue.unshift(queue.current);
			}
		} else if (queueRepeat) {
			// Prevent duplicate queue insertion
			if (queue[queue.length - 1] !== queue.current) {
				queue.add(queue.current as Track);
			}
		}

		// Move to the next track
		queue.current = queue.shift() as Track;

		// Emit track end event
		this.manager.emit(ManagerEventTypes.TrackEnd, player, track, payload);

		// If the track was stopped manually and no more tracks exist, end the queue
		if (payload.reason === TrackEndReasonTypes.Stopped && !(queue.current = queue.shift())) {
			this.queueEnd(player, track, payload);
			return;
		}

		// If autoplay is enabled, play the next track
		if (autoPlay) player.play();
	}

	/**
	 * Plays the next track in the queue.
	 * Updates the queue by shifting the current track to the previous track
	 * and plays the next track if autoplay is enabled.
	 *
	 * @param {Player} player - The player associated with the track.
	 * @param {Track} track - The track that has ended.
	 * @param {TrackEndEvent} payload - The event payload containing additional data about the track end event.
	 * @returns {void}
	 * @private
	 */
	private playNextTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		// Shift the queue to set the next track as current
		player.queue.current = player.queue.shift();

		// Emit the track end event
		this.manager.emit(ManagerEventTypes.TrackEnd, player, track, payload);

		// If autoplay is enabled, play the next track
		if (this.manager.options.autoPlay) player.play();
	}

	/**
	 * Handles the event when a queue ends.
	 * If autoplay is enabled, attempts to play the next track in the queue using the autoplay logic.
	 * If all attempts fail, resets the player state and emits the `queueEnd` event.
	 * @param {Player} player - The player associated with the track.
	 * @param {Track} track - The track that has ended.
	 * @param {TrackEndEvent} payload - The event payload containing additional data about the track end event.
	 * @returns {Promise<void>} A promise that resolves when the queue end processing is complete.
	 */
	public async queueEnd(player: Player, track: Track, payload: TrackEndEvent): Promise<void> {
		player.queue.current = null;

		if (!player.isAutoplay) {
			player.playing = false;
			this.manager.emit(ManagerEventTypes.QueueEnd, player, track, payload);
			return;
		}

		let attempts = 1;
		let success = false;

		while (attempts <= player.autoplayTries) {
			success = await this.handleAutoplay(player, attempts);
			if (success) return;
			attempts++;
		}

		// If all attempts fail, reset the player state and emit queueEnd
		player.queue.previous = [];
		player.playing = false;
		this.manager.emit(ManagerEventTypes.QueueEnd, player, track, payload);
	}

	/**
	 * Fetches the lyrics of a track from the Lavalink node.
	 * This method uses the `lavalyrics-plugin` to fetch the lyrics.
	 * If the plugin is not available, it will throw a RangeError.
	 *
	 * @param {Track} track - The track to fetch the lyrics for.
	 * @param {boolean} [skipTrackSource=false] - Whether to skip using the track's source URL.
	 * @returns {Promise<Lyrics>} A promise that resolves with the lyrics data.
	 */
	public async getLyrics(track: Track, skipTrackSource: boolean = false): Promise<Lyrics> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "lavalyrics-plugin"))
			throw new RangeError(`there is no lavalyrics-plugin available in the lavalink node: ${this.options.identifier}`);

		// Make a GET request to the Lavalink node to fetch the lyrics
		// The request includes the track URL and the skipTrackSource parameter
		return (
			((await this.rest.get(`/v4/lyrics?track=${encodeURIComponent(track.track)}&skipTrackSource=${skipTrackSource}`)) as Lyrics) || {
				source: null,
				provider: null,
				text: null,
				lines: [],
				plugin: [],
			}
		);
	}

	/**
	 * Handles the event when a track gets stuck during playback.
	 * Stops the current track and emits a `trackStuck` event.
	 *
	 * @param {Player} player - The player associated with the stuck track.
	 * @param {Track} track - The track that has encountered a stuck event.
	 * @param {TrackStuckEvent} payload - The event payload containing additional data about the track stuck event.
	 * @returns {void}
	 * @protected
	 */
	protected trackStuck(player: Player, track: Track, payload: TrackStuckEvent): void {
		player.stop();
		this.manager.emit(ManagerEventTypes.TrackStuck, player, track, payload);
	}

	/**
	 * Handles the event when a track encounters an error during playback.
	 * Stops the current track and emits a `trackError` event.
	 *
	 * @param {Player} player - The player associated with the track that encountered an error.
	 * @param {Track} track - The track that encountered an error.
	 * @param {TrackExceptionEvent} payload - The event payload containing additional data about the track error event.
	 * @returns {void}
	 * @protected
	 */
	protected trackError(player: Player, track: Track, payload: TrackExceptionEvent): void {
		player.stop();
		this.manager.emit(ManagerEventTypes.TrackError, player, track, payload);
	}

	/**
	 * Emitted when the WebSocket connection for a player closes.
	 * The payload of the event will contain the close code and reason if provided.
	 * @param {Player} player - The player associated with the WebSocket connection.
	 * @param {WebSocketClosedEvent} payload - The event payload containing additional data about the WebSocket close event.
	 */
	protected socketClosed(player: Player, payload: WebSocketClosedEvent): void {
		this.manager.emit(ManagerEventTypes.SocketClosed, player, payload);
		this.manager.emit(ManagerEventTypes.Debug, `[NODE] Websocket closed for player: ${player.guildId} with payload: ${JSON.stringify(payload)}`);
	}

	/**
	 * Emitted when the segments for a track are loaded.
	 * The payload of the event will contain the segments.
	 * @param {Player} player - The player associated with the segments.
	 * @param {Track} track - The track associated with the segments.
	 * @param {SponsorBlockSegmentsLoaded} payload - The event payload containing additional data about the segments loaded event.
	 */
	private sponsorBlockSegmentLoaded(player: Player, track: Track, payload: SponsorBlockSegmentsLoaded) {
		return this.manager.emit(ManagerEventTypes.SegmentsLoaded, player, track, payload);
	}

	/**
	 * Emitted when a segment of a track is skipped using the sponsorblock plugin.
	 * The payload of the event will contain the skipped segment.
	 * @param {Player} player - The player associated with the skipped segment.
	 * @param {Track} track - The track associated with the skipped segment.
	 * @param {SponsorBlockSegmentSkipped} payload - The event payload containing additional data about the segment skipped event.
	 */
	private sponsorBlockSegmentSkipped(player: Player, track: Track, payload: SponsorBlockSegmentSkipped) {
		return this.manager.emit(ManagerEventTypes.SegmentSkipped, player, track, payload);
	}

	/**
	 * Emitted when chapters for a track are loaded using the sponsorblock plugin.
	 * The payload of the event will contain the chapters.
	 * @param {Player} player - The player associated with the chapters.
	 * @param {Track} track - The track associated with the chapters.
	 * @param {SponsorBlockChaptersLoaded} payload - The event payload containing additional data about the chapters loaded event.
	 */
	private sponsorBlockChaptersLoaded(player: Player, track: Track, payload: SponsorBlockChaptersLoaded) {
		return this.manager.emit(ManagerEventTypes.ChaptersLoaded, player, track, payload);
	}

	/**
	 * Emitted when a chapter of a track is started using the sponsorblock plugin.
	 * The payload of the event will contain the started chapter.
	 * @param {Player} player - The player associated with the started chapter.
	 * @param {Track} track - The track associated with the started chapter.
	 * @param {SponsorBlockChapterStarted} payload - The event payload containing additional data about the chapter started event.
	 */
	private sponsorBlockChapterStarted(player: Player, track: Track, payload: SponsorBlockChapterStarted) {
		return this.manager.emit(ManagerEventTypes.ChapterStarted, player, track, payload);
	}

	/**
	 * Fetches Lavalink node information.
	 * @returns {Promise<LavalinkInfo>} A promise that resolves to the Lavalink node information.
	 */
	public async fetchInfo(): Promise<LavalinkInfo> {
		return (await this.rest.get(`/v4/info`)) as LavalinkInfo;
	}

	/**
	 * Gets the current sponsorblock segments for a player.
	 * @param {Player} player - The player to get the sponsorblocks for.
	 * @returns {Promise<SponsorBlockSegment[]>} A promise that resolves to the sponsorblock segments.
	 * @throws {RangeError} If the sponsorblock-plugin is not available in the Lavalink node.
	 */
	public async getSponsorBlock(player: Player): Promise<SponsorBlockSegment[]> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "sponsorblock-plugin"))
			throw new RangeError(`there is no sponsorblock-plugin available in the lavalink node: ${this.options.identifier}`);

		return (await this.rest.get(`/v4/sessions/${this.sessionId}/players/${player.guildId}/sponsorblock/categories`)) as SponsorBlockSegment[];
	}

	/**
	 * Sets the sponsorblock segments for a player.
	 * @param {Player} player - The player to set the sponsor blocks for.
	 * @param {SponsorBlockSegment[]} segments - The sponsorblock segments to set. Defaults to `[SponsorBlockSegment.Sponsor, SponsorBlockSegment.SelfPromo]` if not provided.
	 * @returns {Promise<void>} The promise is resolved when the operation is complete.
	 * @throws {RangeError} If the sponsorblock-plugin is not available in the Lavalink node.
	 * @throws {RangeError} If no segments are provided.
	 * @throws {SyntaxError} If an invalid sponsorblock is provided.
	 * @example
	 * ```ts
	 * // use it on the player via player.setSponsorBlock();
	 * player.setSponsorBlock([SponsorBlockSegment.Sponsor, SponsorBlockSegment.SelfPromo]);
	 * ```
	 */
	public async setSponsorBlock(player: Player, segments: SponsorBlockSegment[] = [SponsorBlockSegment.Sponsor, SponsorBlockSegment.SelfPromo]): Promise<void> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "sponsorblock-plugin"))
			throw new RangeError(`there is no sponsorblock-plugin available in the lavalink node: ${this.options.identifier}`);

		if (!segments.length) throw new RangeError("No Segments provided. Did you mean to use 'deleteSponsorBlock'?");

		if (segments.some((v) => !validSponsorBlocks.includes(v.toLowerCase())))
			throw new SyntaxError(`You provided a sponsorblock which isn't valid, valid ones are: ${validSponsorBlocks.map((v) => `'${v}'`).join(", ")}`);

		await this.rest.put(`/v4/sessions/${this.sessionId}/players/${player.guildId}/sponsorblock/categories`, JSON.stringify(segments.map((v) => v.toLowerCase())));
		return;
	}

	/**
	 * Deletes the sponsorblock segments for a player.
	 * @param {Player} player - The player to delete the sponsorblocks for.
	 * @returns {Promise<void>} The promise is resolved when the operation is complete.
	 * @throws {RangeError} If the sponsorblock-plugin is not available in the Lavalink node.
	 */
	public async deleteSponsorBlock(player: Player): Promise<void> {
		if (!this.info.plugins.some((plugin: { name: string }) => plugin.name === "sponsorblock-plugin"))
			throw new RangeError(`there is no sponsorblock-plugin available in the lavalink node: ${this.options.identifier}`);

		await this.rest.delete(`/v4/sessions/${this.sessionId}/players/${player.guildId}/sponsorblock/categories`);
		return;
	}

	/**
	 * Creates a README.md or README.txt file in the magmastream directory
	 * if it doesn't already exist. This file is used to store player data
	 * for autoresume and other features.
	 * @private
	 */
	private createReadmeFile(): void {
		const readmeFilePath = path.join(process.cwd(), "magmastream", "README.md");
		const message = "Please do NOT delete the magmastream/ folder as it is used to store player data for autoresume etc.";

		if (!fs.existsSync(readmeFilePath)) {
			fs.writeFileSync(readmeFilePath, message, "utf-8");
			this.manager.emit(ManagerEventTypes.Debug, `[NODE] Created README file at: ${readmeFilePath}`);
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
	/** The time the lavalink server will wait before it removes the player. */
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

export interface LyricsLine {
	timestamp: number;
	duration: number;
	line: string;
	plugin: object;
}

export interface Lyrics {
	source: string;
	provider: string;
	text?: string;
	lines: LyricsLine[];
	plugin: object[];
}
