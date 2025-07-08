import { ClientUser, User } from "discord.js";
import {
	AutoPlayPlatform,
	LoadTypes,
	ManagerEventTypes,
	PlayerStateEventTypes,
	SearchPlatform,
	SeverityTypes,
	StateStorageType,
	TrackEndReasonTypes,
	TrackPartial,
	TrackSourceTypes,
	UseNodeOptions,
} from "./Enums";
import { Player } from "./Player";
import { Queue } from "./Queue";

/**
 * Manager Options
 */
export interface ManagerOptions {
	/** The state storage options.
	 *
	 * @default { type: StateStorageType.Collection }
	 */
	stateStorage?: StateStorageOptions;
	/** Enable priority mode over least player count or load balancing? */
	enablePriorityMode?: boolean;
	/** Automatically play the next track when the current one ends. */
	playNextOnEnd?: boolean;
	/** An array of search platforms to use for autoplay. First to last matters
	 * Use enum `AutoPlayPlatform`.
	 */
	autoPlaySearchPlatforms?: AutoPlayPlatform[];
	/** The client ID to use. */
	clientId?: string;
	/** Value to use for the `Client-Name` header. */
	clientName?: string;
	/** The array of shard IDs connected to this manager instance. */
	clusterId?: number;
	/** List of plugins to load. */
	enabledPlugins?: Plugin[];
	/** The default search platform to use.
	 * Use enum `SearchPlatform`. */
	defaultSearchPlatform?: SearchPlatform;
	/** The last.fm API key.
	 * If you need to create one go here: https://www.last.fm/api/account/create.
	 * If you already have one, get it from here: https://www.last.fm/api/accounts. */
	lastFmApiKey?: string;
	/** The maximum number of previous tracks to store. */
	maxPreviousTracks?: number;
	/** The array of nodes to connect to. */
	nodes?: NodeOptions[];
	/** Whether the YouTube video titles should be replaced if the Author does not exactly match. */
	normalizeYouTubeTitles?: boolean;
	/** An array of track properties to keep. `track` will always be present. */
	trackPartial?: TrackPartial[];
	/** Use the least amount of players or least load? */
	useNode?: UseNodeOptions.LeastLoad | UseNodeOptions.LeastPlayers;
	/**
	 * Function to send data to the websocket.
	 * @param id The ID of the node to send the data to.
	 * @param payload The payload to send.
	 */
	send?: (packet: DiscordPacket) => unknown;
}

/**
 * State Storage Options
 */
export interface StateStorageOptions {
	type: StateStorageType;
	redisConfig?: RedisConfig;
}
/**
 * Payload
 */
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

/**
 * Node Options
 */
export interface NodeOptions {
	/** The host for the node. */
	host: string;
	/** The port for the node. */
	port?: number;
	/** The password for the node. */
	password?: string;
	/** Whether the host uses SSL. */
	useSSL?: boolean;
	/** The identifier for the node. */
	identifier?: string;
	/** The maxRetryAttempts for the node. */
	maxRetryAttempts?: number;
	/** The retryDelayMs for the node. */
	retryDelayMs?: number;
	/** Whether to resume the previous session. */
	enableSessionResumeOption?: boolean;
	/** The time the lavalink server will wait before it removes the player. */
	sessionTimeoutMs?: number;
	/** The timeout used for api calls. */
	apiRequestTimeoutMs?: number;
	/** Priority of the node. */
	nodePriority?: number;
	/** Whether the node is a NodeLink. */
	isNodeLink?: boolean;
}

/**
 * Discord Packet
 */
export interface DiscordPacket {
	/**
	 * opcode for the payload
	 */
	op: number;
	/**
	 * event data
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	d: any;
	/**
	 * sequence number, used for resuming sessions and heartbeats
	 */
	s?: number;
	/**
	 * the event name for this payload
	 */
	t?: string;
}

/**
 * Player Update Voice State
 */
export interface PlayerUpdateVoiceState {
	/**
	 * The session id of the voice connection
	 */
	sessionId: string;
	/**
	 * Event data
	 */
	event: VoiceServerUpdate;
}

/**
 * Voice Server Update
 */
export interface VoiceServerUpdate {
	/**
	 * The token for the session
	 */
	token: string;
	/**
	 * Guild if of the voice connection
	 */
	guild_id: string;
	/**
	 * The endpoint lavalink will connect to
	 */
	endpoint: string;
}

/**
 * Redis Configuration
 */
