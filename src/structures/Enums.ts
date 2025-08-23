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
	AppleMusic = "applemusic",
	Bandcamp = "bandcamp",
	Deezer = "deezer",
	Jiosaavn = "jiosaavn",
	Qobuz = "qobuz",
	SoundCloud = "soundcloud",
	Spotify = "spotify",
	Tidal = "tidal",
	VKMusic = "vkmusic",
	YouTube = "youtube",
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
