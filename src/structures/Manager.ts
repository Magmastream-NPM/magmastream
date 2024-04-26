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

/**
 * The main hub for interacting with Lavalink and using Magmastream,
 */
export class Manager extends EventEmitter {
  /**
   * Emitted when a Node is created.
   * @event Manager#nodeCreate
   */
  public on(event: "nodeCreate", listener: (node: Node) => void): this;

  /**
   * Emitted when a Node is destroyed.
   * @event Manager#nodeDestroy
   */
  public on(event: "nodeDestroy", listener: (node: Node) => void): this;

  /**
   * Emitted when a Node connects.
   * @event Manager#nodeConnect
   */
  public on(event: "nodeConnect", listener: (node: Node) => void): this;

  /**
   * Emitted when a Node reconnects.
   * @event Manager#nodeReconnect
   */
  public on(event: "nodeReconnect", listener: (node: Node) => void): this;

  /**
   * Emitted when a Node disconnects.
   * @event Manager#nodeDisconnect
   */
  public on(
    event: "nodeDisconnect",
    listener: (node: Node, reason: { code?: number; reason?: string }) => void
  ): this;

  /**
   * Emitted when a Node has an error.
   * @event Manager#nodeError
   */
  public on(
    event: "nodeError",
    listener: (node: Node, error: Error) => void
  ): this;

  /**
   * Emitted whenever any Lavalink event is received.
   * @event Manager#nodeRaw
   */
  public on(event: "nodeRaw", listener: (payload: unknown) => void): this;

  /**
   * Emitted when a player is created.
   * @event Manager#playerCreate
   */
  public on(event: "playerCreate", listener: (player: Player) => void): this;

  /**
   * Emitted when a player is destroyed.
   * @event Manager#playerDestroy
   */
  public on(event: "playerDestroy", listener: (player: Player) => void): this;

  /**
   * Emitted when the state of the player has been changed.
   * https://github.com/Blackfort-Hosting/magmastream/issues/16
   * @event Manager#playerStateUpdate
   */
  public on(
    event: "playerStateUpdate",
    listener: (oldPlayer: Player, newPlayer: Player) => void
  ): this;

  /**
   * Emitted when a player is moved to a new voice channel.
   * @event Manager#playerMove
   */
  public on(
    event: "playerMove",
    listener: (player: Player, initChannel: string, newChannel: string) => void
  ): this;

  /**
   * Emitted when a player is disconnected from it's current voice channel.
   * @event Manager#playerDisconnect
   */
  public on(
    event: "playerDisconnect",
    listener: (player: Player, oldChannel: string) => void
  ): this;

  /**
   * Emitted when a player queue ends.
   * @event Manager#queueEnd
   */
  public on(
    event: "queueEnd",
    listener: (
      player: Player,
      track: Track | UnresolvedTrack,
      payload: TrackEndEvent
    ) => void
  ): this;

  /**
   * Emitted when a voice connection is closed.
   * @event Manager#socketClosed
   */
  public on(
    event: "socketClosed",
    listener: (player: Player, payload: WebSocketClosedEvent) => void
  ): this;

  /**
   * Emitted when a track starts.
   * @event Manager#trackStart
   */
  public on(
    event: "trackStart",
    listener: (player: Player, track: Track, payload: TrackStartEvent) => void
  ): this;

  /**
   * Emitted when a track ends.
   * @event Manager#trackEnd
   */
  public on(
    event: "trackEnd",
    listener: (player: Player, track: Track, payload: TrackEndEvent) => void
  ): this;

  /**
   * Emitted when a track gets stuck during playback.
   * @event Manager#trackStuck
   */
  public on(
    event: "trackStuck",
    listener: (player: Player, track: Track, payload: TrackStuckEvent) => void
  ): this;

  /**
   * Emitted when a track has an error during playback.
   * @event Manager#trackError
   */
  public on(
    event: "trackError",
    listener: (
      player: Player,
      track: Track | UnresolvedTrack,
      payload: TrackExceptionEvent
    ) => void
  ): this;

