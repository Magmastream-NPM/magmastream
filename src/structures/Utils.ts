/* eslint-disable @typescript-eslint/no-require-imports */
import axios from "axios";
import { JSDOM } from "jsdom";
import { AutoPlayPlatform, LoadTypes, MagmaStreamErrorCode, SearchPlatform, TrackPartial } from "./Enums";
import { Manager } from "./Manager";
import { AnyUser, ErrorOrEmptySearchResult, Extendable, LavalinkResponse, PlaylistRawData, SearchResult, Track, TrackData, TrackSourceName } from "./Types";
import { Player } from "./Player";
import path from "path";
import stringify from "safe-stable-stringify";
import { MagmaStreamError } from "./MagmastreamError";
// import playwright from "playwright";

/** @hidden */
const SIZES = ["0", "1", "2", "3", "default", "mqdefault", "hqdefault", "maxresdefault"];

export abstract class TrackUtils {
	static trackPartial: TrackPartial[] | null = null;
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
	 * @param {TrackPartial} partial The array of string property names to remove from the Track class.
	 */
	static setTrackPartial(partial: TrackPartial[]): void {
		if (!Array.isArray(partial) || !partial.every((str) => typeof str === "string")) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.UTILS_TRACK_PARTIAL_INVALID,
				message: "Partial must be an array of strings.",
			});
		}

		const defaultProperties = [
			TrackPartial.Track,
			TrackPartial.Title,
			TrackPartial.Identifier,
			TrackPartial.Author,
			TrackPartial.Duration,
			TrackPartial.Isrc,
			TrackPartial.IsSeekable,
			TrackPartial.IsStream,
			TrackPartial.Uri,
			TrackPartial.ArtworkUrl,
			TrackPartial.SourceName,
			TrackPartial.ThumbNail,
			TrackPartial.Requester,
			TrackPartial.PluginInfo,
			TrackPartial.CustomData,
		];

		/** The array of property names that will be removed from the Track class */
		this.trackPartial = Array.from(new Set([...defaultProperties, ...partial]));

		/** Make sure that the "track" property is always included */
		if (!this.trackPartial.includes(TrackPartial.Track)) this.trackPartial.unshift(TrackPartial.Track);
	}

	/**
	 * Checks if the provided argument is a valid Track.
	 * If provided an array then every element will be checked.
	 * @param trackOrTracks The Track or array of Tracks to check.
	 * @returns {boolean} Whether the provided argument is a valid Track.
	 */
	static validate(trackOrTracks: unknown): boolean {
		if (typeof trackOrTracks !== "object" || trackOrTracks === null) {
			return false;
		}

		const isValidTrack = (track: unknown): track is Track => {
			if (typeof track !== "object" || track === null) {
				return false;
			}
			const t = track as Record<string, unknown>;
			return (
				typeof t.track === "string" && typeof t.title === "string" && typeof t.identifier === "string" && typeof t.isrc === "string" && typeof t.uri === "string"
			);
		};

		if (Array.isArray(trackOrTracks)) {
			return trackOrTracks.every(isValidTrack);
		}

		return isValidTrack(trackOrTracks);
	}

	/**
	 * Builds a Track from the raw data from Lavalink and a optional requester.
	 * @param data The raw data from Lavalink to build the Track from.
	 * @param requester The user who requested the track, if any.
	 * @returns The built Track.
	 */
	static build<T = AnyUser>(data: TrackData, requester?: T): Track {
		if (typeof data === "undefined") {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.UTILS_TRACK_BUILD_FAILED,
				message: 'Argument "data" must be present.',
			});
		}

		try {
			const sourceNameMap: Record<string, TrackSourceName> = {
				applemusic: "AppleMusic",
				audius: "Audius",
				bandcamp: "Bandcamp",
				deezer: "Deezer",
				jiosaavn: "Jiosaavn",
				soundcloud: "SoundCloud",
				spotify: "Spotify",
				tidal: "Tidal",
				youtube: "YouTube",
				vkmusic: "VKMusic",
				qobuz: "Qobuz",
				http: "Http",
				tts: "Tts",
				clypit: "Clypit",
				pornhub: "Pornhub",
				soundgasm: "Soundgasm",
				reddit: "Reddit",
				flowertts: "Flowertts",
				ocremix: "Ocremix",
				mixcloud: "Mixcloud",
				tiktok: "TikTok",
			};

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
				artworkUrl: data.info?.artworkUrl ?? null,
				sourceName: sourceNameMap[data.info?.sourceName?.toLowerCase() ?? ""] ?? data.info?.sourceName,
				thumbnail: data.info.uri.includes("youtube") ? `https://img.youtube.com/vi/${data.info.identifier}/default.jpg` : null,
				displayThumbnail(size = "default"): string | null {
					const finalSize = SIZES.find((s) => s === size) ?? "default";
					return this.uri.includes("youtube") ? `https://img.youtube.com/vi/${data.info.identifier}/${finalSize}.jpg` : null;
				},
				requester: requester as AnyUser,
				pluginInfo: data.pluginInfo,
				customData: {},
			};

			track.displayThumbnail = track.displayThumbnail.bind(track);

			if (this.trackPartial) {
				for (const key of Object.keys(track)) {
					if (this.trackPartial.includes(key as TrackPartial)) continue;
					delete track[key];
				}
			}

			return track;
		} catch (error) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.UTILS_TRACK_BUILD_FAILED,
				message: `Argument "data" is not a valid track: ${error.message}`,
				context: {
					data,
					requester,
				},
			});
		}
	}

	/**
	 * Validates a search result.
	 * @param result The search result to validate.
	 * @returns Whether the search result is valid.
	 */
	static isErrorOrEmptySearchResult(result: SearchResult): result is ErrorOrEmptySearchResult {
		return result.loadType === LoadTypes.Empty || result.loadType === LoadTypes.Error;
	}

	/**
	 * Revives a track.
	 * @param track The track to revive.
	 * @returns The revived track.
	 */
	static revive(track: Track): Track {
		if (!track) return track;

		track.displayThumbnail = function (size = "default"): string | null {
			const finalSize = SIZES.find((s) => s === size) ?? "default";
			return this.uri.includes("youtube") ? `https://img.youtube.com/vi/${this.identifier}/${finalSize}.jpg` : null;
		}.bind(track);

		return track;
	}
}

