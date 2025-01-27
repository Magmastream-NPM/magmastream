/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-require-imports */
import { ClientUser, User } from "discord.js";
import { Manager } from "./Manager";
import { Node, NodeStats } from "./Node";
import { Player, Track, UnresolvedTrack } from "./Player";
import { Queue } from "./Queue";

/** @hidden */
const TRACK_SYMBOL = Symbol("track"),
	/** @hidden */
	UNRESOLVED_TRACK_SYMBOL = Symbol("unresolved"),
	SIZES = ["0", "1", "2", "3", "default", "mqdefault", "hqdefault", "maxresdefault"];

/**
 * Escapes a string by replacing special regex characters with their escaped counterparts.
 * @param str The string to escape.
 * @returns The escaped string.
 * @hidden
 */
const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export abstract class TrackUtils {
	static trackPartial: string[] | null = null;
	private static manager: Manager;

	/**
	 * Initializes the TrackUtils class with the given manager.
	 * @param manager The manager instance to use.
	 * @hidden
	 */
	public static init(manager: Manager): void {
		// Set the manager instance for TrackUtils.
		this.manager = manager;
	}

	/**
	 * Sets the partial properties for the Track class. If a Track has some of its properties removed by the partial,
	 * it will be considered a partial Track.
	 * @param partial The array of string property names to remove from the Track class.
	 */
	static setTrackPartial(partial: string[]): void {
		if (!Array.isArray(partial) || !partial.every((str) => typeof str === "string")) throw new Error("Provided partial is not an array or not a string array.");

		const defaultProperties = [
			/** The base64 encoded string of the track */
			"encoded",
			/** The plugin info of the track */
			"pluginInfo",
			/** The track identifier */
			"identifier",
			/** Whether the track is seekable */
			"isSeekable",
			/** The author of the track */
			"author",
			/** The length of the track in milliseconds */
			"length",
			/** The ISRC of the track */
			"isrc",
			/** Whether the track is a stream */
			"isStream",
			/** The title of the track */
			"title",
			/** The URI of the track */
			"uri",
			/** The artwork URL of the track */
			"artworkUrl",
			/** The source name of the track */
			"sourceName",
		];

		/** The array of property names that will be removed from the Track class */
		this.trackPartial = Array.from(new Set([...defaultProperties, ...partial]));

		/** Make sure that the "track" property is always included */
		if (!this.trackPartial.includes("track")) this.trackPartial.unshift("track");
	}

	/**
	 * Checks if the provided argument is a valid Track or UnresolvedTrack.
	 * If provided an array then every element will be checked.
	 * @param trackOrTracks The Track, UnresolvedTrack or array of Track/UnresolvedTrack to check.
	 * @returns {boolean} Whether the provided argument is a valid Track or UnresolvedTrack.
	 */
	static validate(trackOrTracks: unknown): boolean {
		/* istanbul ignore next */
		if (typeof trackOrTracks === "undefined") throw new RangeError("Provided argument must be present.");

		/* If the provided argument is an array */
		if (Array.isArray(trackOrTracks) && trackOrTracks.length) {
			/* Iterate through the array */
			for (const track of trackOrTracks) {
				/* If any element is not a valid Track or UnresolvedTrack, return false */
				if (!(track[TRACK_SYMBOL] || track[UNRESOLVED_TRACK_SYMBOL])) return false;
			}
			/* If all elements are valid Track or UnresolvedTrack, return true */
			return true;
		}

		/* If the provided argument is not an array */
		return (trackOrTracks[TRACK_SYMBOL] || trackOrTracks[UNRESOLVED_TRACK_SYMBOL]) === true;
	}

	/**
	 * Checks if the provided argument is a valid UnresolvedTrack.
	 * A valid UnresolvedTrack is an object that has the symbol UNRESOLVED_TRACK_SYMBOL set to true.
	 * @param track The object to check.
	 * @returns {boolean} Whether the provided object is a valid UnresolvedTrack.
	 */
	static isUnresolvedTrack(track: unknown): boolean {
		if (typeof track === "undefined") throw new RangeError("Provided argument must be present.");
		return track[UNRESOLVED_TRACK_SYMBOL] === true;
	}

	/**
	 * Checks if the provided argument is a valid Track.
	 * A valid Track is an object that has the symbol TRACK_SYMBOL set to true.
	 * @param track The object to check.
	 * @returns {boolean} Whether the provided object is a valid Track.
	 */
	static isTrack(track: unknown): boolean {
		if (typeof track === "undefined") throw new RangeError("Provided argument must be present.");
		return track[TRACK_SYMBOL] === true;
	}

	/**
	 * Builds a Track from the raw data from Lavalink and a optional requester.
	 * @param data The raw data from Lavalink to build the Track from.
	 * @param requester The user who requested the track, if any.
	 * @returns The built Track.
	 */
	static build<T = User | ClientUser>(data: TrackData, requester?: T): Track {
		if (typeof data === "undefined") throw new RangeError('Argument "data" must be present.');

		try {
			const track: Track = {
				track: data.encoded,
				title: data.info.title,
				identifier: data.info.identifier,
				author: data.info.author,
				duration: data.info.length,
				isrc: data.info?.isrc,
				isSeekable: data.info.isSeekable,
				isStream: data.info.isStream,
				uri: data.info.uri,
				artworkUrl: data.info?.artworkUrl,
				sourceName: data.info?.sourceName,
				thumbnail: data.info.uri.includes("youtube") ? `https://img.youtube.com/vi/${data.info.identifier}/default.jpg` : null,
				displayThumbnail(size = "default"): string | null {
					const finalSize = SIZES.find((s) => s === size) ?? "default";
					return this.uri.includes("youtube") ? `https://img.youtube.com/vi/${data.info.identifier}/${finalSize}.jpg` : null;
				},
				requester: requester as User | ClientUser,
				pluginInfo: data.pluginInfo,
				customData: {},
			};

			track.displayThumbnail = track.displayThumbnail.bind(track);

			if (this.trackPartial) {
				for (const key of Object.keys(track)) {
					if (this.trackPartial.includes(key)) continue;
					delete track[key];
				}
			}

			Object.defineProperty(track, TRACK_SYMBOL, {
				configurable: true,
				value: true,
			});

			return track;
		} catch (error) {
			throw new RangeError(`Argument "data" is not a valid track: ${error.message}`);
		}
	}

	/**
	 * Builds a UnresolvedTrack to be resolved before being played  .
	 * @param query The query to resolve the track from, can be a string or an UnresolvedQuery object.
	 * @param requester The user who requested the track, if any.
	 * @returns The built UnresolvedTrack.
	 */
	static buildUnresolved<T = User | ClientUser>(query: string | UnresolvedQuery, requester?: T): UnresolvedTrack {
		if (typeof query === "undefined") throw new RangeError('Argument "query" must be present.');

		let unresolvedTrack: Partial<UnresolvedTrack> = {
			requester: requester as User | ClientUser,
			async resolve(): Promise<void> {
				const resolved = await TrackUtils.getClosestTrack(this);
				Object.getOwnPropertyNames(this).forEach((prop) => delete this[prop]);
				Object.assign(this, resolved);
			},
		};

		if (typeof query === "string") unresolvedTrack.title = query;
		else unresolvedTrack = { ...unresolvedTrack, ...query };

		Object.defineProperty(unresolvedTrack, UNRESOLVED_TRACK_SYMBOL, {
			configurable: true,
			value: true,
		});

		return unresolvedTrack as UnresolvedTrack;
	}

	/**
	 * Resolves the closest matching Track for a given UnresolvedTrack.
	 *
	 * @param unresolvedTrack The UnresolvedTrack object to resolve.
	 *
	 * @returns A Promise that resolves to a Track object.
	 *
	 * @throws {RangeError} If the manager has not been initialized or the provided track is not an UnresolvedTrack.
	 *
	 * The method performs a search using the track's URI or a combination of its author and title.
	 * It attempts to find an exact match for the author and title, or a track with a similar duration.
	 * If no exact or similar match is found, it returns the first track from the search results.
	 * The customData from the UnresolvedTrack is retained in the final resolved Track.
	 */
	static async getClosestTrack(unresolvedTrack: UnresolvedTrack): Promise<Track> {
		if (!TrackUtils.manager) throw new RangeError("Manager has not been initiated.");

		if (!TrackUtils.isUnresolvedTrack(unresolvedTrack)) throw new RangeError("Provided track is not a UnresolvedTrack.");

		const query = unresolvedTrack.uri ? unresolvedTrack.uri : [unresolvedTrack.author, unresolvedTrack.title].filter(Boolean).join(" - ");
		const res = await TrackUtils.manager.search(query, unresolvedTrack.requester);

		if (unresolvedTrack.author) {
			const channelNames = [unresolvedTrack.author, `${unresolvedTrack.author} - Topic`];

			const originalAudio = res.tracks.find((track) => {
				return (
					channelNames.some((name) => new RegExp(`^${escapeRegExp(name)}$`, "i").test(track.author)) ||
					new RegExp(`^${escapeRegExp(unresolvedTrack.title)}$`, "i").test(track.title)
				);
			});

			if (originalAudio) return originalAudio;
		}

		if (unresolvedTrack.duration) {
			const sameDuration = res.tracks.find((track) => track.duration >= unresolvedTrack.duration - 1500 && track.duration <= unresolvedTrack.duration + 1500);

			if (sameDuration) return sameDuration;
		}

		const finalTrack = res.tracks[0];
		finalTrack.customData = unresolvedTrack.customData;
		return finalTrack;
	}
}