  public on<T extends keyof ManagerEvents>(
    event: T,
    listener: ManagerEvents[T]
  ): this {
    return super.on(event, listener);
  }

  public static readonly DEFAULT_SOURCES: Record<SearchPlatform, string> = {
    "youtube music": "ytmsearch",
    youtube: "ytsearch",
    soundcloud: "scsearch",
    deezer: "dzsearch",
  };

  /** The map of players. */
  public readonly players = new Collection<string, Player>();
  /** The map of nodes. */
  public readonly nodes = new Collection<string, Node>();
  /** The options that were set. */
  public readonly options: ManagerOptions;
  private initiated = false;

  /** Returns the nodes that has the least load. */
  private get leastLoadNode(): Collection<string, Node> {
    return this.nodes
      .filter((node) => node.connected)
      .sort((a, b) => {
        const aload = a.stats.cpu
          ? (a.stats.cpu.lavalinkLoad / a.stats.cpu.cores) * 100
          : 0;
        const bload = b.stats.cpu
          ? (b.stats.cpu.lavalinkLoad / b.stats.cpu.cores) * 100
          : 0;
        return aload - bload;
      });
  }

  /** Returns a node based on priority. */
  private get priorityNode(): Node {
    const filteredNodes = this.nodes.filter(
      (node) => node.connected && node.options.priority > 0
    );
    const totalWeight = filteredNodes.reduce(
      (total, node) => total + node.options.priority,
      0
    );
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

    return this.leastLoadNode.first();
  }

  /** Returns the node to use. */
  public get useableNodes(): Node {
    return this.options.usePriority
      ? this.priorityNode
      : this.leastLoadNode.first();
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
      ...options,
    };

    if (this.options.plugins) {
      for (const [index, plugin] of this.options.plugins.entries()) {
        if (!(plugin instanceof Plugin))
          throw new RangeError(
            `Plugin at index ${index} does not extend Plugin.`
          );
        plugin.load(this);
      }
    }