export interface RedisConfig {
	host: string;
	port: string;
	password?: string;
	db?: number;
	prefix?: string;
}

/**
 * Player State Update Event
 */
export interface PlayerStateUpdateEvent {
	changeType: PlayerStateEventTypes;
	details?:
		| AutoplayChangeEvent
		| ConnectionChangeEvent
		| RepeatChangeEvent
		| PauseChangeEvent
		| QueueChangeEvent
		| TrackChangeEvent
		| VolumeChangeEvent
		| ChannelChangeEvent;
}

/**
 * Autoplay Change Event
 */
interface AutoplayChangeEvent {
	previousAutoplay: boolean;
	currentAutoplay: boolean;
}

/**
 * Connection Change Event
 */
interface ConnectionChangeEvent {
	changeType: "connect" | "disconnect";
	previousConnection: boolean;
	currentConnection: boolean;
}

/**
 * Repeat Change Event
 */
interface RepeatChangeEvent {
	changeType: "dynamic" | "track" | "queue" | null;
	previousRepeat: string | null;
	currentRepeat: string | null;
}

/**
 * Pause Change Event
 */
interface PauseChangeEvent {
	previousPause: boolean | null;
	currentPause: boolean | null;
}

/**
 * Queue Change Event
 */
interface QueueChangeEvent {
	changeType: "add" | "remove" | "clear" | "shuffle" | "roundRobin" | "userBlock" | "autoPlayAdd";
	tracks?: Track[];
}

/**
 * Track Change Event
 */
interface TrackChangeEvent {
	changeType: "start" | "end" | "previous" | "timeUpdate" | "autoPlay";
	track: Track;
	previousTime?: number | null;
	currentTime?: number | null;
}

/**
 * Volume Change Event
 */
interface VolumeChangeEvent {
	previousVolume: number | null;
	currentVolume: number | null;
}

/**
 * Channel Change Event
 */
interface ChannelChangeEvent {
	changeType: "text" | "voice";
	previousChannel: string | null;
	currentChannel: string | null;
}

/**
 * Track
 */
export interface Track {
	/** The base64 encoded track. */
	readonly track: string;
	/** The artwork url of the track. */
	readonly artworkUrl: string;
	/** The track source name. */
	readonly sourceName: TrackSourceName;
	/** The title of the track. */
	title: string;
	/** The identifier of the track. */
	readonly identifier: string;
	/** The author of the track. */
	author: string;
	/** The duration of the track. */
	readonly duration: number;
	/** The ISRC of the track. */
	readonly isrc: string;
	/** If the track is seekable. */
	readonly isSeekable: boolean;
	/** If the track is a stream.. */
	readonly isStream: boolean;
	/** The uri of the track. */
	readonly uri: string;
	/** The thumbnail of the track or null if it's a unsupported source. */
	readonly thumbnail: string | null;
	/** The user that requested the track. */
	requester?: User | ClientUser;
	/** Displays the track thumbnail with optional size or null if it's a unsupported source. */
	displayThumbnail(size?: Sizes): string;
	/** Additional track info provided by plugins. */
	pluginInfo: TrackPluginInfo;
	/** Add your own data to the track. */
	customData: Record<string, unknown>;
}

/**
 * Track Plugin Info
 */
export interface TrackPluginInfo {
	albumName?: string;
	albumUrl?: string;
	artistArtworkUrl?: string;
	artistUrl?: string;
	isPreview?: string;
	previewUrl?: string;
}

/**
 * Search Query
 */
export interface SearchQuery {
	/** The source to search from. */
	source?: SearchPlatform;
	/** The query to search for. */
	query: string;
}

/**
 * Lavalink Response
 */
export interface LavalinkResponse {
	loadType: LoadTypes;
	data: TrackData[] | PlaylistRawData;
}

/**
 * Track Data
 */
export interface TrackData {
	/** The track information. */
	encoded: string;
	/** The detailed information of the track. */
	info: TrackDataInfo;
	/** Additional track info provided by plugins. */
	pluginInfo: Record<string, string>;
}

/**
 * Playlist Raw Data
 */
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

/**
 * Track Data Info
 */
export interface TrackDataInfo {
	identifier: string;
	isSeekable: boolean;
	author: string;
	length: number;
	isrc?: string;
	isStream: boolean;
	title: string;
	uri?: string;
	artworkUrl?: string;
	sourceName?: TrackSourceName;
}

/**
 * LavaPlayer
 */
