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
import { EventEmitter } from "events";
import { Node, NodeOptions } from "./Node";
import { Player, PlayerOptions, Track, UnresolvedTrack } from "./Player";
import { VoiceState } from "..";
import managerCheck from "../utils/managerCheck";
import { ClientUser, User } from "discord.js";

/**
 * The main hub for interacting with Lavalink and using Magmastream.
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

	/** Returns the nodes that have the least load. */
	private get leastLoadNode(): Collection<string, Node> {
		return this.nodes
			.filter((node) => node.connected)
			.sort((a, b) => {
				const aload = a.stats.cpu ? (a.stats.cpu.lavalinkLoad / a.stats.cpu.cores) * 100 : 0;
				const bload = b.stats.cpu ? (b.stats.cpu.lavalinkLoad / b.stats.cpu.cores) * 100 : 0;
				return aload - bload;
			});
	}

	/** Returns the nodes that have the least amount of players. */
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
		return this.options.usePriority
			? this.priorityNode
			: this.options.useNode === "leastLoad"
			? this.leastLoadNode.first()
			: this.leastPlayersNode.first();
	}

	/**
	 * Initiates the Manager class.
	 * @param options
	 */
	constructor(options: ManagerOptions) {
		super();

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
			shards: 1,
			autoPlay: true,
			usePriority: false,
			clientName: "Magmastream",
			defaultSearchPlatform: "youtube",
			useNode: "leastPlayers",
			...options,
		};

		// Load plugins if any are provided
		if (this.options.plugins) {
			for (const [index, plugin] of this.options.plugins.entries()) {
				if (!(plugin instanceof Plugin)) throw new RangeError(`Plugin at index ${index} does not extend Plugin.`);
				plugin.load(this);
			}
		}

		// Initialize and connect nodes
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

		if (!this.options.clientId) throw new Error('"clientId" is not set. Pass it in Manager#init() or as an option in the constructor.');

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
	 * Searches the enabled sources based on the URL or the `source` property.
	 * @param query
	 * @param requester
	 * @returns The search result.
	 */
	public async search(query: string | SearchQuery, requester?: User | ClientUser): Promise<SearchResult> {
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

			let searchData: TrackData[] = [];
			let playlistData: PlaylistRawData | undefined;

			switch (res.loadType) {
				case "search":
					searchData = res.data as TrackData[];
					break;

				case "track":
					searchData = [res.data as TrackData];
					break;

				case "playlist":
					playlistData = res.data as PlaylistRawData;
					break;
			}

			const tracks = searchData.map((track) => TrackUtils.build(track, requester));
			let playlist: PlaylistData | null = null;

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

			// Optionally replace YouTube credentials
			if (this.options.replaceYouTubeCredentials) {
				let tracksToReplace: Track[] = [];
				if (result.loadType === "playlist") {
					tracksToReplace = result.playlist!.tracks;
				} else if (result.loadType === "track" || result.loadType === "search") {
					tracksToReplace = result.tracks;
				}

				tracksToReplace.forEach((track) => {
					const replaceInfo = track.info?.pluginInfo?.replace;
					if (replaceInfo) {
						track.info.uri = replaceInfo.uri;
						track.info.identifier = replaceInfo.identifier;
					}
				});
			}

			return result;
		} catch (err) {
			throw new Error(`Failed to get results for search query ${search} with error: ${err}`);
		}
	}

	/**
	 * Decodes tracks via Lavalink REST.
	 * @param tracks
	 */
	public async decodeTracks(tracks: string[]): Promise<TrackData[]> {
		if (!tracks || !Array.isArray(tracks)) {
			throw new TypeError('The "tracks" parameter must be an array of strings.');
		}

		const node = this.useableNodes;
		if (!node) throw new Error("No available nodes.");

		try {
			const res = await node.rest.post("/v4/decodetracks", tracks);
			return res.data as TrackData[];
		} catch (err) {
			throw new Error(`Failed to decode tracks with error: ${err}`);
		}
	}

	/**
	 * Decodes a single track via Lavalink REST.
	 * @param track
	 */
	public async decodeTrack(track: string): Promise<TrackData> {
		const [trackData] = await this.decodeTracks([track]);
		return trackData;
	}

	/**
	 * Creates a player or returns one if it already exists.
	 * @param options
	 */
	public create(options: PlayerOptions): Player {
		if (this.players.has(options.guild)) return this.players.get(options.guild)!;
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
		this.players.delete(guild)?.destroy();
	}

	/**
	 * Creates a node or returns one if it already exists.
	 * @param options
	 */
	public createNode(options: NodeOptions): Node {
		if (this.nodes.has(options.identifier)) return this.nodes.get(options.identifier)!;
		return new (Structure.get("Node"))(options);
	}

	/**
	 * Returns a node or undefined if it does not exist.
	 * @param identifier
	 */
	public getNode(identifier: string): Node | undefined {
		return this.nodes.get(identifier);
	}

	/**
	 * Destroys a node if it exists.
	 * @param identifier
	 */
	public destroyNode(identifier: string): void {
		this.nodes.delete(identifier)?.destroy();
	}

	/**
	 * Sends voice update data to the Lavalink server.
	 * @param data
	 */
	public updateVoiceState(data: VoiceState): void {
		if (!data || !data.guild_id) return;
		const player = this.players.get(data.guild_id);
		if (player) player.voiceStateUpdate(data);
	}

	/**
	 * Sends a raw voice packet to Lavalink.
	 * @param packet
	 */
	public sendRawVoicePacket(packet: VoicePacket): void {
		if (!packet || !["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(packet.t!)) return;
		const player = this.players.get(packet.d.guild_id);
		if (player) player.rawVoiceUpdate(packet);
	}

	/**
	 * Changes your self deafen status.
	 * @param guild
	 * @param state
	 */
	public setDeafen(guild: string, state: boolean): void {
		const player = this.players.get(guild);
		if (player) player.setSelfDeaf(state);
	}

	/**
	 * Changes your self mute status.
	 * @param guild
	 * @param state
	 */
	public setMute(guild: string, state: boolean): void {
		const player = this.players.get(guild);
		if (player) player.setSelfMute(state);
	}
}

export interface ManagerOptions {
	clientId?: string;
	plugins?: Plugin[];
	clientName?: string;
	nodes?: NodeOptions[];
	shards?: number;
	autoPlay?: boolean;
	trackPartial?: string[];
	useNode?: "leastLoad" | "leastPlayers";
	usePriority?: boolean;
	defaultSearchPlatform?: SearchPlatform;
	replaceYouTubeCredentials?: boolean;
}

export type ManagerEvents = {
	nodeConnect: [node: Node];
	nodeReconnect: [node: Node];
	nodeDestroy: [node: Node, code: number, reason: Buffer | string];
	nodeError: [node: Node, error: Error];
	nodeRaw: [node: Node, payload: unknown];
	playerCreate: [player: Player];
	playerDestroy: [player: Player];
	playerMove: [player: Player, oldChannel: string, newChannel: string];
	playerDisconnect: [player: Player, oldChannel: string, newChannel: string];
	playerConnect: [player: Player];
	playerQueueEnd: [player: Player, track: Track];
	trackStart: [player: Player, track: Track, event: TrackStartEvent];
	trackEnd: [player: Player, track: Track, event: TrackEndEvent];
	trackError: [player: Player, track: Track, event: TrackExceptionEvent];
	trackStuck: [player: Player, track: Track, event: TrackStuckEvent];
	queueEnd: [player: Player];
	playerResume: [player: Player];
	playerPause: [player: Player];
	playerPing: [player: Player];
	wsClosed: [player: Player, event: WebSocketClosedEvent];
};
