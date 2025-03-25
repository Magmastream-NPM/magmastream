/* eslint-disable @typescript-eslint/no-require-imports */
import { ClientUser, User } from "discord.js";
import { LavalinkResponse, Manager, PlaylistInfoData, PlaylistRawData, SearchPlatform, SearchResult, TrackPartial } from "./Manager";
import { Node, NodeStats } from "./Node";
import { Player, Track } from "./Player";
import { Queue } from "./Queue";
import axios from "axios";
import { JSDOM } from "jsdom";
import crypto from "crypto";

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
		if (!Array.isArray(partial) || !partial.every((str) => typeof str === "string")) throw new Error("Provided partial is not an array or not a string array.");

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
	static build<T = User | ClientUser>(data: TrackData, requester?: T): Track {
		if (typeof data === "undefined") throw new RangeError('Argument "data" must be present.');

		try {
			const sourceNameMap: Record<string, TrackSourceName> = {
				applemusic: "AppleMusic",
				bandcamp: "Bandcamp",
				deezer: "Deezer",
				jiosaavn: "Jiosaavn",
				soundcloud: "SoundCloud",
				spotify: "Spotify",
				tidal: "Tidal",
				youtube: "YouTube",
				vkmusic: "VKMusic",
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
				artworkUrl: data.info?.artworkUrl,
				sourceName: sourceNameMap[data.info?.sourceName?.toLowerCase() ?? ""] ?? data.info?.sourceName,
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
					if (this.trackPartial.includes(key as TrackPartial)) continue;
					delete track[key];
				}
			}

			return track;
		} catch (error) {
			throw new RangeError(`Argument "data" is not a valid track: ${error.message}`);
		}
	}
}

export abstract class AutoPlayUtils {
	private static manager: Manager;

	/**
	 * Initializes the AutoPlayUtils class with the given manager.
	 * @param manager The manager instance to use.
	 * @hidden
	 */
	public static init(manager: Manager): void {
		if (!manager) throw new Error("AutoPlayUtils.init() requires a valid Manager instance.");
		this.manager = manager;
	}

	public static async getRecommendedTracks(player: Player, track: Track, attempt: number = 0): Promise<Track[]> {
		console.log(`[AutoPlay] Attempt ${attempt} for track: ${track.title}`);

		const node = this.manager.useableNode;
		if (!node) {
			console.error("[AutoPlay] No available nodes.");
			throw new Error("No available nodes.");
		}

		if (!player.isAutoplay) {
			console.log("[AutoPlay] Autoplay is disabled. Returning an empty array.");
			return [];
		}

		if (attempt >= player.autoplayTries) {
			console.warn(`[AutoPlay] Reached max autoplay attempts (${player.autoplayTries}).`);
			return [];
		}

		if (!player.queue.previous.length) {
			console.log("[AutoPlay] No previous tracks in the queue. Cannot generate recommendations.");
			return [];
		}

		const apiKey = this.manager.options.lastFmApiKey;
		const enabledSources = node.info.sourceManagers;
		const { autoPlaySearchPlatform } = this.manager.options;

		console.log(`[AutoPlay] Enabled sources: ${enabledSources.join(", ")}`);
		console.log(`[AutoPlay] Preferred autoplay platform: ${autoPlaySearchPlatform}`);

		const supportedPlatforms: string[] = ["spotify", "deezer", "soundcloud", "youtube"];

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

		const mappedPlatform = platformMapping[autoPlaySearchPlatform];

		// Last attempt fallback to YouTube
		if (attempt === player.autoplayTries - 1 && player.autoplayTries > 1 && enabledSources.includes("youtube")) {
			console.log("[AutoPlay] Final attempt: Falling back to YouTube recommendations.");
			return await this.getRecommendedTracksFromYouTube(track);
		}

		// Check if the preferred autoplay platform is supported and enabled
		if (mappedPlatform && supportedPlatforms.includes(mappedPlatform) && enabledSources.includes(mappedPlatform)) {
			console.log(`[AutoPlay] Using recommended platform: ${mappedPlatform}`);
			return await this.getRecommendedTracksFromSource(track, mappedPlatform);
		}

		// Check if Last.fm API is available
		if (apiKey) {
			console.log("[AutoPlay] No preferred platform found. Using Last.fm recommendations.");
			return await this.getRecommendedTracksFromLastFm(track, apiKey);
		}

		// Fallback to YouTube if all else fails
		if (enabledSources.includes("youtube")) {
			console.warn("[AutoPlay] No other sources available. Falling back to YouTube.");
			return await this.getRecommendedTracksFromYouTube(track);
		}

		console.error("[AutoPlay] No suitable platform found. Returning an empty array.");
		return [];
	}