export interface LavaPlayer {
	guildId: string;
	track: TrackData;
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

/**
 * Search Result
 */
export interface BaseSearchResult {
	/** The load type of the result. */
	loadType: LoadTypes.Empty | LoadTypes.Error;
}

/**
 * Track Search Result
 */
export interface TrackSearchResult {
	/** The load type is always 'track' */
	loadType: LoadTypes.Track;
	/** The track obtained */
	tracks: [Track];
}

/**
 * Search Result
 */
export interface SearchSearchResult {
	/** The load type is always 'search' */
	loadType: LoadTypes.Search
	/** The tracks of the search result */
	tracks: Track[]
}

/**
 * Playlist Search Result
 */
export interface PlaylistSearchResult {
	/** The playlist load type */
	loadType: LoadTypes.Playlist;
	/** The tracks of the playlist */
	tracks: Track[];
	/** The playlist info */
	playlist: PlaylistData;
}

/**
 * Playlist Data
 */
export interface PlaylistData {
	/** The playlist name. */
	name: string;
	/** Requester of playlist. */
	requester: User | ClientUser;
	/** More playlist information. */
	playlistInfo: PlaylistInfoData[];
	/** The length of the playlist. */
	duration: number;
	/** The songs of the playlist. */
	tracks: Track[];
}

/**
 * Playlist Info Data
 */
export interface PlaylistInfoData {
	/** Url to playlist. */
	url: string;
	/** Type is always playlist in that case. */
	type: string;
	/** ArtworkUrl of playlist */
	artworkUrl: string;
	/** Number of total tracks in playlist */
	totalTracks: number;
	/** Author of playlist */
	author: string;
}

/**
 * Manager Events
 */
export interface ManagerEvents {
	[ManagerEventTypes.ChapterStarted]: [player: Player, track: Track, payload: SponsorBlockChapterStarted];
	[ManagerEventTypes.ChaptersLoaded]: [player: Player, track: Track, payload: SponsorBlockChaptersLoaded];
	[ManagerEventTypes.Debug]: [info: string];
	[ManagerEventTypes.NodeConnect]: [node: Node];
	[ManagerEventTypes.NodeCreate]: [node: Node];
	[ManagerEventTypes.NodeDestroy]: [node: Node];
	[ManagerEventTypes.NodeDisconnect]: [node: Node, reason: { code?: number; reason?: string }];
	[ManagerEventTypes.NodeError]: [node: Node, error: Error];
	[ManagerEventTypes.NodeRaw]: [payload: unknown];
	[ManagerEventTypes.NodeReconnect]: [node: Node];
	[ManagerEventTypes.PlayerCreate]: [player: Player];
	[ManagerEventTypes.PlayerDestroy]: [player: Player];
	[ManagerEventTypes.PlayerDisconnect]: [player: Player, oldChannel: string];
	[ManagerEventTypes.PlayerMove]: [player: Player, initChannel: string, newChannel: string];
	[ManagerEventTypes.PlayerRestored]: [player: Player, node: Node];
	[ManagerEventTypes.PlayerStateUpdate]: [oldPlayer: Player, newPlayer: Player, changeType: PlayerStateUpdateEvent];
	[ManagerEventTypes.QueueEnd]: [player: Player, track: Track, payload: TrackEndEvent];
	[ManagerEventTypes.RestoreComplete]: [node: Node];
	[ManagerEventTypes.SegmentSkipped]: [player: Player, track: Track, payload: SponsorBlockSegmentSkipped];
	[ManagerEventTypes.SegmentsLoaded]: [player: Player, track: Track, payload: SponsorBlockSegmentsLoaded];
	[ManagerEventTypes.SocketClosed]: [player: Player, payload: WebSocketClosedEvent];
	[ManagerEventTypes.TrackEnd]: [player: Player, track: Track, payload: TrackEndEvent];
	[ManagerEventTypes.TrackError]: [player: Player, track: Track, payload: TrackExceptionEvent];
	[ManagerEventTypes.TrackStart]: [player: Player, track: Track, payload: TrackStartEvent];
	[ManagerEventTypes.TrackStuck]: [player: Player, track: Track, payload: TrackStuckEvent];
	[ManagerEventTypes.VoiceReceiverDisconnect]: [player: Player];
	[ManagerEventTypes.VoiceReceiverConnect]: [player: Player];
	[ManagerEventTypes.VoiceReceiverError]: [player: Player, error: Error];
	[ManagerEventTypes.VoiceReceiverStartSpeaking]: [player: Player, data: unknown];
	[ManagerEventTypes.VoiceReceiverEndSpeaking]: [player: Player, data: unknown];
}

/**
 * Voice Packet
 */
export interface VoicePacket {
	t?: "VOICE_SERVER_UPDATE" | "VOICE_STATE_UPDATE";
	d: VoiceState | VoiceServer;
}

/**
 * Voice Server
 */
export interface VoiceServer {
	token: string;
	guild_id: string;
	endpoint: string;
}

export interface Extendable {
	Player: typeof Player;
	Queue: typeof Queue;
	Node: typeof Node;
}

/**
 * Voice State
 */
export interface VoiceState {
	op: "voiceUpdate";
	guildId: string;
	event: VoiceServer;
	sessionId?: string;
}

/**
 * Voice State
 */
export interface VoiceState {
	guild_id: string;
	user_id: string;
	session_id: string;
	channel_id: string;
}

/**
 * NodeStats interface
 */
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

/**
 * Node Message
 */
export interface NodeMessage extends NodeStats {
	type: PlayerEventType;
	op: "stats" | "playerUpdate" | "event";
	guildId: string;
}

/**
 * PlayerEvent interface
 */
export interface PlayerEvent {
	op: "event";
	type: PlayerEventType;
	guildId: string;
}

/**
 * Exception interface
 */
export interface Exception {
	message: string;
	severity: SeverityTypes;
	cause: string;
}

/**
 * TrackStartEvent interface
 */
export interface TrackStartEvent extends PlayerEvent {
	type: "TrackStartEvent";
	track: TrackData;
}

/**
 * TrackEndEvent interface
 */
export interface TrackEndEvent extends PlayerEvent {
	type: "TrackEndEvent";
	track: TrackData;
	reason: TrackEndReasonTypes;
}

/**
 * TrackExceptionEvent interface
 */
export interface TrackExceptionEvent extends PlayerEvent {
	exception?: Exception;
	guildId: string;
	type: "TrackExceptionEvent";
}

/**
 * TrackStuckEvent interface
 */
export interface TrackStuckEvent extends PlayerEvent {
	type: "TrackStuckEvent";
	thresholdMs: number;
}

/**
 * WebSocketClosedEvent interface
 */
export interface WebSocketClosedEvent extends PlayerEvent {
	type: "WebSocketClosedEvent";
	code: number;
	reason: string;
	byRemote: boolean;
}

/**
 * SponsorBlockSegmentsLoaded interface
 */
export interface SponsorBlockSegmentsLoaded extends PlayerEvent {
	type: "SegmentsLoaded";
	/* The loaded segments */
	segments: {
		/* The category name */
		category: string;
		/* In milliseconds */
		start: number;
		/* In milliseconds */
		end: number;
	}[];
}

/**
 * SponsorBlockSegmentSkipped interface
 */
export interface SponsorBlockSegmentSkipped extends PlayerEvent {
	type: "SegmentSkipped";
	/* The skipped segment*/
	segment: {
		/* The category name */
		category: string;
		/* In milliseconds */
		start: number;
		/* In milliseconds */
		end: number;
	};
}

/**
 * SponsorBlockChapterStarted interface
 */
export interface SponsorBlockChapterStarted extends PlayerEvent {
	type: "ChapterStarted";
	/** The chapter which started */
	chapter: {
		/** The name of the chapter */
		name: string;
		/* In milliseconds */
		start: number;
		/* In milliseconds */
		end: number;
		/* In milliseconds */
		duration: number;
	};
}

/**
 * SponsorBlockChaptersLoaded interface
 */
export interface SponsorBlockChaptersLoaded extends PlayerEvent {
	type: "ChaptersLoaded";
	/** All chapters loaded */
	chapters: {
		/** The name of the chapter */
		name: string;
		/* In milliseconds */
		start: number;
		/* In milliseconds */
		end: number;
		/* In milliseconds */
		duration: number;
	}[];
}

/**
 * PlayerUpdate interface
 */
export interface PlayerUpdate {
	op: "playerUpdate";
	/** The guild id of the player. */
	guildId: string;
	state: {
		/** Unix timestamp in milliseconds. */
		time: number;
		/** The position of the track in milliseconds. */
		position: number;
		/** Whether Lavalink is connected to the voice gateway. */
		connected: boolean;
		/** The ping of the node to the Discord voice server in milliseconds (-1 if not connected). */
		ping: number;
	};
}

/**
 * NodeOptions interface
 */
export interface NodeOptions {
	/** The host for the node. */
	host: string;
	/** The port for the node. */
	port?: number;
	/** The password for the node. */
	password?: string;
	/** Whether the host uses SSL. */
	useSSL?: boolean;
	/** The identifier for the node. */
	identifier?: string;
	/** The maxRetryAttempts for the node. */
	maxRetryAttempts?: number;
	/** The retryDelayMs for the node. */
	retryDelayMs?: number;
	/** Whether to resume the previous session. */
	enableSessionResumeOption?: boolean;
	/** The time the lavalink server will wait before it removes the player. */
	sessionTimeoutMs?: number;
	/** The timeout used for api calls. */
	apiRequestTimeoutMs?: number;
	/** Priority of the node. */
	nodePriority?: number;
}

/**
 * NodeStats interface
 */
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

/**
 * MemoryStats interface
 */
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

/**
 * CPUStats interface
 */
export interface CPUStats {
	/** The core amount the host machine has. */
	cores: number;
	/** The system load. */
	systemLoad: number;
	/** The lavalink load. */
	lavalinkLoad: number;
}

/**
 * FrameStats interface
 */
export interface FrameStats {
	/** The amount of sent frames. */
	sent?: number;
	/** The amount of nulled frames. */
	nulled?: number;
	/** The amount of deficit frames. */
	deficit?: number;
}

/**
 * LavalinkInfo interface
 */
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

/**
 * LyricsLine interface
 */
export interface LyricsLine {
	timestamp: number;
	duration: number;
	line: string;
	plugin: object;
}

/**
 * Lyrics interface
 */
export interface Lyrics {
	source: string;
	provider: string;
	text?: string;
	lines: LyricsLine[];
	plugin: object[];
}

/**
 * NodeLink Get Lyrics Multiple interface
 */
export interface NodeLinkGetLyricsMultiple {
	loadType: "lyricsMultiple";
	data: NodeLinkGetLyricsData[];
}

/**
 * NodeLink Get Lyrics Empty interface
 */
export interface NodeLinkGetLyricsEmpty {
	loadType: "empty";
	data: Record<never, never>;
}

/**
 * NodeLink Get Lyrics Data interface
 */
interface NodeLinkGetLyricsData {
	name: string;
	synced: boolean;
	data: {
		startTime?: number;
		endTime?: number;
		text: string;
	}[];
	rtl: boolean;
}

/**
 * NodeLink Get Lyrics Single interface
 */
export interface NodeLinkGetLyricsSingle {
	loadType: "lyricsSingle";
	data: NodeLinkGetLyricsData;
}

/**
 * NodeLink Get Lyrics Error interface
 */
export interface NodeLinkGetLyricsError {
	loadType: "error";
	data: {
		message: string;
		severity: Severity;
		cause: string;
		trace?: string;
	};
}

export interface StartSpeakingEventVoiceReceiverData {
	/**
	 * The user ID of the user who started speaking.
	 */
	userId: string;

