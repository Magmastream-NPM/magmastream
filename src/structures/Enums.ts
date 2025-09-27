/**
 * State Storage Enum
 */
export enum StateStorageType {
	Memory = "memory",
	Redis = "redis",
	JSON = "json",
}

/**
 * AutoPlay Platform Enum
 */
export enum AutoPlayPlatform {
	Spotify = "spotify",
	Deezer = "deezer",
	SoundCloud = "soundcloud",
	Tidal = "tidal",
	VKMusic = "vkmusic",
	Qobuz = "qobuz",
	YouTube = "youtube",
}

/**
 * State Types Enum
 */
export enum StateTypes {
	Connected = "CONNECTED",
	Connecting = "CONNECTING",
	Disconnected = "DISCONNECTED",
	Disconnecting = "DISCONNECTING",
	Destroying = "DESTROYING",
}

/**
 * Load Types Enum
 */
export enum LoadTypes {
	Track = "track",
	Playlist = "playlist",
	Search = "search",
	Empty = "empty",
	Error = "error",
	/** Nodelink */
	Album = "album",
	/** Nodelink */
	Artist = "artist",
	/** Nodelink */
	Station = "station",
	/** Nodelink */
	Podcast = "podcast",
	/** Nodelink */
	Show = "show",
	/** Nodelink */
	Short = "short",
}

/**
 * Search Platform Enum
 */
export enum SearchPlatform {
	AppleMusic = "amsearch",
	Audius = "audsearch",
	Bandcamp = "bcsearch",
	Deezer = "dzsearch",
	Jiosaavn = "jssearch",
	Qobuz = "qbsearch",
	SoundCloud = "scsearch",
	Spotify = "spsearch",
	Tidal = "tdsearch",
	VKMusic = "vksearch",
	YouTube = "ytsearch",
	YouTubeMusic = "ytmsearch",
}

/**
 * Player State Event Types Enum
 */
export enum PlayerStateEventTypes {
	AutoPlayChange = "playerAutoplay",
	ConnectionChange = "playerConnection",
	RepeatChange = "playerRepeat",
	PauseChange = "playerPause",
	QueueChange = "queueChange",
	TrackChange = "trackChange",
	VolumeChange = "volumeChange",
	ChannelChange = "channelChange",
	PlayerCreate = "playerCreate",
	PlayerDestroy = "playerDestroy",
	FilterChange = "filterChange",
}

/**
 * Track Source Types Enum
 */
export enum TrackSourceTypes {
	AppleMusic = "AppleMusic",
	Audius = "Audius",
	Bandcamp = "Bandcamp",
	Deezer = "Deezer",
	Jiosaavn = "Jiosaavn",
	Qobuz = "Qobuz",
	SoundCloud = "SoundCloud",
	Spotify = "Spotify",
	Tidal = "Tidal",
	VKMusic = "VKMusic",
	YouTube = "YouTube",
	Pornhub = "Pornub",
	TikTok = "TikTok",
	Flowertts = "Flowertts",
	Ocremix = "Ocremix",
	Mixcloud = "Mixcloud",
	Soundgasm = "Soundgasm",
	Reddit = "Reddit",
	Clypit = "Clypit",
	Http = "Http",
	Tts = "Tts",
}

/**
 * Use Node Options Enum
 */
export enum UseNodeOptions {
	LeastLoad = "leastLoad",
	LeastPlayers = "leastPlayers",
}

/**
 * Track Partial Enum
 */
export enum TrackPartial {
	/** The base64 encoded string of the track */
	Track = "track",
	/** The title of the track */
	Title = "title",
	/** The track identifier */
	Identifier = "identifier",
	/** The author of the track */
	Author = "author",
	/** The length of the track in milliseconds */
	Duration = "duration",
	/** The ISRC of the track */
	Isrc = "isrc",
	/** Whether the track is seekable */
	IsSeekable = "isSeekable",
	/** Whether the track is a stream */
	IsStream = "isStream",
	/** The URI of the track */
	Uri = "uri",
	/** The artwork URL of the track */
	ArtworkUrl = "artworkUrl",
	/** The source name of the track */
	SourceName = "sourceName",
	/** The thumbnail of the track */
	ThumbNail = "thumbnail",
	/** The requester of the track */
	Requester = "requester",
	/** The plugin info of the track */
	PluginInfo = "pluginInfo",
	/** The custom data of the track */
	CustomData = "customData",
}

/**
 * Manager Event Types Enum
 */
