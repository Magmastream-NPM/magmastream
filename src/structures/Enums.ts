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
	GENERAL_INVALID_MANAGER = "MS_GENERAL_INVALID_MANAGER",

	// MANAGER (1100)
	MANAGER_INIT_FAILED = "MS_MANAGER_INIT_FAILED",
	MANAGER_INVALID_CONFIG = "MS_MANAGER_INVALID_CONFIG",
	MANAGER_SHUTDOWN_FAILED = "MS_MANAGER_SHUTDOWN_FAILED",
	MANAGER_NO_NODES = "MS_MANAGER_NO_NODES",
	MANAGER_NODE_NOT_FOUND = "MS_MANAGER_NODE_NOT_FOUND",
	MANAGER_SEARCH_FAILED = "MS_MANAGER_SEARCH_FAILED",
	MANAGER_CLEANUP_INACTIVE_PLAYERS_FAILED = "MS_MANAGER_CLEANUP_INACTIVE_PLAYERS_FAILED",

	// NODE (1200)
	NODE_INVALID_CONFIG = "MS_NODE_INVALID_CONFIG",
	NODE_CONNECT_FAILED = "MS_NODE_CONNECT_FAILED",
	NODE_RECONNECT_FAILED = "MS_NODE_RECONNECT_FAILED",
	NODE_DISCONNECTED = "MS_NODE_DISCONNECTED",
	NODE_PROTOCOL_ERROR = "MS_NODE_PROTOCOL_ERROR",
	NODE_SESSION_IDS_LOAD_FAILED = "MS_NODE_SESSION_IDS_LOAD_FAILED",
	NODE_SESSION_IDS_UPDATE_FAILED = "MS_NODE_SESSION_IDS_UPDATE_FAILED",
	NODE_PLUGIN_ERROR = "MS_NODE_PLUGIN_ERROR",

	// PLAYER (1300)
	PLAYER_INVALID_CONFIG = "MS_PLAYER_INVALID_CONFIG",
	PLAYER_STATE_INVALID = "MS_PLAYER_STATE_INVALID",
	PLAYER_QUEUE_EMPTY = "MS_PLAYER_QUEUE_EMPTY",
	PLAYER_PREVIOUS_EMPTY = "MS_PLAYER_PREVIOUS_EMPTY",
	PLAYER_INVALID_NOW_PLAYING_MESSAGE = "MS_PLAYER_INVALID_NOW_PLAYING_MESSAGE",
	PLAYER_INVALID_AUTOPLAY = "MS_PLAYER_INVALID_AUTOPLAY",
	PLAYER_INVALID_VOLUME = "MS_PLAYER_INVALID_VOLUME",
	PLAYER_INVALID_REPEAT = "MS_PLAYER_INVALID_REPEAT",
	PLAYER_INVALID_PAUSE = "MS_PLAYER_INVALID_PAUSE",
	PLAYER_INVALID_SEEK = "MS_PLAYER_INVALID_SEEK",
	PLAYER_MOVE_FAILED = "MS_PLAYER_MOVE_FAILED",
	PLAYER_VOICE_RECEIVER_ERROR = "MS_PLAYER_VOICE_RECEIVER_ERROR",

	// QUEUE (1400)
	QUEUE_REDIS_ERROR = "MS_QUEUE_REDIS_ERROR",
	QUEUE_JSON_ERROR = "MS_QUEUE_JSON_ERROR",
	QUEUE_MEMORY_ERROR = "MS_QUEUE_MEMORY_ERROR",

	// FILTERS (1500)
	FILTER_APPLY_FAILED = "MS_FILTER_APPLY_FAILED",

	// REST (1600)
	REST_REQUEST_FAILED = "MS_REST_REQUEST_FAILED",
	REST_UNAUTHORIZED = "MS_REST_UNAUTHORIZED",

	// UTILS (1700)
	UTILS_TRACK_PARTIAL_INVALID = "MS_UTILS_TRACK_PARTIAL_INVALID",
	UTILS_TRACK_BUILD_FAILED = "MS_UTILS_TRACK_BUILD_FAILED",
	UTILS_AUTOPLAY_BUILD_FAILED = "MS_UTILS_AUTOPLAY_BUILD_FAILED",

	// PLUGIN (1800)
	PLUGIN_LOAD_FAILED = "MS_PLUGIN_LOAD_FAILED",
	PLUGIN_RUNTIME_ERROR = "MS_PLUGIN_RUNTIME_ERROR",
}