/** Gets or extends structures to extend the built in, or already extended, classes to add more functionality. */
export abstract class Structure {
	/**
	 * Extends a class.
	 * @param name
	 * @param extender
	 */
	public static extend<K extends keyof Extendable, T extends Extendable[K]>(name: K, extender: (target: Extendable[K]) => T): T {
		if (!structures[name]) throw new TypeError(`"${name} is not a valid structure`);
		const extended = extender(structures[name]);
		structures[name] = extended;
		return extended;
	}

	/**
	 * Get a structure from available structures by name.
	 * @param name
	 */
	public static get<K extends keyof Extendable>(name: K): Extendable[K] {
		const structure = structures[name];
		if (!structure) throw new TypeError('"structure" must be provided.');
		return structure;
	}
}

export class Plugin {
	public load(manager: Manager): void {}

	public unload(manager: Manager): void {}
}

const structures = {
	Player: require("./Player").Player,
	Queue: require("./Queue").Queue,
	Node: require("./Node").Node,
};

export interface UnresolvedQuery {
	/** The title of the unresolved track. */
	title: string;
	/** The author of the unresolved track. If provided it will have a more precise search. */
	author?: string;
	/** The duration of the unresolved track. If provided it will have a more precise search. */
	duration?: number;
}

export type Sizes = "0" | "1" | "2" | "3" | "default" | "mqdefault" | "hqdefault" | "maxresdefault";