	/**
	 * The guild ID of the guild where the user started speaking.
	 */
	guildId: string;
}

export interface EndSpeakingEventVoiceReceiverData {
	/**
	 * The user ID of the user who stopped speaking.
	 */
	userId: string;
	/**
	 * The guild ID of the guild where the user stopped speaking.
	 */
	guildId: string;
	/**
	 * The audio data received from the user in base64.
	 */
	data: string;
	/**
	 * The type of the audio data. Can be either opus or pcm. Older versions may include ogg/opus.
	 */
	type: "opus" | "pcm";
}

/**
 * Base Voice Receiver Event interface
 */
interface BaseVoiceReceiverEvent {
	op: "speak";
}

/**
 * Start Speaking Event Voice Receiver interface
 */
export interface StartSpeakingEventVoiceReceiver extends BaseVoiceReceiverEvent {
	type: "startSpeakingEvent";
	data: StartSpeakingEventVoiceReceiverData;
}

/**
 * End Speaking Event Voice Receiver interface
 */
export interface EndSpeakingEventVoiceReceiver extends BaseVoiceReceiverEvent {
	type: "endSpeakingEvent";
	data: EndSpeakingEventVoiceReceiverData;
}

/**
 * PlayerOptions interface
 */
export interface PlayerOptions {
	/** The guild ID the Player belongs to. */
	guildId: string;
	/** The text channel the Player belongs to. */
	textChannelId: string;
	/** The voice channel the Player belongs to. */
	voiceChannelId?: string;
	/** The node the Player uses. */
	node?: string;
	/** The initial volume the Player will use. */
	volume?: number;
	/** If the player should mute itself. */
	selfMute?: boolean;
	/** If the player should deaf itself. */
	selfDeafen?: boolean;
}

/**
 * PlayOptions interface
 */
export interface PlayOptions {
	/** The position to start the track. */
	readonly startTime?: number;
	/** The position to end the track. */
	readonly endTime?: number;
	/** Whether to not replace the track if a play payload is sent. */
	readonly noReplace?: boolean;
}

export interface ManagerInitOptions {
	clientId?: string;
	clusterId?: number;
}

export interface EqualizerBand {
	/** The band number being 0 to 14. */
	band: number;
	/** The gain amount being -0.25 to 1.00, 0.25 being double. */
	gain: number;
}

/**
 * Queue interface
 */
export interface IQueue {
	getCurrent(): Promise<Track | null>;
	setCurrent(track: Track | null): Promise<void>;