	static async getRecommendedTracksFromLastFm(track: Track, apiKey: string): Promise<Track[]> {
		const enabledSources = this.manager.useableNode.info.sourceManagers;
		const selectedSource = this.selectPlatform(enabledSources);

		console.log(`[AutoPlay] Selected source: ${selectedSource}`);

		let { author: artist } = track;
		const { title } = track;

		console.log(`[AutoPlay] Searching for recommended tracks for: ${artist} - ${title}`);

		if (!artist || !title) {
			if (!title) {
				// No title provided, search for the artist's top tracks
				const noTitleUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
				console.log(`[AutoPlay] No title provided. Fetching artist's top tracks from: ${noTitleUrl}`);

				const response = await axios.get(noTitleUrl);

				if (response.data.error || !response.data.toptracks?.track?.length) {
					console.error("[AutoPlay] Error or no tracks found for the artist. Returning an empty array.");
					return [];
				}

				console.log("[AutoPlay] Successfully fetched artist's top tracks.");
				const randomTrack = response.data.toptracks.track[Math.floor(Math.random() * response.data.toptracks.track.length)];
				console.log(`[AutoPlay] Selected random track: ${randomTrack.artist.name} - ${randomTrack.name}`);

				const res = await this.manager.search({ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: selectedSource }, track.requester);
				if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
					console.error("[AutoPlay] Search returned empty or error result. Returning an empty array.");
					return [];
				}

				const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);
				if (!filteredTracks.length) {
					console.error("[AutoPlay] No suitable tracks found. Returning an empty array.");
					return [];
				}

				console.log("[AutoPlay] Found suitable tracks.");
				return filteredTracks;
			}
			if (!artist) {
				// No artist provided, search for the track title
				const noArtistUrl = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${title}&api_key=${apiKey}&format=json`;
				console.log(`[AutoPlay] No artist provided. Searching for track: ${title} from: ${noArtistUrl}`);

				const response = await axios.get(noArtistUrl);
				artist = response.data.results.trackmatches?.track?.[0]?.artist;

				if (!artist) {
					console.error("[AutoPlay] No artist found for track. Returning an empty array.");
					return [];
				}

				console.log(`[AutoPlay] Found artist for track: ${artist}`);
			}
		}

		// Search for similar tracks to the current track
		const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${artist}&track=${title}&limit=10&autocorrect=1&api_key=${apiKey}&format=json`;
		console.log(`[AutoPlay] Searching for similar tracks using URL: ${url}`);

		let response: axios.AxiosResponse;

		try {
			response = await axios.get(url);
			console.log("[AutoPlay] Successfully fetched similar tracks.");
		} catch (error) {
			console.error("[AutoPlay] Error fetching similar tracks. Returning an empty array.");
			console.log(error);
			return [];
		}

		if (response.data.error || !response.data.similartracks?.track?.length) {
			console.error("[AutoPlay] Error or no similar tracks found. Retrying with top tracks.");
			// Retry the request if the first attempt fails
			const retryUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
			const retryResponse = await axios.get(retryUrl);

			if (retryResponse.data.error || !retryResponse.data.toptracks?.track?.length) {
				console.error("[AutoPlay] Retry failed. Returning an empty array.");
				return [];
			}

			const randomTrack = retryResponse.data.toptracks.track[Math.floor(Math.random() * retryResponse.data.toptracks.track.length)];
			console.log(`[AutoPlay] Selected random track from retry: ${randomTrack.artist.name} - ${randomTrack.name}`);

			const res = await this.manager.search({ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: selectedSource }, track.requester);
			if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
				console.error("[AutoPlay] Retry search returned empty or error result. Returning an empty array.");
				return [];
			}

			const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);
			if (!filteredTracks.length) {
				console.error("[AutoPlay] No suitable tracks found in retry. Returning an empty array.");
				return [];
			}