export enum ManagerEventTypes {
	ChapterStarted = "chapterStarted",
	ChaptersLoaded = "chaptersLoaded",
	Debug = "debug",
	LyricsFound = "lyricsFound",
	LyricsLine = "lyricsLine",
	LyricsNotFound = "lyricsNotFound",
	NodeConnect = "nodeConnect",
	NodeCreate = "nodeCreate",
	NodeDestroy = "nodeDestroy",
	NodeDisconnect = "nodeDisconnect",
	NodeError = "nodeError",
	NodeRaw = "nodeRaw",
	NodeReconnect = "nodeReconnect",
	PlayerCreate = "playerCreate",
	PlayerDestroy = "playerDestroy",
	PlayerDisconnect = "playerDisconnect",
	PlayerMove = "playerMove",
	PlayerRestored = "playerRestored",
	PlayerStateUpdate = "playerStateUpdate",
	QueueEnd = "queueEnd",
	RestoreComplete = "restoreComplete",
	SegmentSkipped = "segmentSkipped",
	SegmentsLoaded = "segmentsLoaded",
	SocketClosed = "socketClosed",
	TrackEnd = "trackEnd",
	TrackError = "trackError",
	TrackStart = "trackStart",
	TrackStuck = "trackStuck",
	/** Nodelink */
	VoiceReceiverDisconnect = "voiceReceiverDisconnect",
	/** Nodelink */
	VoiceReceiverConnect = "voiceReceiverConnect",
	/** Nodelink */
	VoiceReceiverError = "voiceReceiverError",
	/** Nodelink */
	VoiceReceiverStartSpeaking = "voiceReceiverStartSpeaking",
	/** Nodelink */
	VoiceReceiverEndSpeaking = "voiceReceiverEndSpeaking",
}

/**
 * Track End Reason Enum
 */
export enum TrackEndReasonTypes {
	Finished = "finished",
	LoadFailed = "loadFailed",
	Stopped = "stopped",
	Replaced = "replaced",
	Cleanup = "cleanup",
}

/**
 * Severity Types Enum
 */
export enum SeverityTypes {
	Common = "common",
	Suspicious = "suspicious",
	Fault = "fault",
}

/**
 * SponsorBlock Segment Enum
 */
export enum SponsorBlockSegment {
	Filler = "filler",
	Interaction = "interaction",
	Intro = "intro",
	MusicOfftopic = "music_offtopic",
	Outro = "outro",
	Preview = "preview",
	SelfPromo = "selfpromo",
	Sponsor = "sponsor",
}

/**
 * Available Filters Enum
 */
export enum AvailableFilters {
	BassBoost = "bassboost",
	China = "china",
	Chipmunk = "chipmunk",
	Darthvader = "darthvader",
	Daycore = "daycore",
	Demon = "demon",
	Distort = "distort",
	Doubletime = "doubletime",
	Earrape = "earrape",
	EightD = "eightD",
	Electronic = "electronic",
	Nightcore = "nightcore",
	Party = "party",
	Pop = "pop",
	Radio = "radio",
	SetDistortion = "setDistortion",
	SetKaraoke = "setKaraoke",
	SetRotation = "setRotation",
	SetTimescale = "setTimescale",
	Slowmo = "slowmo",
	Soft = "soft",
	TrebleBass = "trebleBass",
	Tremolo = "tremolo",
	TV = "tv",
	Vaporwave = "vaporwave",
	Vibrato = "vibrato",
}

/**
 * MagmaStream Error Codes Enum
 */
export enum MagmaStreamErrorCode {
	// GENERAL (1000)
	GENERAL_UNKNOWN = "MS_GENERAL_UNKNOWN",
	GENERAL_TIMEOUT = "MS_GENERAL_TIMEOUT",

	// MANAGER (1100)
	MANAGER_INIT_FAILED = "MS_MANAGER_INIT_FAILED",
	MANAGER_INVALID_CONFIG = "MS_MANAGER_INVALID_CONFIG",
	MANAGER_SHUTDOWN_FAILED = "MS_MANAGER_SHUTDOWN_FAILED",
	MANAGER_NO_NODES = "MS_MANAGER_NO_NODES",
	MANAGER_NODE_NOT_FOUND = "MS_MANAGER_NODE_NOT_FOUND",
	MANAGER_SEARCH_FAILED = "MS_MANAGER_SEARCH_FAILED",
	MANAGER_CLEANUP_INACTIVE_PLAYERS_FAILED = "MS_MANAGER_CLEANUP_INACTIVE_PLAYERS_FAILED",