export enum LoadTypes {
	Track = "track",
	Playlist = "playlist",
	Search = "search",
	Empty = "empty",
	Error = "error",
}

export type LoadType = keyof typeof LoadTypes;

export enum StateTypes {
	Connected = "CONNECTED",
	Connecting = "CONNECTING",
	Disconnected = "DISCONNECTED",
	Disconnecting = "DISCONNECTING",
	Destroying = "DESTROYING",
}

export type State = keyof typeof StateTypes;

export type SponsorBlockSegmentEvents = SponsorBlockSegmentSkipped | SponsorBlockSegmentsLoaded | SponsorBlockChapterStarted | SponsorBlockChaptersLoaded;

export type SponsorBlockSegmentEventType = "SegmentSkipped" | "SegmentsLoaded" | "ChapterStarted" | "ChaptersLoaded";

export type PlayerEvents = TrackStartEvent | TrackEndEvent | TrackStuckEvent | TrackExceptionEvent | WebSocketClosedEvent | SponsorBlockSegmentEvents;

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

export enum TrackEndReasonTypes {
	Finished = "finished",
	LoadFailed = "loadFailed",
	Stopped = "stopped",
	Replaced = "replaced",
	Cleanup = "cleanup",
}
export type TrackEndReason = keyof typeof TrackEndReasonTypes;

export enum SeverityTypes {
	Common = "common",
	Suspicious = "suspicious",
	Fault = "fault",
}
export type Severity = keyof typeof SeverityTypes;

export interface TrackData {
	/** The track information. */
	encoded: string;
	/** The detailed information of the track. */
	info: TrackDataInfo;
	/** Additional track info provided by plugins. */
	pluginInfo: Record<string, string>;
}

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

export enum TrackSourceTypes {
	AppleMusic = "applemusic",
	Bandcamp = "bandcamp",
	Deezer = "deezer",
	Jiosaavn = "jiosaavn",
	SoundCloud = "soundcloud",
	Spotify = "spotify",
	Tidal = "tidal",
	VKMusic = "vkmusic",
	YouTube = "youtube",
}

export type TrackSourceName = keyof typeof TrackSourceTypes;

export interface Extendable {
	Player: typeof Player;
	Queue: typeof Queue;
	Node: typeof Node;
}

export interface VoiceState {
	op: "voiceUpdate";
	guildId: string;
	event: VoiceServer;
	sessionId?: string;
}

export interface VoiceServer {
	token: string;
	guild_id: string;
	endpoint: string;
}

export interface VoiceState {
	guild_id: string;
	user_id: string;
	session_id: string;
	channel_id: string;
}

export interface VoicePacket {
	t?: "VOICE_SERVER_UPDATE" | "VOICE_STATE_UPDATE";
	d: VoiceState | VoiceServer;
}

export interface NodeMessage extends NodeStats {
	type: PlayerEventType;
	op: "stats" | "playerUpdate" | "event";
	guildId: string;
}

export interface PlayerEvent {
	op: "event";
	type: PlayerEventType;
	guildId: string;
}

export interface Exception {
	message: string;
	severity: SeverityTypes;
	cause: string;
}

export interface TrackStartEvent extends PlayerEvent {
	type: "TrackStartEvent";
	track: TrackData;
}

export interface TrackEndEvent extends PlayerEvent {
	type: "TrackEndEvent";
	track: TrackData;
	reason: TrackEndReasonTypes;
}

export interface TrackExceptionEvent extends PlayerEvent {
	exception?: Exception;
	guildId: string;
	type: "TrackExceptionEvent";
}

export interface TrackStuckEvent extends PlayerEvent {
	type: "TrackStuckEvent";
	thresholdMs: number;
}

export interface WebSocketClosedEvent extends PlayerEvent {
	type: "WebSocketClosedEvent";
	code: number;
	reason: string;
	byRemote: boolean;
}

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