// Numeric mappings (secondary, machine-friendly)
export const MagmaStreamErrorNumbers: Record<MagmaStreamErrorCode, number> = {
	// GENERAL
	[MagmaStreamErrorCode.GENERAL_UNKNOWN]: 1000,
	[MagmaStreamErrorCode.GENERAL_TIMEOUT]: 1001,
	[MagmaStreamErrorCode.GENERAL_INVALID_MANAGER]: 1002,

	// MANAGER
	[MagmaStreamErrorCode.MANAGER_INIT_FAILED]: 1100,
	[MagmaStreamErrorCode.MANAGER_INVALID_CONFIG]: 1101,
	[MagmaStreamErrorCode.MANAGER_SHUTDOWN_FAILED]: 1102,
	[MagmaStreamErrorCode.MANAGER_NO_NODES]: 1103,
	[MagmaStreamErrorCode.MANAGER_NODE_NOT_FOUND]: 1104,
	[MagmaStreamErrorCode.MANAGER_SEARCH_FAILED]: 1105,
	[MagmaStreamErrorCode.MANAGER_CLEANUP_INACTIVE_PLAYERS_FAILED]: 1106,

	// NODE
	[MagmaStreamErrorCode.NODE_INVALID_CONFIG]: 1200,
	[MagmaStreamErrorCode.NODE_CONNECT_FAILED]: 1201,
	[MagmaStreamErrorCode.NODE_RECONNECT_FAILED]: 1202,
	[MagmaStreamErrorCode.NODE_DISCONNECTED]: 1203,
	[MagmaStreamErrorCode.NODE_PROTOCOL_ERROR]: 1204,
	[MagmaStreamErrorCode.NODE_SESSION_IDS_LOAD_FAILED]: 1205,
	[MagmaStreamErrorCode.NODE_SESSION_IDS_UPDATE_FAILED]: 1206,
	[MagmaStreamErrorCode.NODE_PLUGIN_ERROR]: 1207,

	// PLAYER
	[MagmaStreamErrorCode.PLAYER_INVALID_CONFIG]: 1300,
	[MagmaStreamErrorCode.PLAYER_STATE_INVALID]: 1301,
	[MagmaStreamErrorCode.PLAYER_QUEUE_EMPTY]: 1302,
	[MagmaStreamErrorCode.PLAYER_PREVIOUS_EMPTY]: 1303,
	[MagmaStreamErrorCode.PLAYER_INVALID_NOW_PLAYING_MESSAGE]: 1304,
	[MagmaStreamErrorCode.PLAYER_INVALID_AUTOPLAY]: 1305,
	[MagmaStreamErrorCode.PLAYER_INVALID_VOLUME]: 1306,
	[MagmaStreamErrorCode.PLAYER_INVALID_REPEAT]: 1307,
	[MagmaStreamErrorCode.PLAYER_INVALID_PAUSE]: 1308,
	[MagmaStreamErrorCode.PLAYER_INVALID_SEEK]: 1309,
	[MagmaStreamErrorCode.PLAYER_MOVE_FAILED]: 1310,
	[MagmaStreamErrorCode.PLAYER_VOICE_RECEIVER_ERROR]: 1311,

	// QUEUE
	[MagmaStreamErrorCode.QUEUE_REDIS_ERROR]: 1400,
	[MagmaStreamErrorCode.QUEUE_JSON_ERROR]: 1401,
	[MagmaStreamErrorCode.QUEUE_MEMORY_ERROR]: 1402,

	// FILTERS
	[MagmaStreamErrorCode.FILTER_APPLY_FAILED]: 1500,

	// REST
	[MagmaStreamErrorCode.REST_REQUEST_FAILED]: 1600,
	[MagmaStreamErrorCode.REST_UNAUTHORIZED]: 1601,

	// UTILS
	[MagmaStreamErrorCode.UTILS_TRACK_PARTIAL_INVALID]: 1700,
	[MagmaStreamErrorCode.UTILS_TRACK_BUILD_FAILED]: 1701,
	[MagmaStreamErrorCode.UTILS_AUTOPLAY_BUILD_FAILED]: 1702,

	// PLUGIN
	[MagmaStreamErrorCode.PLUGIN_LOAD_FAILED]: 1800,
	[MagmaStreamErrorCode.PLUGIN_RUNTIME_ERROR]: 1801,
};