	// NODE (1200)
	NODE_CONNECT_FAILED = "MS_NODE_CONNECT_FAILED",
	NODE_DISCONNECTED = "MS_NODE_DISCONNECTED",
	NODE_PROTOCOL_ERROR = "MS_NODE_PROTOCOL_ERROR",

	// PLAYER (1300)
	PLAYER_NOT_FOUND = "MS_PLAYER_NOT_FOUND",
	PLAYER_STATE_INVALID = "MS_PLAYER_STATE_INVALID",
	PLAYER_QUEUE_EMPTY = "MS_PLAYER_QUEUE_EMPTY",

	// QUEUE (1400)
	QUEUE_SAVE_FAILED = "MS_QUEUE_SAVE_FAILED",
	QUEUE_LOAD_FAILED = "MS_QUEUE_LOAD_FAILED",
	QUEUE_LIMIT_REACHED = "MS_QUEUE_LIMIT_REACHED",

	// FILTERS (1500)
	FILTER_INVALID = "MS_FILTER_INVALID",
	FILTER_APPLY_FAILED = "MS_FILTER_APPLY_FAILED",

	// REST (1600)
	REST_REQUEST_FAILED = "MS_REST_REQUEST_FAILED",
	REST_UNAUTHORIZED = "MS_REST_UNAUTHORIZED",

	// UTILS (1700)
	UTILS_PARSE_ERROR = "MS_UTILS_PARSE_ERROR",
	UTILS_DECODE_FAILED = "MS_UTILS_DECODE_FAILED",

	// PLUGIN (1800)
	PLUGIN_LOAD_FAILED = "MS_PLUGIN_LOAD_FAILED",
	PLUGIN_RUNTIME_ERROR = "MS_PLUGIN_RUNTIME_ERROR",
}

// Numeric mappings (secondary, machine-friendly)
export const MagmaStreamErrorNumbers: Record<MagmaStreamErrorCode, number> = {
	// GENERAL
	[MagmaStreamErrorCode.GENERAL_UNKNOWN]: 1000,
	[MagmaStreamErrorCode.GENERAL_TIMEOUT]: 1001,

	// MANAGER
	[MagmaStreamErrorCode.MANAGER_INIT_FAILED]: 1100,
	[MagmaStreamErrorCode.MANAGER_INVALID_CONFIG]: 1101,
	[MagmaStreamErrorCode.MANAGER_SHUTDOWN_FAILED]: 1102,
	[MagmaStreamErrorCode.MANAGER_NO_NODES]: 1103,
	[MagmaStreamErrorCode.MANAGER_NODE_NOT_FOUND]: 1104,
	[MagmaStreamErrorCode.MANAGER_SEARCH_FAILED]: 1105,
	[MagmaStreamErrorCode.MANAGER_CLEANUP_INACTIVE_PLAYERS_FAILED]: 1106,

	// NODE
	[MagmaStreamErrorCode.NODE_CONNECT_FAILED]: 1200,
	[MagmaStreamErrorCode.NODE_DISCONNECTED]: 1201,
	[MagmaStreamErrorCode.NODE_PROTOCOL_ERROR]: 1202,

	// PLAYER
	[MagmaStreamErrorCode.PLAYER_NOT_FOUND]: 1300,
	[MagmaStreamErrorCode.PLAYER_STATE_INVALID]: 1301,
	[MagmaStreamErrorCode.PLAYER_QUEUE_EMPTY]: 1302,

	// QUEUE
	[MagmaStreamErrorCode.QUEUE_SAVE_FAILED]: 1400,
	[MagmaStreamErrorCode.QUEUE_LOAD_FAILED]: 1401,
	[MagmaStreamErrorCode.QUEUE_LIMIT_REACHED]: 1402,

	// FILTERS
	[MagmaStreamErrorCode.FILTER_INVALID]: 1500,
	[MagmaStreamErrorCode.FILTER_APPLY_FAILED]: 1501,

	// REST
	[MagmaStreamErrorCode.REST_REQUEST_FAILED]: 1600,
	[MagmaStreamErrorCode.REST_UNAUTHORIZED]: 1601,

	// UTILS
	[MagmaStreamErrorCode.UTILS_PARSE_ERROR]: 1700,
	[MagmaStreamErrorCode.UTILS_DECODE_FAILED]: 1701,

	// PLUGIN
	[MagmaStreamErrorCode.PLUGIN_LOAD_FAILED]: 1800,
	[MagmaStreamErrorCode.PLUGIN_RUNTIME_ERROR]: 1801,
};
