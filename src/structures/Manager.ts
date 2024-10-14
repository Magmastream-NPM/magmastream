/* eslint-disable no-async-promise-executor */
import {
	LoadType,
	Plugin,
	Structure,
	TrackData,
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	TrackUtils,
	VoicePacket,
	VoiceServer,
	WebSocketClosedEvent,
} from "./Utils";
import { Collection } from "@discordjs/collection";
import { SponsorBlockChapterStarted, SponsorBlockChaptersLoaded, SponsorBlockSegmentSkipped, SponsorBlockSegmentsLoaded } from "./Utils";
import { EventEmitter } from "events";
import { Node, NodeOptions } from "./Node";
import { Player, PlayerOptions, Track, UnresolvedTrack } from "./Player";
import { VoiceState } from "..";
import managerCheck from "../utils/managerCheck";
import { ClientUser, User } from "discord.js";
import { blockedWords } from "../config/blockedWords";
import fs from "fs";
import path from "path";

/**
 * The main hub for interacting with Lavalink and using Magmastream,
 */
export class Manager extends EventEmitter {
	public on<T extends keyof ManagerEvents>(event: T, listener: (...args: ManagerEvents[T]) => void): this {
		return super.on(event, listener);
	}

	public static readonly DEFAULT_SOURCES: Record<SearchPlatform, string> = {
		"youtube music": "ytmsearch",
		youtube: "ytsearch",
		spotify: "spsearch",
		jiosaavn: "jssearch",
		soundcloud: "scsearch",
		deezer: "dzsearch",
		tidal: "tdsearch",
		applemusic: "amsearch",
		bandcamp: "bcsearch",
	};

	/** The map of players. */
	public readonly players = new Collection<string, Player>();
	/** The map of nodes. */
	public readonly nodes = new Collection<string, Node>();
	/** The options that were set. */
	public readonly options: ManagerOptions;
	private initiated = false;

	/** Loads player states from the JSON file. */
	public async loadPlayerStates(nodeId: string): Promise<void> {
		// Changed to async and added Promise<void>
		const node = this.nodes.get(nodeId);
		if (!node) throw new Error(`Could not find node: ${nodeId}`);

		const info = (await node.rest.getAllPlayers()) as LavaPlayer[];

		const playerStatesDir = path.join(process.cwd(), "node_modules", "magmastream", "dist", "sessionData", "players");

		if (!fs.existsSync(playerStatesDir)) {
			fs.mkdirSync(playerStatesDir, { recursive: true });
			console.log(`Created directory at ${playerStatesDir}`);
		}

		const playerFiles = fs.readdirSync(playerStatesDir);

		const createTrackData = (song): TrackData => ({
			encoded: song.track,
			info: {
				identifier: song.identifier,
				isSeekable: song.isSeekable,
				author: song.author,
				length: song.duration,
				isrc: song.isrc,
				isStream: song.isStream,
				title: song.title,
				uri: song.uri,
				artworkUrl: song.artworkUrl,
				sourceName: song.sourceName,
			},
			pluginInfo: song.pluginInfo,
		});

		for (const file of playerFiles) {
			const filePath = path.join(playerStatesDir, file);
			const data = fs.readFileSync(filePath, "utf-8");
			const state = JSON.parse(data);

			if (state && typeof state === "object" && state.guild && state.node.options.identifier === nodeId) {
				const lavaPlayer = info.find((player) => player.guildId === state.guild);
				if (!lavaPlayer) {
					this.destroy(state.guild);
					continue;
				}
				const playerOptions: PlayerOptions = {
					guild: state.options.guild,
					textChannel: state.options.textChannel,
					voiceChannel: state.options.voiceChannel,
					selfDeafen: state.options.selfDeafen,
					volume: state.options.volume,
				};

				this.create(playerOptions);

				const player = this.get(state.options.guild);
				if (!lavaPlayer.state.connected) {
					try {
						player.connect();
					} catch (error) {
						console.log(error);
						continue;
					}
				}

				const tracks = [];

				if (!lavaPlayer.track) {
					if (state.queue.current !== null) {
						for (const key in state.queue) {
							if (!isNaN(Number(key)) && key !== "current" && key !== "previous" && key !== "manager") {
								const song = state.queue[key];
								tracks.push(TrackUtils.build(createTrackData(song), song.requester));
							}
						}

						if (tracks.length > 0) {
							if (player.state !== "CONNECTED") player.connect();
							player.queue.add(tracks);
							if (!state.paused && player.state === "CONNECTED") player.play();
							else console.log(player.state);
						} else {
							const payload = {
								reason: "finished",
							};
							node.queueEnd(player, state.queue.current, payload as TrackEndEvent);
							continue;
						}
					} else {
						if (state.queue.previous !== null) {
							const payload = {
								reason: "finished",
							};
							node.queueEnd(player, state.queue.previous, payload as TrackEndEvent);
						} else this.destroy(state.guild);
					}
				} else {
					const currentTrack = state.queue.current;
					tracks.push(TrackUtils.build(createTrackData(currentTrack), currentTrack.requester));

					for (const key in state.queue) {
						if (!isNaN(Number(key)) && key !== "current" && key !== "previous" && key !== "manager") {
							const song = state.queue[key];
							tracks.push(TrackUtils.build(createTrackData(song), song.requester));
						}
					}
					if (player.state !== "CONNECTED") player.connect();
					player.queue.add(tracks);
				}

				if (state.paused) player.pause(true);
				player.setTrackRepeat(state.trackRepeat);
				player.setQueueRepeat(state.queueRepeat);
				if (state.dynamicRepeat) {
					player.setDynamicRepeat(state.dynamicRepeat, state.dynamicLoopInterval._idleTimeout);
				}
				if (state.isAutoplay) {
					player.setAutoplay(state.isAutoplay, state.data.Internal_BotUser);
				}
				console.log(`Loaded player state for ${state.options.guild}.`);
			}
		}

		console.log("Finished loading player states from player files.");
	}

