/* eslint-disable @typescript-eslint/no-require-imports */
import { ClientUser, User } from "discord.js";
import { Manager } from "./Manager";
import axios from "axios";
import { JSDOM } from "jsdom";
import crypto from "crypto";
import { AutoPlayPlatform, LoadTypes, SearchPlatform, TrackPartial } from "./Enums";
import { Extendable, LavalinkResponse, PlaylistInfoData, PlaylistRawData, SearchResult, Track, TrackData, TrackSourceName } from "./Types";

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

	/**
	 * Gets recommended tracks for the given track.
	 * @param track The track to get recommended tracks for.
	 * @returns An array of recommended tracks.
	 */
	public static async getRecommendedTracks(track: Track): Promise<Track[]> {
		const node = this.manager.useableNode;
		if (!node) {
			throw new Error("No available nodes.");
		}

		const apiKey = this.manager.options.lastFmApiKey;
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

		// Check if Last.fm API is available
		if (apiKey) {
			return await this.getRecommendedTracksFromLastFm(track, apiKey);
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

				const res = await this.manager.search(
					{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: this.manager.options.defaultSearchPlatform },
					track.requester
				);
				if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
					return [];
				}

				const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);
				if (!filteredTracks.length) {
					return [];
				}

				return filteredTracks;
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

			const res = await this.manager.search(
				{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: this.manager.options.defaultSearchPlatform },
				track.requester
			);
			if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
				return [];
			}

			const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);
			if (!filteredTracks.length) {
				return [];
			}

			return filteredTracks;
		}

		const randomTrack = response.data.similartracks.track.sort(() => Math.random() - 0.5).shift();

		if (!randomTrack) {
			return [];
		}

		const res = await this.manager.search(
			{ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: this.manager.options.defaultSearchPlatform },
			track.requester
		);
		if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
			return [];
		}
		if (res.loadType === LoadTypes.Playlist) res.tracks = res.playlist.tracks;
		if (!res.tracks.length) {
			return [];
		}

		return res.tracks;
	}

	/**
	 * Gets recommended tracks from the given source.
	 * @param track The track to get recommended tracks for.
	 * @param platform The source to get recommended tracks from.
	 * @returns An array of recommended tracks.
	 */
	static async getRecommendedTracksFromSource(track: Track, platform: string): Promise<Track[]> {
		switch (platform) {
			case "spotify":
				{
					try {
						if (!track.uri.includes("spotify")) {
							const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.Spotify }, track.requester);

							if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
								return [];
							}

							if (res.loadType === LoadTypes.Playlist) {
								res.tracks = res.playlist.tracks;
							}

							if (!res.tracks.length) {
								return [];
							}

							track = res.tracks[0];
						}

						const [totp, timestamp] = this.generateTotp();

						const params = {
							reason: "init",
							productType: "web-player",
							totp: totp,
							totpVer: 5,
							ts: timestamp,
						};

						let body;
						try {
							const response = await axios.get("https://open.spotify.com/api/token", {
								params,
								headers: {
									"User-Agent":
										"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.178 Spotify/1.2.65.255 Safari/537.36",
									"App-Platform": "WebPlayer",
									Referer: "https://open.spotify.com/",
									Origin: "https://open.spotify.com",
									"Accept-Language": "en",
								},
							});
							body = response.data;
						} catch (error) {
							const status = error.response?.status ?? "No response";
							console.error("[AutoPlay] Failed to get spotify access token:", status);
							return [];
						}

						let json;
						try {
							const response = await axios.get(`https://api.spotify.com/v1/recommendations`, {
								params: { limit: 10, seed_tracks: track.identifier },
								headers: {
									Authorization: `Bearer ${body.accessToken}`,
									"Content-Type": "application/json",
								},
							});
							json = response.data;
						} catch (error) {
							console.error("[AutoPlay] Failed to fetch spotify recommendations:", error.response?.status);
							return [];
						}

						if (!json.tracks || !json.tracks.length) {
							return [];
						}

						const recommendedTrackId = json.tracks[Math.floor(Math.random() * json.tracks.length)].id;

						const res = await this.manager.search({ query: `https://open.spotify.com/track/${recommendedTrackId}`, source: SearchPlatform.Spotify }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}

						return res.tracks;
					} catch (error) {
						console.error("[AutoPlay] Unexpected spotify error:", error.message || error);
						return [];
					}
				}
				break;
			case "deezer":
				{
					if (!track.uri.includes("deezer")) {
						const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.Deezer }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}

						track = res.tracks[0];
					}

					const identifier = `dzrec:${track.identifier}`;

					const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;

					if (!recommendedResult) {
						return [];
					}

					let tracks: Track[] = [];
					let playlist: SearchResult["playlist"] = null;

					const requester = track.requester;

					switch (recommendedResult.loadType) {
						case LoadTypes.Search:
							tracks = (recommendedResult.data as TrackData[]).map((track) => TrackUtils.build(track, requester));
							break;

						case LoadTypes.Track:
							tracks = [TrackUtils.build(recommendedResult.data as unknown as TrackData, requester)];
							break;

						case LoadTypes.Playlist: {
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
						return [];
					}

					if (result.loadType === LoadTypes.Playlist) {
						result.tracks = result.playlist.tracks;
					}

					if (!result.tracks.length) {
						return [];
					}

					return result.tracks;
				}
				break;
			case "soundcloud":
				{
					if (!track.uri.includes("soundcloud")) {
						const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.SoundCloud }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}

						track = res.tracks[0];
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
						const document = dom.window.document;

						const secondNoscript = document.querySelectorAll("noscript")[1];
						const sectionElement = secondNoscript.querySelector("section");
						const articleElements = sectionElement.querySelectorAll("article") as NodeListOf<HTMLElement>;

						if (!articleElements || articleElements.length === 0) {
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
							return [];
						}

						const randomUrl = urls[Math.floor(Math.random() * urls.length)];

						const res = await this.manager.search({ query: randomUrl, source: SearchPlatform.SoundCloud }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}
						return res.tracks;
					} catch (error) {
						console.error("[AutoPlay] Error occurred while fetching soundcloud recommendations:", error);
						return [];
					}
				}
				break;
			case "youtube":
				{
					const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => track.uri.includes(url));
					let videoID: string | null = null;

					if (hasYouTubeURL) {
						videoID = track.uri.split("=").pop();
					} else {
						const searchResult = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.YouTube }, track.requester);
						videoID = searchResult.tracks[0]?.uri.split("=").pop();
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

					const res = await this.manager.search({ query: searchURI, source: SearchPlatform.YouTube }, track.requester);
					if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
						return [];
					}

					const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);

					return filteredTracks;
				}
				break;
			case "tidal":
				{
					if (!track.uri.includes("tidal")) {
						const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.Tidal }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}

						track = res.tracks[0];
					}

					const identifier = `tdrec:${track.identifier}`;

					const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;

					if (!recommendedResult) {
						return [];
					}

					let tracks: Track[] = [];
					let playlist: SearchResult["playlist"] = null;

					const requester = track.requester;

					switch (recommendedResult.loadType) {
						case LoadTypes.Search:
							tracks = (recommendedResult.data as TrackData[]).map((track) => TrackUtils.build(track, requester));
							break;

						case LoadTypes.Track:
							tracks = [TrackUtils.build(recommendedResult.data as unknown as TrackData, requester)];
							break;

						case LoadTypes.Playlist: {
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
						return [];
					}

					if (result.loadType === LoadTypes.Playlist) {
						result.tracks = result.playlist.tracks;
					}

					if (!result.tracks.length) {
						return [];
					}

					return result.tracks;
				}
				break;
			case "vkmusic":
				{
					if (!track.uri.includes("vk.com") && !track.uri.includes("vk.ru")) {
						const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.VKMusic }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}

						track = res.tracks[0];
					}

					const identifier = `vkrec:${track.identifier}`;

					const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;

					if (!recommendedResult) {
						return [];
					}

					let tracks: Track[] = [];
					let playlist: SearchResult["playlist"] = null;

					const requester = track.requester;

					switch (recommendedResult.loadType) {
						case LoadTypes.Search:
							tracks = (recommendedResult.data as TrackData[]).map((track) => TrackUtils.build(track, requester));
							break;

						case LoadTypes.Track:
							tracks = [TrackUtils.build(recommendedResult.data as unknown as TrackData, requester)];
							break;

						case LoadTypes.Playlist: {
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
						return [];
					}

					if (result.loadType === LoadTypes.Playlist) {
						result.tracks = result.playlist.tracks;
					}

					if (!result.tracks.length) {
						return [];
					}

					return result.tracks;
				}
				break;
			case "qobuz":
				{
					if (!track.uri.includes("qobuz.com")) {
						const res = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.Qobuz }, track.requester);

						if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) {
							return [];
						}

						if (res.loadType === LoadTypes.Playlist) {
							res.tracks = res.playlist.tracks;
						}

						if (!res.tracks.length) {
							return [];
						}

						track = res.tracks[0];
					}

					const identifier = `qbrec:${track.identifier}`;

					const recommendedResult = (await this.manager.useableNode.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;

					if (!recommendedResult) {
						return [];
					}

					let tracks: Track[] = [];
					let playlist: SearchResult["playlist"] = null;

					const requester = track.requester;

					switch (recommendedResult.loadType) {
						case LoadTypes.Search:
							tracks = (recommendedResult.data as TrackData[]).map((track) => TrackUtils.build(track, requester));
							break;

						case LoadTypes.Track:
							tracks = [TrackUtils.build(recommendedResult.data as unknown as TrackData, requester)];
							break;

						case LoadTypes.Playlist: {
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
						return [];
					}

					if (result.loadType === LoadTypes.Playlist) {
						result.tracks = result.playlist.tracks;
					}

					if (!result.tracks.length) {
						return [];
					}

					return result.tracks;
				}
				break;
			default:
				return [];
		}
	}

	static generateTotp() {
		const TOTP_SECRET = new Uint8Array([
			53, 53, 48, 55, 49, 52, 53, 56, 53, 51, 52, 56, 55, 52, 57, 57, 53, 57, 50, 50, 52, 56, 54, 51, 48, 51, 50, 57, 51, 52, 55,
		]);

		const hmac = crypto.createHmac("sha1", TOTP_SECRET);
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