    if (this.options.nodes) {
      for (const nodeOptions of this.options.nodes)
        new (Structure.get("Node"))(nodeOptions);
    }
  }

  /**
   * Initiates the Manager.
   * @param clientId
   */
  public init(clientId?: string): this {
    if (this.initiated) return this;
    if (typeof clientId !== "undefined") this.options.clientId = clientId;

    if (typeof this.options.clientId !== "string")
      throw new Error('"clientId" set is not type of "string"');

    if (!this.options.clientId)
      throw new Error(
        '"clientId" is not set. Pass it in Manager#init() or as a option in the constructor.'
      );

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
  public async search(
    query: string | SearchQuery,
    requester?: unknown
  ): Promise<SearchResult> {
    const node = this.useableNodes;

    if (!node) {
      throw new Error("No available nodes.");
    }

    const _query: SearchQuery = typeof query === "string" ? { query } : query;
    const _source =
      Manager.DEFAULT_SOURCES[
        _query.source ?? this.options.defaultSearchPlatform
      ] ?? _query.source;

    let search = _query.query;

    if (!/^https?:\/\//.test(search)) {
      search = `${_source}:${search}`;
    }

    try {
      const res = (await node.rest.get(
        `/v4/loadtracks?identifier=${encodeURIComponent(search)}`
      )) as LavalinkResponse;

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

      const tracks = searchData.map((track) =>
        TrackUtils.build(track, requester)
      );
      const playlist =
        res.loadType === "playlist"
          ? {
              name: playlistData!.info.name,
              tracks: playlistData!.tracks.map((track) =>
                TrackUtils.build(track, requester)
              ),
              duration: playlistData!.tracks.reduce(
                (acc, cur) => acc + (cur.info.length || 0),
                0
              ),
            }
          : null;

      const result: SearchResult = {
        loadType: res.loadType,
        tracks,
        playlist,
      };

      return result;
    } catch (err) {
      throw new Error(err);
    }
  }

  /**
   * Decodes the base64 encoded tracks and returns a TrackData array.
   * @param tracks
   */
  public decodeTracks(tracks: string[]): Promise<TrackData[]> {
    return new Promise(async (resolve, reject) => {
      const node = this.nodes.first();
      if (!node) throw new Error("No available nodes.");

      const res = (await node.rest
        .post("/v4/decodetracks", JSON.stringify(tracks))
        .catch((err) => reject(err))) as TrackData[];

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
  public async updateVoiceState(
    data: VoicePacket | VoiceServer | VoiceState
  ): Promise<void> {
    if (
      "t" in data &&
      !["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(data.t)
    ) {
      return;
    }
    const update = "d" in data ? data.d : data;
    if (!update || (!("token" in update) && !("session_id" in update))) {
      return;
    }
    const player = this.players.get(update.guild_id);
    if (!player) {
      return;
    }
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
    } else {
      if (update.user_id !== this.options.clientId) {
        return;
      }
      if (update.channel_id) {
        if (player.voiceChannel !== update.channel_id) {
          this.emit(
            "playerMove",
            player,
            player.voiceChannel,
            update.channel_id
          );
        }
        player.voiceState.sessionId = update.session_id;
        player.voiceChannel = update.channel_id;
      } else {
        this.emit("playerDisconnect", player, player.voiceChannel);
        player.voiceChannel = null;
        player.voiceState = Object.assign({});
        player.destroy();
      }
    }
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
  /** Use priority mode over least amount of player? */
  usePriority?: boolean;
  /** The array of nodes to connect to. */
  nodes?: NodeOptions[];
  /** The client ID to use. */
  clientId?: string;
  /** Value to use for the `Client-Name` header. */
  clientName?: string;
  /** The shard count. */
  shards?: number;
  /** A array of plugins to use. */
  plugins?: Plugin[];
  /** Whether players should automatically play the next song. */
  autoPlay?: boolean;
  /** An array of track properties to keep. `track` will always be present. */
  trackPartial?: string[];
  /** The default search platform to use, can be "youtube", "youtube music", "soundcloud" or deezer. */
  defaultSearchPlatform?: SearchPlatform;
  /**
   * Function to send data to the websocket.
   * @param id
   * @param payload
   */
  send(id: string, payload: Payload): void;
}

export type SearchPlatform =
  | "deezer"
  | "soundcloud"
  | "youtube music"
  | "youtube";

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

interface ManagerEvents {
  nodeCreate: (node: Node) => void;
  nodeDestroy: (node: Node) => void;
  nodeConnect: (node: Node) => void;
  nodeReconnect: (node: Node) => void;
  nodeDisconnect: (
    node: Node,
    reason: { code?: number; reason?: string }
  ) => void;
  nodeError: (node: Node, error: Error) => void;
  nodeRaw: (payload: unknown) => void;
  playerCreate: (player: Player) => void;
  playerDestroy: (player: Player) => void;
  playerStateUpdate: (oldPlayer: Player, newPlayer: Player) => void;
  playerMove: (player: Player, initChannel: string, newChannel: string) => void;
  playerDisconnect: (player: Player, oldChannel: string) => void;
  queueEnd: (
    player: Player,
    track: Track | UnresolvedTrack,
    payload: TrackEndEvent
  ) => void;
  socketClosed: (player: Player, payload: WebSocketClosedEvent) => void;
  trackStart: (player: Player, track: Track, payload: TrackStartEvent) => void;
  trackEnd: (player: Player, track: Track, payload: TrackEndEvent) => void;
  trackStuck: (player: Player, track: Track, payload: TrackStuckEvent) => void;
  trackError: (
    player: Player,
    track: Track | UnresolvedTrack,
    payload: TrackExceptionEvent
  ) => void;
}