	/** Gets each player's JSON file */
	private getPlayerFilePath(guildId: string): string {
		const playerStateFilePath = path.join(process.cwd(), "node_modules", "magmastream", "dist", "sessionData", "players", `${guildId}.json`);
		const configDir = path.dirname(playerStateFilePath);
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
			console.log(`Created directory at: ${configDir}`);
		}
		return playerStateFilePath;
	}

	/** Saves player states to the JSON file. */
	public savePlayerState(guildId: string): void {
		const playerStateFilePath = this.getPlayerFilePath(guildId);

		const player = this.players.get(guildId);
		if (!player || player.state === "DISCONNECTED" || !player.voiceChannel) return this.cleanupInactivePlayers();
		const serializedPlayer = this.serializePlayer(player) as unknown as Player;
		fs.writeFileSync(playerStateFilePath, JSON.stringify(serializedPlayer, null, 2), "utf-8");

		console.log(`Saved ${guildId} player state to: ${playerStateFilePath}`);
	}

	/** Serializes a Player instance to avoid circular references. */
	private serializePlayer(player: Player): Record<string, unknown> {
		const seen = new WeakSet();

		const serialize = (obj: unknown): unknown => {
			if (obj && typeof obj === "object") {
				if (seen.has(obj)) return;

				seen.add(obj);
			}
			return obj;
		};

		const serializedPlayer = JSON.parse(
			JSON.stringify(player, (key, value) => {
				if (key === "filters" || key === "manager") {
					return null;
				}

				if (key === "queue") {
					return {
						...value,
						current: value.current || null,
					};
				}

				return serialize(value);
			})
		);

		return serializedPlayer;
	}

	/** Check for players that are no longer active */
	private cleanupInactivePlayers(): void {
		const playerStatesDir = path.join(process.cwd(), "node_modules", "magmastream", "dist", "sessionData", "players");

		// Create the directory if it does not exist
		if (!fs.existsSync(playerStatesDir)) {
			fs.mkdirSync(playerStatesDir, { recursive: true });
			console.log(`Created directory at ${playerStatesDir}`);
		}

		const playerFiles = fs.readdirSync(playerStatesDir);

		const activeGuildIds = new Set(this.players.keys());

		for (const file of playerFiles) {
			const guildId = path.basename(file, ".json");

			if (!activeGuildIds.has(guildId)) {
				const filePath = path.join(playerStatesDir, file);
				fs.unlinkSync(filePath);
				console.log(`Deleted inactive player state file: ${filePath}`);
			}
		}
	}

	/** Returns the nodes that has the least load. */
	private get leastLoadNode(): Collection<string, Node> {
		return this.nodes
			.filter((node) => node.connected)
			.sort((a, b) => {
				const aload = a.stats.cpu ? (a.stats.cpu.lavalinkLoad / a.stats.cpu.cores) * 100 : 0;
				const bload = b.stats.cpu ? (b.stats.cpu.lavalinkLoad / b.stats.cpu.cores) * 100 : 0;
				return aload - bload;
			});
	}

	/** Returns the nodes that has the least amount of players. */
	private get leastPlayersNode(): Collection<string, Node> {
		return this.nodes.filter((node) => node.connected).sort((a, b) => a.stats.players - b.stats.players);
	}

	/** Returns a node based on priority. */
	private get priorityNode(): Node {
		const filteredNodes = this.nodes.filter((node) => node.connected && node.options.priority > 0);
		const totalWeight = filteredNodes.reduce((total, node) => total + node.options.priority, 0);
		const weightedNodes = filteredNodes.map((node) => ({
			node,
			weight: node.options.priority / totalWeight,
		}));
		const randomNumber = Math.random();

		let cumulativeWeight = 0;

		for (const { node, weight } of weightedNodes) {
			cumulativeWeight += weight;
			if (randomNumber <= cumulativeWeight) {
				return node;
			}
		}

		return this.options.useNode === "leastLoad" ? this.leastLoadNode.first() : this.leastPlayersNode.first();
	}

	/** Returns the node to use. */
	public get useableNodes(): Node {
		return this.options.usePriority ? this.priorityNode : this.options.useNode === "leastLoad" ? this.leastLoadNode.first() : this.leastPlayersNode.first();
	}

	private lastProcessedGuilds: Set<string> = new Set();
	private lastSaveTimes: Map<string, number> = new Map();
	private saveInterval: number = 1000;
	private saveQueues: Map<string, Player[]> = new Map();

	/** Register savePlayerStates events */
	private registerPlayerStateEvents(): void {
		const events: (keyof ManagerEvents)[] = ["playerStateUpdate", "playerDestroy"];
		for (const event of events) {
			this.on(event, (player: Player) => this.handleEvent(event, player));
		}
	}

	private handleEvent(event: keyof ManagerEvents, player: Player): void {
		switch (event) {
			case "playerDestroy":
				this.lastSaveTimes.delete(player.guild);
				this.players.delete(player.guild);
				this.cleanupInactivePlayers();
				break;
			case "playerStateUpdate":
				this.queuePlayerStateSave(player);
				break;
			default:
				this.savePlayerState(player.guild);
				break;
		}
	}

	/** Queues a player state save */
	private queuePlayerStateSave(player: Player): void {
		const guildId = player.guild;

		// If the current guild is not being processed, save immediately
		if (!this.lastProcessedGuilds.has(guildId)) {
			this.lastProcessedGuilds.add(guildId);
			this.savePlayerState(guildId);

			setTimeout(() => {
				this.lastProcessedGuilds.delete(guildId);
				this.processNextQueue(guildId);
			}, this.saveInterval);
		} else {
			if (!this.saveQueues.has(guildId)) {
				this.saveQueues.set(guildId, []);
			}

			this.saveQueues.get(guildId)!.push(player);
		}
	}

	/** Processes the next queued save for a specific guild */
	private processNextQueue(guildId: string): void {
		const queue = this.saveQueues.get(guildId);
		if (queue && queue.length > 0) {
			const player = queue.shift()!;
			this.savePlayerState(player.guild);

			if (queue.length === 0) {
				this.saveQueues.delete(guildId);
			}

			setTimeout(() => this.processNextQueue(guildId), this.saveInterval);
		} else {
			this.lastProcessedGuilds.delete(guildId);
		}
	}

	/**
	 * Initiates the Manager class.
	 * @param options
	 */
	constructor(options: ManagerOptions) {
		super();

		this.registerPlayerStateEvents();

		managerCheck(options);

		Structure.get("Player").init(this);
		Structure.get("Node").init(this);
		TrackUtils.init(this);

		if (options.trackPartial) {
			TrackUtils.setTrackPartial(options.trackPartial);
			delete options.trackPartial;
		}

		this.options = {
			plugins: [],
			nodes: [
				{
					identifier: "default",
					host: "localhost",
					resumeStatus: false,
					resumeTimeout: 1000,
				},
			],
			autoPlay: true,
			usePriority: false,
			clientName: "Magmastream",
			defaultSearchPlatform: "youtube",
			useNode: "leastPlayers",
			...options,
		};

		if (this.options.plugins) {
			for (const [index, plugin] of this.options.plugins.entries()) {
				if (!(plugin instanceof Plugin)) throw new RangeError(`Plugin at index ${index} does not extend Plugin.`);
				plugin.load(this);
			}
		}

		if (this.options.nodes) {
			for (const nodeOptions of this.options.nodes) new (Structure.get("Node"))(nodeOptions);
		}
	}

	/**
	 * Initiates the Manager.
	 * @param clientId
	 */
	public init(clientId?: string): this {
		if (this.initiated) return this;
		if (typeof clientId !== "undefined") this.options.clientId = clientId;

		if (typeof this.options.clientId !== "string") throw new Error('"clientId" set is not type of "string"');

		if (!this.options.clientId) throw new Error('"clientId" is not set. Pass it in Manager#init() or as a option in the constructor.');

		for (const node of this.nodes.values()) {
			try {
				node.connect();
			} catch (err) {
				this.emit("nodeError", node, err);
			}
		}

		this.initiated = true;
		return this;
	}

	/**
	 * Searches the enabled sources based off the URL or the `source` property.
	 * @param query
	 * @param requester
	 * @returns The search result.
	 */
	public async search<T = User | ClientUser>(query: string | SearchQuery, requester?: T): Promise<SearchResult> {
		const node = this.useableNodes;

		if (!node) {
			throw new Error("No available nodes.");
		}

		const _query: SearchQuery = typeof query === "string" ? { query } : query;
		const _source = Manager.DEFAULT_SOURCES[_query.source ?? this.options.defaultSearchPlatform] ?? _query.source;

		let search = _query.query;

		if (!/^https?:\/\//.test(search)) {
			search = `${_source}:${search}`;
		}

		try {
			const res = (await node.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(search)}`)) as LavalinkResponse;

			if (!res) {
				throw new Error("Query not found.");
			}

			let searchData = [];
			let playlistData: PlaylistRawData | undefined;

			switch (res.loadType) {
				case "search":
					searchData = res.data as TrackData[];
					break;

				case "track":
					searchData = [res.data as TrackData[]];
					break;

				case "playlist":
					playlistData = res.data as PlaylistRawData;
					break;
			}

			const tracks = searchData.map((track) => TrackUtils.build(track, requester));
			let playlist = null;

			if (res.loadType === "playlist") {
				playlist = {
					name: playlistData!.info.name,
					tracks: playlistData!.tracks.map((track) => TrackUtils.build(track, requester)),
					duration: playlistData!.tracks.reduce((acc, cur) => acc + (cur.info.length || 0), 0),
				};
			}

			const result: SearchResult = {
				loadType: res.loadType,
				tracks,
				playlist,
			};

			if (this.options.replaceYouTubeCredentials) {
				const replaceCreditsURLs = ["youtube.com", "youtu.be"];

				const processTrack = (track: Track) => {
					if (!replaceCreditsURLs.some((url) => track.uri.includes(url))) return track;

					const { cleanTitle, cleanAuthor } = this.parseYouTubeTitle(track.title, track.author);
					track.title = cleanTitle;
					track.author = cleanAuthor;
					return track;
				};

				if (result.loadType === "playlist") {
					result.playlist.tracks = result.playlist.tracks.map(processTrack);
				} else {
					result.tracks = result.tracks.map(processTrack);
				}
			}

			return result;
		} catch (err) {
			throw new Error(err);
		}
	}

	private parseYouTubeTitle(title: string, originalAuthor: string): { cleanTitle: string; cleanAuthor: string } {
		// Remove "- Topic" from author and "Topic -" from title
		const cleanAuthor = originalAuthor.replace("- Topic", "").trim();
		title = title.replace("Topic -", "").trim();

		// Remove blocked words and phrases
		const escapedBlockedWords = blockedWords.map((word) => this.escapeRegExp(word));
		const blockedWordsPattern = new RegExp(`\\b(${escapedBlockedWords.join("|")})\\b`, "gi");
		title = title.replace(blockedWordsPattern, "").trim();

		// Remove empty brackets and balance remaining brackets
		title = title
			.replace(/[([{]\s*[)\]}]/g, "") // Empty brackets
			.replace(/^[^\w\d]*|[^\w\d]*$/g, "") // Leading/trailing non-word characters
			.replace(/\s{2,}/g, " ") // Multiple spaces
			.trim();

		// Remove '@' symbol before usernames
		title = title.replace(/@(\w+)/g, "$1");

		// Balance remaining brackets
		title = this.balanceBrackets(title);

		// Check if the title contains a hyphen, indicating potential "Artist - Title" format
		if (title.includes(" - ")) {
			const [artist, songTitle] = title.split(" - ").map((part) => part.trim());

			// If the artist part matches or is included in the clean author, use the clean author
			if (artist.toLowerCase() === cleanAuthor.toLowerCase() || cleanAuthor.toLowerCase().includes(artist.toLowerCase())) {
				return { cleanAuthor, cleanTitle: songTitle };
			}

			// If the artist is different, keep both parts
			return { cleanAuthor: artist, cleanTitle: songTitle };
		}

		// If no clear artist-title separation, return clean author and cleaned title
		return { cleanAuthor, cleanTitle: title };
	}

	private balanceBrackets(str: string): string {
		const stack: string[] = [];
		const openBrackets = "([{";
		const closeBrackets = ")]}";
		let result = "";

		for (const char of str) {
			if (openBrackets.includes(char)) {
				stack.push(char);
				result += char;
			} else if (closeBrackets.includes(char)) {
				if (stack.length > 0 && openBrackets.indexOf(stack[stack.length - 1]) === closeBrackets.indexOf(char)) {
					stack.pop();
					result += char;
				}
			} else {
				result += char;
			}
		}

		// Close any remaining open brackets
		while (stack.length > 0) {
			const lastOpen = stack.pop()!;
			result += closeBrackets[openBrackets.indexOf(lastOpen)];
		}

		return result;
	}

	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * Decodes the base64 encoded tracks and returns a TrackData array.
	 * @param tracks
	 */
	public decodeTracks(tracks: string[]): Promise<TrackData[]> {
		return new Promise(async (resolve, reject) => {
			const node = this.nodes.first();
			if (!node) throw new Error("No available nodes.");

			const res = (await node.rest.post("/v4/decodetracks", JSON.stringify(tracks)).catch((err) => reject(err))) as TrackData[];

			if (!res) {
				return reject(new Error("No data returned from query."));
			}

			return resolve(res);
		});
	}

	/**
	 * Decodes the base64 encoded track and returns a TrackData.
	 * @param track
	 */
	public async decodeTrack(track: string): Promise<TrackData> {
		const res = await this.decodeTracks([track]);
		return res[0];
	}

	/**
	 * Creates a player or returns one if it already exists.
	 * @param options
	 */
	public create(options: PlayerOptions): Player {
		if (this.players.has(options.guild)) {
			return this.players.get(options.guild);
		}

		return new (Structure.get("Player"))(options);
	}

	/**
	 * Returns a player or undefined if it does not exist.
	 * @param guild
	 */
	public get(guild: string): Player | undefined {
		return this.players.get(guild);
	}

	/**
	 * Destroys a player if it exists.
	 * @param guild
	 */
	public destroy(guild: string): void {
		this.players.delete(guild);
		this.cleanupInactivePlayers();
	}

	/**
	 * Creates a node or returns one if it already exists.
	 * @param options
	 */
	public createNode(options: NodeOptions): Node {
		if (this.nodes.has(options.identifier || options.host)) {
			return this.nodes.get(options.identifier || options.host);
		}

		return new (Structure.get("Node"))(options);
	}

	/**
	 * Destroys a node if it exists.
	 * @param identifier
	 */
	public destroyNode(identifier: string): void {
		const node = this.nodes.get(identifier);
		if (!node) return;
		node.destroy();
		this.nodes.delete(identifier);
	}

	/**
	 * Sends voice data to the Lavalink server.
	 * @param data
	 */
	public async updateVoiceState(data: VoicePacket | VoiceServer | VoiceState): Promise<void> {
		if ("t" in data && !["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(data.t)) return;

		const update = "d" in data ? data.d : data;

		if (!update || (!("token" in update) && !("session_id" in update))) return;

		const player = this.players.get(update.guild_id);

		if (!player) return;
		if ("token" in update) {
			player.voiceState.event = update;

			const {
				sessionId,
				event: { token, endpoint },
			} = player.voiceState;

			await player.node.rest.updatePlayer({
				guildId: player.guild,
				data: { voice: { token, endpoint, sessionId } },
			});

			return;
		}

		if (update.user_id !== this.options.clientId) return;
		if (update.channel_id) {
			if (player.voiceChannel !== update.channel_id) {
				this.emit("playerMove", player, player.voiceChannel, update.channel_id);
			}

			player.voiceState.sessionId = update.session_id;
			player.voiceChannel = update.channel_id;
			return;
		}

		this.emit("playerDisconnect", player, player.voiceChannel);
		player.voiceChannel = null;
		player.voiceState = Object.assign({});
		player.destroy();
		return;
	}
}

export interface Payload {
	/** The OP code */
	op: number;
	d: {
		guild_id: string;
		channel_id: string | null;
		self_mute: boolean;
		self_deaf: boolean;
	};
}

export interface ManagerOptions {
	/** Use priority mode over least amount of player or load? */
	usePriority?: boolean;
	/** Use the least amount of players or least load? */
	useNode?: "leastLoad" | "leastPlayers";
	/** The array of nodes to connect to. */
	nodes?: NodeOptions[];
	/** The client ID to use. */
	clientId?: string;
	/** Value to use for the `Client-Name` header. */
	clientName?: string;
	/** A array of plugins to use. */
	plugins?: Plugin[];
	/** Whether players should automatically play the next song. */
	autoPlay?: boolean;
	/** An array of track properties to keep. `track` will always be present. */
	trackPartial?: string[];
	/** The default search platform to use, can be "youtube", "youtube music", "soundcloud" or deezer. */
	defaultSearchPlatform?: SearchPlatform;
	/** Whether the YouTube video titles should be replaced if the Author does not exactly match. */
	replaceYouTubeCredentials?: boolean;
	/**
	 * Function to send data to the websocket.
	 * @param id
	 * @param payload
	 */
	send(id: string, payload: Payload): void;
}

export type SearchPlatform = "deezer" | "soundcloud" | "youtube music" | "youtube" | "spotify" | "jiosaavn" | "tidal" | "applemusic" | "bandcamp";

export type PlayerStateEventType =
	| "connectionChange"
	| "playerCreate"
	| "playerDestroy"
	| "channelChange"
	| "volumeChange"
	| "pauseChange"
	| "queueChange"
	| "trackChange"
	| "repeatChange"
	| "autoplayChange";

export interface SearchQuery {
	/** The source to search from. */
	source?: SearchPlatform | string;
	/** The query to search for. */
	query: string;
}

export interface LavalinkResponse {
	loadType: LoadType;
	data: TrackData[] | PlaylistRawData;
}

interface LavaPlayer {
	guildId: string;
	track: TrackData | Track;
	volume: number;
	paused: boolean;
	state: {
		time: number;
		position: number;
		connected: boolean;
		ping: number;
	};
	voice: {
		token: string;
		endpoint: string;
		sessionId: string;
	};
	filters: Record<string, unknown>;
}

export interface SearchResult {
	/** The load type of the result. */
	loadType: LoadType;
	/** The array of tracks from the result. */
	tracks: Track[];
	/** The playlist info if the load type is 'playlist'. */
	playlist?: PlaylistData;
}

export interface PlaylistRawData {
	info: {
		/** The playlist name. */
		name: string;
	};
	/** Addition info provided by plugins. */
	pluginInfo: object;
	/** The tracks of the playlist */
	tracks: TrackData[];
}

export interface PlaylistData {
	/** The playlist name. */
	name: string;
	/** The length of the playlist. */
	duration: number;
	/** The songs of the playlist. */
	tracks: Track[];
}

export interface ManagerEvents {
	nodeCreate: [node: Node];
	nodeDestroy: [node: Node];
	nodeConnect: [node: Node];
	nodeReconnect: [node: Node];
	nodeDisconnect: [node: Node, reason: { code?: number; reason?: string }];
	nodeError: [node: Node, error: Error];
	nodeRaw: [payload: unknown];
	playerCreate: [player: Player];
	playerDestroy: [player: Player];
	playerStateUpdate: [oldPlayer: Player, newPlayer: Player, changeType: PlayerStateEventType];
	playerMove: [player: Player, initChannel: string, newChannel: string];
	playerDisconnect: [player: Player, oldChannel: string];
	queueEnd: [player: Player, track: Track | UnresolvedTrack, payload: TrackEndEvent];
	socketClosed: [player: Player, payload: WebSocketClosedEvent];
	trackStart: [player: Player, track: Track, payload: TrackStartEvent];
	trackEnd: [player: Player, track: Track, payload: TrackEndEvent];
	trackStuck: [player: Player, track: Track, payload: TrackStuckEvent];
	trackError: [player: Player, track: Track | UnresolvedTrack, payload: TrackExceptionEvent];
	segmentsLoaded: [player: Player, track: Track | UnresolvedTrack, payload: SponsorBlockSegmentsLoaded];
	segmentSkipped: [player: Player, track: Track | UnresolvedTrack, payload: SponsorBlockSegmentSkipped];
	chapterStarted: [player: Player, track: Track | UnresolvedTrack, payload: SponsorBlockChapterStarted];
	chaptersLoaded: [player: Player, track: Track | UnresolvedTrack, payload: SponsorBlockChaptersLoaded];
}