	getPrevious(): Promise<Track[]>;
	addPrevious(track: Track | Track[]): Promise<void>;
	setPrevious(track: Track | Track[]): Promise<void>;
	/** Get newest track (index 0) */
	popPrevious(): Promise<Track | null>;
	clearPrevious(): Promise<void>;

	size(): Promise<number>;
	totalSize(): Promise<number>;
	duration(): Promise<number>;

	add(track: Track | Track[], offset?: number): Promise<void>;
	remove(start?: number, end?: number): Promise<Track[]>;
	clear(): Promise<void>;
	dequeue(): Promise<Track | undefined>;
	enqueueFront(track: Track | Track[]): Promise<void>;
	getTracks(): Promise<Track[]>;
	getSlice(start?: number, end?: number): Promise<Track[]>;
	modifyAt(start: number, deleteCount?: number, ...items: Track[]): Promise<Track[]>;

	shuffle(): Promise<void>;
	userBlockShuffle(): Promise<void>;
	roundRobinShuffle(): Promise<void>;

	mapAsync<T>(callback: (track: Track, index: number, array: Track[]) => T): Promise<T[]>;
	filterAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track[]>;
	findAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track | undefined>;
	someAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean>;
	everyAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean>;
}

/**
 * Sizes Enum type
 */
export type Sizes = "0" | "1" | "2" | "3" | "default" | "mqdefault" | "hqdefault" | "maxresdefault";

/**
 * Track Source Name Enum type
 */
export type TrackSourceName = keyof typeof TrackSourceTypes;

/**
 * Use Node Option Enum type
 */
export type UseNodeOption = keyof typeof UseNodeOptions;

/**
 * Track End Reason Enum type
 */
export type TrackEndReason = keyof typeof TrackEndReasonTypes;

/**
 * Player Event Type Enum type
 */
export type PlayerEventType =
	| "TrackStartEvent"
	| "TrackEndEvent"
	| "TrackExceptionEvent"
	| "TrackStuckEvent"
	| "WebSocketClosedEvent"
	| "SegmentSkipped"
	| "SegmentsLoaded"
	| "ChaptersLoaded"
	| "ChapterStarted";

/**
 * Severity Types Enum type
 */
export type Severity = keyof typeof SeverityTypes;

/**
 * SponsorBlock Segment Events Enum type
 */
export type SponsorBlockSegmentEvents = SponsorBlockSegmentSkipped | SponsorBlockSegmentsLoaded | SponsorBlockChapterStarted | SponsorBlockChaptersLoaded;

/**
 * SponsorBlock Segment Event Type Enum type
 */
export type SponsorBlockSegmentEventType = "SegmentSkipped" | "SegmentsLoaded" | "ChapterStarted" | "ChaptersLoaded";

/**
 * Player Events Enum type
 */
export type PlayerEvents = TrackStartEvent | TrackEndEvent | TrackStuckEvent | TrackExceptionEvent | WebSocketClosedEvent | SponsorBlockSegmentEvents;

/**
 * Load Type Enum type
 */
export type LoadType = keyof typeof LoadTypes;

/**
 * NodeLink Get Lyrics Enum type
 */
export type NodeLinkGetLyrics = NodeLinkGetLyricsSingle | NodeLinkGetLyricsMultiple | NodeLinkGetLyricsEmpty | NodeLinkGetLyricsError;

/**
 * Voice Receiver Event Enum type
 */
export type VoiceReceiverEvent = StartSpeakingEventVoiceReceiver | EndSpeakingEventVoiceReceiver;

/**
 * Search Result Enum type
 */
export type SearchResult = TrackSearchResult | SearchSearchResult | PlaylistSearchResult | BaseSearchResult;