			console.log("[AutoPlay] Found suitable tracks from retry.");
			return filteredTracks;
		}

		const randomTrack = response.data.similartracks.track.sort(() => Math.random() - 0.5).shift();

		if (!randomTrack) {
			console.error("[AutoPlay] No similar tracks found after filtering. Returning an empty array.");
			return [];
		}

		console.log(`[AutoPlay] Selected random track: ${randomTrack.name} - ${randomTrack.artist.name}`);

		const res = await this.manager.search({ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: selectedSource }, track.requester);
		if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
			console.error("[AutoPlay] Final search returned empty or error result. Returning an empty array.");
			return [];
		}
		if (res.loadType === LoadTypes.Playlist) res.tracks = res.playlist.tracks;
		if (!res.tracks.length) {
			console.error("[AutoPlay] No tracks found in final search. Returning an empty array.");
			return [];
		}

		return res.tracks;
	}

	static async getRecommendedTracksFromSource(track: Track, mappedPlatform: string): Promise<Track[]> {
		switch (mappedPlatform) {
			case "spotify":
				console.log("[AutoPlay] Checking if track URI includes 'spotify':", track.uri);

				if (!track.uri.includes("spotify")) {
					console.log("[AutoPlay] Track URI does not include 'spotify'. Searching for track:", `${track.author} - ${track.title}`);

					const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.Spotify }, track.requester);

					if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
						console.error("[AutoPlay] Search returned empty or error result. Returning an empty array.");
						return [];
					}

					if (res.loadType === LoadTypes.Playlist) {
						console.log("[AutoPlay] Search returned a playlist. Flattening tracks.");
						res.tracks = res.playlist.tracks;
					}

					if (!res.tracks.length) {
						console.error("[AutoPlay] No tracks found in the search. Returning an empty array.");
						return [];
					}

					console.log("[AutoPlay] Track found in search:", res.tracks[0].uri);
					track = res.tracks[0];
				}

				const TOTP_SECRET = new Uint8Array([
					53, 53, 48, 55, 49, 52, 53, 56, 53, 51, 52, 56, 55, 52, 57, 57, 53, 57, 50, 50, 52, 56, 54, 51, 48, 51, 50, 57, 51, 52, 55,
				]);
				const hmac = crypto.createHmac("sha1", TOTP_SECRET);

				function generateTotp() {
					const counter = Math.floor(Date.now() / 30000);
					const counterBuffer = Buffer.alloc(8);
					counterBuffer.writeBigInt64BE(BigInt(counter));

					hmac.update(counterBuffer);
					const hmacResult = hmac.digest();

					const offset = hmacResult[hmacResult.length - 1] & 15;
					const truncatedValue =
						((hmacResult[offset] & 127) << 24) | ((hmacResult[offset + 1] & 255) << 16) | ((hmacResult[offset + 2] & 255) << 8) | (hmacResult[offset + 3] & 255);

					const totp = (truncatedValue % 1000000).toString().padStart(6, "0");
					return [totp, counter * 30000];
				}

				const [totp, timestamp] = generateTotp();
				console.log("[AutoPlay] Generated TOTP:", totp);

				const params = {
					reason: "transport",
					productType: "embed",
					totp: totp,
					totpVer: 5,
					ts: timestamp,
				};

				console.log("[AutoPlay] Sending request to get access token with params:", params);

				const { data: body } = await axios.get("https://open.spotify.com/get_access_token", { params });

				console.log("[AutoPlay] Access token received.");

				const { data: json } = await axios.get(`https://api.spotify.com/v1/recommendations`, {
					params: { limit: 10, seed_tracks: track.identifier },
					headers: {
						Authorization: `Bearer ${body.accessToken}`,
						"Content-Type": "application/json",
					},
				});

				if (!json.tracks || !json.tracks.length) {
					console.error("[AutoPlay] No recommended tracks received from Spotify API. Returning an empty array.");
					return [];
				}

				console.log("[AutoPlay] Recommended tracks received from Spotify.");

				// Return a random recommended track ID
				const recommendedTrackId = json.tracks[Math.floor(Math.random() * json.tracks.length)].id;
				console.log(`[AutoPlay] Selected random recommended track ID: ${recommendedTrackId}`);

				console.log("[AutoPlay] Searching for the recommended track:", recommendedTrackId);

				const res = await this.manager.search({ query: `https://open.spotify.com/track/${recommendedTrackId}`, source: SearchPlatform.Spotify }, track.requester);

				if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
					console.error("[AutoPlay] Final search returned empty or error result. Returning an empty array.");
					return [];
				}

				if (res.loadType === LoadTypes.Playlist) {
					console.log("[AutoPlay] Final search returned a playlist. Flattening tracks.");
					res.tracks = res.playlist.tracks;
				}

				if (!res.tracks.length) {
					console.error("[AutoPlay] No tracks found in final search. Returning an empty array.");
					return [];
				}

				console.log("[AutoPlay] Recommended tracks found and ready to return.");
				return res.tracks;
			case "deezer":
				console.log("[AutoPlay] Checking if track URI includes 'deezer':", track.uri);

				if (!track.uri.includes("deezer")) {
					console.log("[AutoPlay] Track URI does not include 'deezer'. Searching for track:", `${track.author} - ${track.title}`);

					const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.Deezer }, track.requester);

					if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
						console.error("[AutoPlay] Search returned empty or error result. Returning an empty array.");
						return [];
					}

					if (res.loadType === LoadTypes.Playlist) {
						console.log("[AutoPlay] Search returned a playlist. Flattening tracks.");
						res.tracks = res.playlist.tracks;
					}

					if (!res.tracks.length) {
						console.error("[AutoPlay] No tracks found in the search. Returning an empty array.");
						return [];
					}

					console.log("[AutoPlay] Track found in search:", res.tracks[0].uri);
					track = res.tracks[0];
				}

				const identifier = `dzrec:${track.identifier}`;
				console.log("[AutoPlay] Generating Deezer recommendation identifier:", identifier);

				const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;

				if (!recommendedResult) {
					console.error("[AutoPlay] No recommended result received from Deezer. Returning an empty array.");
					return [];
				}

				let tracks: Track[] = [];
				let playlist: SearchResult["playlist"] = null;

				const requester = track.requester;

				switch (recommendedResult.loadType) {
					case LoadTypes.Search:
						console.log("[AutoPlay] Recommended result is of type 'Search'. Building tracks.");
						tracks = (recommendedResult.data as TrackData[]).map((track) => TrackUtils.build(track, requester));
						break;

					case LoadTypes.Track:
						console.log("[AutoPlay] Recommended result is of type 'Track'. Building a single track.");
						tracks = [TrackUtils.build(recommendedResult.data as unknown as TrackData, requester)];
						break;

					case LoadTypes.Playlist: {
						console.log("[AutoPlay] Recommended result is of type 'Playlist'. Building playlist.");
						const playlistData = recommendedResult.data as PlaylistRawData;
						tracks = playlistData.tracks.map((track) => TrackUtils.build(track, requester));

						playlist = {
							name: playlistData.info.name,
							playlistInfo: playlistData.pluginInfo as PlaylistInfoData[],
							requester: requester as User,
							tracks,
							duration: tracks.reduce((acc, cur) => acc + ((cur as unknown as Track).duration || 0), 0),
						};
						break;
					}
				}

				const result: SearchResult = { loadType: recommendedResult.loadType, tracks, playlist };

				if (result.loadType === LoadTypes.Empty || result.loadType === LoadTypes.Error) {
					console.error("[AutoPlay] Final result load type is empty or error. Returning an empty array.");
					return [];
				}

				if (result.loadType === LoadTypes.Playlist) {
					console.log("[AutoPlay] Final result load type is Playlist. Flattening tracks.");
					result.tracks = result.playlist.tracks;
				}

				if (!result.tracks.length) {
					console.error("[AutoPlay] No tracks found in final result. Returning an empty array.");
					return [];
				}

				console.log("[AutoPlay] Tracks found and ready to return.");
				return result.tracks;
			case "soundcloud":
				console.log("[AutoPlay] Checking if track URI includes 'soundcloud':", track.uri);

				if (!track.uri.includes("soundcloud")) {
					console.log("[AutoPlay] Track URI does not include 'soundcloud'. Searching for track:", `${track.author} - ${track.title}`);

					const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.SoundCloud }, track.requester);

					if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
						console.error("[AutoPlay] Search returned empty or error result. Returning an empty array.");
						return [];
					}

					if (res.loadType === LoadTypes.Playlist) {
						console.log("[AutoPlay] Search returned a playlist. Flattening tracks.");
						res.tracks = res.playlist.tracks;
					}

					if (!res.tracks.length) {
						console.error("[AutoPlay] No tracks found in the search. Returning an empty array.");
						return [];
					}

					console.log("[AutoPlay] Track found in search:", res.tracks[0].uri);
					track = res.tracks[0];
				}

				try {
					console.log("[AutoPlay] Fetching SoundCloud recommendations from:", `${track.uri}/recommended`);

					const recommendedRes = await axios.get(`${track.uri}/recommended`);
					const html = recommendedRes.data;

					const dom = new JSDOM(html);
					const document = dom.window.document;

					const secondNoscript = document.querySelectorAll("noscript")[1];
					const sectionElement = secondNoscript.querySelector("section");
					const articleElements = sectionElement.querySelectorAll("article") as NodeListOf<HTMLElement>;

					if (!articleElements || articleElements.length === 0) {
						console.error("[AutoPlay] No article elements found for recommendations. Returning an empty array.");
						return [];
					}

					const urls = Array.from(articleElements)
						.map((articleElement) => {
							const h2Element = articleElement.querySelector('h2[itemprop="name"]');
							const aElement = h2Element?.querySelector('a[itemprop="url"]');
							return aElement ? `https://soundcloud.com${aElement.getAttribute("href")}` : null;
						})
						.filter(Boolean);

					if (!urls.length) {
						console.error("[AutoPlay] No valid URLs found in the recommendations. Returning an empty array.");
						return [];
					}

					const randomUrl = urls[Math.floor(Math.random() * urls.length)];
					console.log("[AutoPlay] Selected random URL for recommended track:", randomUrl);

					const res = await this.manager.search({ query: randomUrl, source: SearchPlatform.SoundCloud }, track.requester);

					if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
						console.error("[AutoPlay] Search for recommended track returned empty or error result. Returning an empty array.");
						return [];
					}

					if (res.loadType === LoadTypes.Playlist) {
						console.log("[AutoPlay] Search for recommended track returned a playlist. Flattening tracks.");
						res.tracks = res.playlist.tracks;
					}

					if (!res.tracks.length) {
						console.error("[AutoPlay] No tracks found in the search for recommended track. Returning an empty array.");
						return [];
					}

					console.log(
						"[AutoPlay] Found recommended tracks:",
						res.tracks.map((track) => track.uri)
					);
					return res.tracks;
				} catch (error) {
					console.error("[AutoPlay] Error occurred while fetching recommendations:", error);
					return [];
				}
				break;
			case "youtube":
				return this.getRecommendedTracksFromYouTube(track);
				break;
			default:
				return [];
		}
	}

	static async getRecommendedTracksFromYouTube(track: Track): Promise<Track[]> {
		console.log("[YouTube Recommendation] Checking if track URI includes YouTube URL:", track.uri);

		// Check if the previous track has a YouTube URL
		const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => track.uri.includes(url));
		let videoID: string | null = null;

		if (hasYouTubeURL) {
			console.log("[YouTube Recommendation] Track contains a YouTube URL. Extracting video ID from URI.");
			videoID = track.uri.split("=").pop();
		} else {
			console.log("[YouTube Recommendation] Track does not contain a YouTube URL. Searching for the track on YouTube.");
			const searchResult = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.YouTube }, track.requester);
			videoID = searchResult.tracks[0]?.uri.split("=").pop();
		}

		if (!videoID) {
			console.error("[YouTube Recommendation] Video ID not found. Returning an empty array.");
			return [];
		}

		console.log("[YouTube Recommendation] Video ID extracted:", videoID);

		// Get a random video index between 2 and 24
		let randomIndex: number;
		let searchURI: string;

		do {
			randomIndex = Math.floor(Math.random() * 23) + 2; // Random index between 2 and 24
			searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}&index=${randomIndex}`;
			console.log("[YouTube Recommendation] Generated random search URI:", searchURI);
		} while (track.uri.includes(searchURI));

		// Search for the video and return false if the search fails
		console.log("[YouTube Recommendation] Searching for the video using search URI:", searchURI);
		const res = await this.manager.search({ query: searchURI, source: SearchPlatform.YouTube }, track.requester);
		if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
			console.error("[YouTube Recommendation] Search failed or returned empty results. Returning an empty array.");
			return [];
		}

		// Filter out tracks that have the same URI as the current track
		console.log("[YouTube Recommendation] Filtering tracks that do not match the current track URI.");
		const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);

		console.log(
			"[YouTube Recommendation] Returning filtered recommended tracks:",
			filteredTracks.map((t) => t.uri)
		);

		return filteredTracks;
	}

	static selectPlatform(enabledSources: string[]): SearchPlatform | null {
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

const structures = {
	Player: require("./Player").Player,
	Queue: require("./Queue").Queue,
	Node: require("./Node").Node,
	Filters: require("./Filters").Filters,
	Manager: require("./Manager").Manager,
	Plugin: require("./Plugin").Plugin,
	Rest: require("./Rest").Rest,
	Utils: require("./Utils"),
};

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