export abstract class AutoPlayUtils {
	private static manager: Manager;
	// private static cachedAccessToken: string | null = null;
	// private static cachedAccessTokenExpiresAt: number = 0;

	/**
	 * Initializes the AutoPlayUtils class with the given manager.
	 * @param manager The manager instance to use.
	 * @hidden
	 */
	public static async init(manager: Manager): Promise<void> {
		if (!manager) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.GENERAL_INVALID_MANAGER,
				message: "AutoPlayUtils requires a valid Manager instance.",
			});
		}
		this.manager = manager;
	}

	/**
	 * Gets recommended tracks for the given track.
	 * @param track The track to get recommended tracks for.
	 * @returns An array of recommended tracks.
	 */
	public static async getRecommendedTracks(track: Track): Promise<Track[]> {
		const node = this.manager.useableNode;
		if (!node) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_NO_NODES,
				message: "No available nodes to get recommended tracks from.",
				context: { track },
			});
		}

		const apiKey = this.manager.options.lastFmApiKey;

		// Check if Last.fm API is available
		if (apiKey) {
			return await this.getRecommendedTracksFromLastFm(track, apiKey);
		}

		const enabledSources = node.info.sourceManagers;
		const autoPlaySearchPlatforms: AutoPlayPlatform[] = this.manager.options.autoPlaySearchPlatforms;

		// Iterate over autoplay platforms in order of priority
		for (const platform of autoPlaySearchPlatforms) {
			if (enabledSources.includes(platform)) {
				const recommendedTracks = await this.getRecommendedTracksFromSource(track, platform);

				// If tracks are found, return them immediately
				if (recommendedTracks.length > 0) {
					return recommendedTracks;
				}
			}
		}

		return [];
	}

	/**
	 * Gets recommended tracks from Last.fm for the given track.
	 * @param track The track to get recommended tracks for.
	 * @param apiKey The API key for Last.fm.
	 * @returns An array of recommended tracks.
	 */
	static async getRecommendedTracksFromLastFm(track: Track, apiKey: string): Promise<Track[]> {
		let { author: artist } = track;
		const { title } = track;

		if (!artist || !title) {
			if (!title) {
				// No title provided, search for the artist's top tracks
				const noTitleUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;

				const response = await axios.get(noTitleUrl);

				if (response.data.error || !response.data.toptracks?.track?.length) {
					return [];
				}

				const randomTrack = response.data.toptracks.track[Math.floor(Math.random() * response.data.toptracks.track.length)];
				const resolvedTracks = await this.resolveTracksFromQuery(
					`${randomTrack.artist.name} - ${randomTrack.name}`,
					this.manager.options.defaultSearchPlatform,
					track.requester
				);

				if (!resolvedTracks.length) return [];

				return resolvedTracks;
			}
			if (!artist) {
				// No artist provided, search for the track title
				const noArtistUrl = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${title}&api_key=${apiKey}&format=json`;

				const response = await axios.get(noArtistUrl);
				artist = response.data.results.trackmatches?.track?.[0]?.artist;

				if (!artist) {
					return [];
				}
			}
		}

		// Search for similar tracks to the current track
		const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${artist}&track=${title}&limit=10&autocorrect=1&api_key=${apiKey}&format=json`;

		let response: axios.AxiosResponse;

		try {
			response = await axios.get(url);
		} catch (error) {
			console.error("[AutoPlay] Error fetching similar tracks from Last.fm:", error);
			return [];
		}

		if (response.data.error || !response.data.similartracks?.track?.length) {
			// Retry the request if the first attempt fails
			const retryUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
			const retryResponse = await axios.get(retryUrl);

			if (retryResponse.data.error || !retryResponse.data.toptracks?.track?.length) {
				return [];
			}

			const randomTrack = retryResponse.data.toptracks.track[Math.floor(Math.random() * retryResponse.data.toptracks.track.length)];
			const resolvedTracks = await this.resolveTracksFromQuery(
				`${randomTrack.artist.name} - ${randomTrack.name}`,
				this.manager.options.defaultSearchPlatform,
				track.requester
			);

			if (!resolvedTracks.length) return [];

			const filteredTracks = resolvedTracks.filter((t) => t.uri !== track.uri);
			if (!filteredTracks.length) {
				return [];
			}

			return filteredTracks;
		}

		const randomTrack = response.data.similartracks.track.sort(() => Math.random() - 0.5).shift();

		if (!randomTrack) {
			return [];
		}

		const resolvedTracks = await this.resolveTracksFromQuery(
			`${randomTrack.artist.name} - ${randomTrack.name}`,
			this.manager.options.defaultSearchPlatform,
			track.requester
		);

		if (!resolvedTracks.length) return [];

		return resolvedTracks;
	}

	/**
	 * Gets recommended tracks from the given source.
	 * @param track The track to get recommended tracks for.
	 * @param platform The source to get recommended tracks from.
	 * @returns An array of recommended tracks.
	 */
	static async getRecommendedTracksFromSource(track: Track, platform: AutoPlayPlatform): Promise<Track[]> {
		const requester = track.requester;
		const parsedURL = new URL(track.uri);

		switch (platform) {
			case AutoPlayPlatform.Spotify: {
				const allowedSpotifyHosts = ["open.spotify.com", "www.spotify.com"];
				if (!allowedSpotifyHosts.includes(parsedURL.host)) {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.Spotify, requester);

					if (!resolvedTrack) return [];

					track = resolvedTrack;
				}

				// const extractSpotifyArtistID = (url: string): string | null => {
				// 	const regex = /https:\/\/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/;
				// 	const match = url.match(regex);
				// 	return match ? match[1] : null;
				// };

				// const identifier = `sprec:seed_artists=${extractSpotifyArtistID(track.pluginInfo.artistUrl)}&seed_tracks=${track.identifier}`;
				const identifier = `sprec:mix:track:${track.identifier}`;
				const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;
				const tracks = this.buildTracksFromResponse(recommendedResult, requester);

				return tracks;
			}

			case AutoPlayPlatform.Deezer: {
				const allowedDeezerHosts = ["deezer.com", "www.deezer.com", "www.deezer.page.link"];
				if (!allowedDeezerHosts.includes(parsedURL.host)) {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.Deezer, requester);

					if (!resolvedTrack) return [];

					track = resolvedTrack;
				}

				const identifier = `dzrec:${track.identifier}`;
				const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;
				const tracks = this.buildTracksFromResponse(recommendedResult, requester);

				return tracks;
			}

			case AutoPlayPlatform.SoundCloud: {
				const allowedSoundCloudHosts = ["soundcloud.com", "www.soundcloud.com"];
				if (!allowedSoundCloudHosts.includes(parsedURL.host)) {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.SoundCloud, requester);

					if (!resolvedTrack) return [];

					track = resolvedTrack;
				}

				try {
					const recommendedRes = await axios.get(`${track.uri}/recommended`).catch((err) => {
						console.error(`[AutoPlay] Failed to fetch SoundCloud recommendations. Status: ${err.response?.status || "Unknown"}`, err.message);
						return null;
					});

					if (!recommendedRes) {
						return [];
					}

					const html = recommendedRes.data;

					const dom = new JSDOM(html);
					const window = dom.window;

					// Narrow the element types using instanceof
					const secondNoscript = window.querySelectorAll("noscript")[1];
					if (!secondNoscript || !(secondNoscript instanceof window.Element)) return [];

					const sectionElement = secondNoscript.querySelector("section");
					if (!sectionElement || !(sectionElement instanceof window.HTMLElement)) return [];

					const articleElements = sectionElement.querySelectorAll("article");

					if (!articleElements || articleElements.length === 0) return [];

					const urls = Array.from(articleElements)
						.map((element) => {
							const h2 = element.querySelector('h2[itemprop="name"]');
							if (!h2) return null;

							const a = h2.querySelector('a[itemprop="url"]');
							if (!a) return null;

							const href = a.getAttribute("href");
							return href ? `https://soundcloud.com${href}` : null;
						})
						.filter(Boolean);

					if (!urls.length) return [];

					const randomUrl = urls[Math.floor(Math.random() * urls.length)];
					const resolvedTrack = await this.resolveFirstTrackFromQuery(randomUrl, SearchPlatform.SoundCloud, requester);

					return resolvedTrack ? [resolvedTrack] : [];
				} catch (error) {
					console.error("[AutoPlay] Error occurred while fetching soundcloud recommendations:", error);
					return [];
				}
			}

			case AutoPlayPlatform.YouTube: {
				const allowedYouTubeHosts = ["youtube.com", "youtu.be"];
				const hasYouTubeURL = allowedYouTubeHosts.some((url) => track.uri.includes(url));
				let videoID: string | null = null;

				if (hasYouTubeURL) {
					videoID = track.uri.split("=").pop();
				} else {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.YouTube, requester);

					if (!resolvedTrack) return [];

					videoID = resolvedTrack.uri.split("=").pop();
				}

				if (!videoID) {
					return [];
				}

				let randomIndex: number;
				let searchURI: string;

				do {
					randomIndex = Math.floor(Math.random() * 23) + 2;
					searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}&index=${randomIndex}`;
				} while (track.uri.includes(searchURI));
				const resolvedTracks = await this.resolveTracksFromQuery(searchURI, SearchPlatform.YouTube, requester);
				const filteredTracks = resolvedTracks.filter((t) => t.uri !== track.uri);

				return filteredTracks;
			}

			case AutoPlayPlatform.Tidal: {
				const allowedTidalHosts = ["tidal.com", "www.tidal.com"];
				if (!allowedTidalHosts.includes(parsedURL.host)) {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.Tidal, requester);

					if (!resolvedTrack) return [];

					track = resolvedTrack;
				}

				const identifier = `tdrec:${track.identifier}`;
				const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;
				const tracks = this.buildTracksFromResponse(recommendedResult, requester);

				return tracks;
			}

			case AutoPlayPlatform.VKMusic: {
				const allowedVKHosts = ["vk.com", "www.vk.com", "vk.ru", "www.vk.ru"];
				if (!allowedVKHosts.includes(parsedURL.host)) {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.VKMusic, requester);

					if (!resolvedTrack) return [];

					track = resolvedTrack;
				}

				const identifier = `vkrec:${track.identifier}`;
				const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;
				const tracks = this.buildTracksFromResponse(recommendedResult, requester);

				return tracks;
			}

			case AutoPlayPlatform.Qobuz: {
				const allowedQobuzHosts = ["qobuz.com", "www.qobuz.com", "play.qobuz.com"];
				if (!allowedQobuzHosts.includes(parsedURL.host)) {
					const resolvedTrack = await this.resolveFirstTrackFromQuery(`${track.author} - ${track.title}`, SearchPlatform.Qobuz, requester);

					if (!resolvedTrack) return [];

					track = resolvedTrack;
				}

				const identifier = `qbrec:${track.identifier}`;
				const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;
				const tracks = this.buildTracksFromResponse(recommendedResult, requester);

				return tracks;
			}

			default:
				return [];
		}
	}

	/**
	 * Searches for a track using the manager and returns resolved tracks.
	 * @param query The search query (artist - title).
	 * @param requester The requester who initiated the search.
	 * @returns An array of resolved tracks, or an empty array if not found or error occurred.
	 */
	private static async resolveTracksFromQuery(query: string, source: SearchPlatform, requester: unknown): Promise<Track[]> {
		try {
			const searchResult = await this.manager.search({ query, source }, requester);

			if (TrackUtils.isErrorOrEmptySearchResult(searchResult)) {
				return [];
			}

			switch (searchResult.loadType) {
				case LoadTypes.Album:
				case LoadTypes.Artist:
				case LoadTypes.Station:
				case LoadTypes.Podcast:
				case LoadTypes.Show:
				case LoadTypes.Playlist:
					return searchResult.playlist.tracks;
				case LoadTypes.Track:
				case LoadTypes.Search:
				case LoadTypes.Short:
					return searchResult.tracks;
				default:
					return [];
			}
		} catch (error) {
			console.error("[TrackResolver] Failed to resolve query:", query, error);
			return [];
		}
	}

	/**
	 * Resolves the first available track from a search query using the specified source.
	 * Useful for normalizing tracks that lack platform-specific metadata or URIs.
	 *
	 * @param query - The search query string (usually "Artist - Title").
	 * @param source - The search platform to use (e.g., Spotify, Deezer, YouTube).
	 * @param requester - The requester object, used for context or attribution.
	 * @returns A single resolved {@link Track} object if found, or `null` if the search fails or returns no results.
	 */
	private static async resolveFirstTrackFromQuery(query: string, source: SearchPlatform, requester: unknown): Promise<Track | null> {
		try {
			const searchResult = await this.manager.search({ query, source }, requester);

			if (TrackUtils.isErrorOrEmptySearchResult(searchResult)) return null;

			switch (searchResult.loadType) {
				case LoadTypes.Album:
				case LoadTypes.Artist:
				case LoadTypes.Station:
				case LoadTypes.Podcast:
				case LoadTypes.Show:
				case LoadTypes.Playlist:
					return searchResult.playlist.tracks[0] || null;
				case LoadTypes.Track:
				case LoadTypes.Search:
				case LoadTypes.Short:
					return searchResult.tracks[0] || null;
				default:
					return null;
			}
		} catch (err) {
			console.error(`[AutoPlay] Failed to resolve track from query: "${query}" on source: ${source}`, err);
			return null;
		}
	}

	private static isPlaylistRawData(data: unknown): data is PlaylistRawData {
		return typeof data === "object" && data !== null && Array.isArray((data as PlaylistRawData).tracks);
	}

	private static isTrackData(data: unknown): data is TrackData {
		return typeof data === "object" && data !== null && "encoded" in data && "info" in data;
	}

	private static isTrackDataArray(data: unknown): data is TrackData[] {
		return (
			Array.isArray(data) &&
			data.every((track) => typeof track === "object" && track !== null && "encoded" in track && "info" in track && typeof track.encoded === "string")
		);
	}

	static buildTracksFromResponse<T>(recommendedResult: LavalinkResponse, requester?: T): Track[] {
		if (!recommendedResult) return [];

		if (TrackUtils.isErrorOrEmptySearchResult(recommendedResult as unknown as SearchResult)) return [];

		switch (recommendedResult.loadType) {
			case LoadTypes.Track: {
				const data = recommendedResult.data;

				if (!this.isTrackData(data)) {
					throw new MagmaStreamError({
						code: MagmaStreamErrorCode.UTILS_AUTOPLAY_BUILD_FAILED,
						message: "Invalid TrackData object.",
						context: { recommendedResult },
					});
				}

				return [TrackUtils.build(data, requester)];
			}

			case LoadTypes.Short:
			case LoadTypes.Search: {
				const data = recommendedResult.data;

				if (!this.isTrackDataArray(data)) {
					throw new MagmaStreamError({
						code: MagmaStreamErrorCode.UTILS_AUTOPLAY_BUILD_FAILED,
						message: "Invalid TrackData[] array for LoadTypes.Search or Short.",
						context: { recommendedResult },
					});
				}

				return data.map((d) => TrackUtils.build(d, requester));
			}
			case LoadTypes.Album:
			case LoadTypes.Artist:
			case LoadTypes.Station:
			case LoadTypes.Podcast:
			case LoadTypes.Show:
			case LoadTypes.Playlist: {
				const data = recommendedResult.data;

				if (this.isPlaylistRawData(data)) {
					return data.tracks.map((d) => TrackUtils.build(d, requester));
				}

				throw new MagmaStreamError({
					code: MagmaStreamErrorCode.UTILS_AUTOPLAY_BUILD_FAILED,
					message: "Invalid playlist data for loadType: " + recommendedResult.loadType,
					context: { recommendedResult },
				});
			}
			default:
				throw new MagmaStreamError({
					code: MagmaStreamErrorCode.UTILS_AUTOPLAY_BUILD_FAILED,
					message: "Unsupported loadType: " + recommendedResult.loadType,
					context: { recommendedResult },
				});
		}
	}
}

export abstract class PlayerUtils {
	private static manager: Manager;

	/**
	 * Initializes the PlayerUtils class with the given manager.
	 * @param manager The manager instance to use.
	 * @hidden
	 */
	public static init(manager: Manager): void {
		if (!manager) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.GENERAL_INVALID_MANAGER,
				message: "PlayerUtils requires a valid Manager instance.",
			});
		}
		this.manager = manager;
	}

	/**
	 * Serializes a Player instance to avoid circular references.
	 * @param player The Player instance to serialize
	 * @returns The serialized Player instance
	 */
	public static async serializePlayer(player: Player): Promise<Record<string, unknown>> {
		try {
			const current = await player.queue.getCurrent();
			const tracks = await player.queue.getTracks();
			const previous = await player.queue.getPrevious();

			const serializeTrack = (track: Track) => ({
				...track,
				requester: track.requester ? { id: track.requester.id, username: track.requester.username } : null,
			});

			const safeNode = player.node
				? JSON.parse(
						JSON.stringify(player.node, (key, value) => {
							if (key === "rest" || key === "players" || key === "shards" || key === "manager") return undefined;
							return value;
						})
				  )
				: null;

			return JSON.parse(
				JSON.stringify(player, (key, value) => {
					if (key === "manager") return null;

					if (key === "node") return safeNode;

					if (key === "filters") {
						return {
							distortion: value?.distortion ?? null,
							equalizer: value?.equalizer ?? [],
							karaoke: value?.karaoke ?? null,
							rotation: value?.rotation ?? null,
							timescale: value?.timescale ?? null,
							vibrato: value?.vibrato ?? null,
							reverb: value?.reverb ?? null,
							volume: value?.volume ?? 1.0,
							bassBoostlevel: value?.bassBoostlevel ?? null,
							filterStatus: value?.filtersStatus ? { ...value.filtersStatus } : {},
						};
					}

					if (key === "queue") {
						return {
							current: current ? serializeTrack(current) : null,
							tracks: tracks.map(serializeTrack),
							previous: previous.map(serializeTrack),
						};
					}

					if (key === "data") {
						return {
							clientUser: value?.Internal_AutoplayUser ?? null,
							nowPlayingMessage: value?.nowPlayingMessage ?? null,
						};
					}

					return value;
				})
			);
		} catch (err) {
			throw err instanceof MagmaStreamError
				? err
				: new MagmaStreamError({
						code: MagmaStreamErrorCode.MANAGER_SEARCH_FAILED,
						message: `An error occurred while searching: ${err instanceof Error ? err.message : String(err)}`,
						cause: err instanceof Error ? err : undefined,
				  });
		}
	}

	/**
	 * Gets the base directory for player data.
	 */
	public static getPlayersBaseDir(): string {
		return path.join(process.cwd(), "magmastream", "sessionData", "players");
	}

	/**
	 * Gets the path to the player's directory.
	 */
	public static getGuildDir(guildId: string): string {
		return path.join(this.getPlayersBaseDir(), guildId);
	}

	/**
	 * Gets the path to the player's state file.
	 */
	public static getPlayerStatePath(guildId: string): string {
		return path.join(this.getGuildDir(guildId), "state.json");
	}

	/**
	 * Gets the path to the player's current track file.
	 */
	public static getPlayerCurrentPath(guildId: string): string {
		return path.join(this.getGuildDir(guildId), "current.json");
	}

	/**
	 * Gets the path to the player's queue file.
	 */
	public static getPlayerQueuePath(guildId: string): string {
		return path.join(this.getGuildDir(guildId), "queue.json");
	}

	/**
	 * Gets the path to the player's previous tracks file.
	 */
	public static getPlayerPreviousPath(guildId: string): string {
		return path.join(this.getGuildDir(guildId), "previous.json");
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

export abstract class JSONUtils {
	static safe<T>(obj: T, space?: number): string {
		return stringify(obj, null, space);
	}

	static serializeTrack(track: Track) {
		const serialized = {
			...track,
			requester: track.requester ? { id: track.requester.id, username: track.requester.username } : null,
		};

		return JSON.stringify(serialized);
	}
}

const structures = {
	Player: require("./Player").Player,
	Queue: require("../statestorage/MemoryQueue").MemoryQueue,
	Node: require("./Node").Node,
	Filters: require("./Filters").Filters,
	Manager: require("./Manager").Manager,
	Plugin: require("./Plugin").Plugin,
	Rest: require("./Rest").Rest,
	Utils: require("./Utils"),
};
