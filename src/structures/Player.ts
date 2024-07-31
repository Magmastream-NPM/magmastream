import { Filters } from "./Filters";
import { LavalinkResponse, Manager, PlaylistRawData, SearchQuery, SearchResult } from "./Manager";
import { LavalinkInfo, Node } from "./Node";
import { Queue } from "./Queue";
import { Sizes, State, Structure, TrackSourceName, TrackUtils, VoiceState } from "./Utils";
import * as _ from "lodash";
import playerCheck from "../utils/playerCheck";
import { ClientUser, Message, User } from "discord.js";

export class Player {
	/** The Queue for the Player. */
	public readonly queue = new (Structure.get("Queue"))() as Queue;
	/** The filters applied to the audio. */
	public filters: Filters;
	/** Whether the queue repeats the track. */
	public trackRepeat = false;
	/** Whether the queue repeats the queue. */
	public queueRepeat = false;
	/**Whether the queue repeats and shuffles after each song. */
	public dynamicRepeat = false;
	/** The time the player is in the track. */
	public position = 0;
	/** Whether the player is playing. */
	public playing = false;
	/** Whether the player is paused. */
	public paused = false;
	/** The volume for the player */
	public volume: number;
	/** The Node for the Player. */
	public node: Node;
	/** The guild for the player. */
	public guild: string;
	/** The voice channel for the player. */
	public voiceChannel: string | null = null;
	/** The text channel for the player. */
	public textChannel: string | null = null;
	/**The now playing message. */
	public nowPlayingMessage?: Message;
	/** The current state of the player. */
	public state: State = "DISCONNECTED";
	/** The equalizer bands array. */
	public bands = new Array<number>(15).fill(0.0);
	/** The voice state object from Discord. */
	public voiceState: VoiceState;
	/** The Manager. */
	public manager: Manager;
	/** The autoplay state of the player. */
	public isAutoplay: boolean = false;

	private static _manager: Manager;
	private readonly data: Record<string, unknown> = {};
	private dynamicLoopInterval: NodeJS.Timeout;

	/**
	 * Set custom data.
	 * @param key
	 * @param value
	 */
	public set(key: string, value: unknown): void {
		this.data[key] = value;
	}

	/**
	 * Get custom data.
	 * @param key
	 */
	public get<T>(key: string): T {
		return this.data[key] as T;
	}

	/** @hidden */
	public static init(manager: Manager): void {
		this._manager = manager;
	}

	/**
	 * Creates a new player, returns one if it already exists.
	 * @param options
	 */
	constructor(public options: PlayerOptions) {
		if (!this.manager) this.manager = Structure.get("Player")._manager;
		if (!this.manager) throw new RangeError("Manager has not been initiated.");

		if (this.manager.players.has(options.guild)) {
			return this.manager.players.get(options.guild);
		}

		playerCheck(options);

		this.guild = options.guild;
		this.voiceState = Object.assign({
			op: "voiceUpdate",
			guild_id: options.guild,
		});

		if (options.voiceChannel) this.voiceChannel = options.voiceChannel;
		if (options.textChannel) this.textChannel = options.textChannel;

		const node = this.manager.nodes.get(options.node);
		this.node = node || this.manager.useableNodes;

		if (!this.node) throw new RangeError("No available nodes.");

		this.manager.players.set(options.guild, this);
		this.manager.emit("playerCreate", this);
		this.setVolume(options.volume ?? 100);
		this.filters = new Filters(this);
	}

	/**
	 * Same as Manager#search() but a shortcut on the player itself.
	 * @param query
	 * @param requester
	 */
	public search(query: string | SearchQuery, requester?: User | ClientUser): Promise<SearchResult> {
		return this.manager.search(query, requester);
	}

	/** Connect to the voice channel. */
	public connect(): this {
		if (!this.voiceChannel) throw new RangeError("No voice channel has been set.");
		this.state = "CONNECTING";

		this.manager.options.send(this.guild, {
			op: 4,
			d: {
				guild_id: this.guild,
				channel_id: this.voiceChannel,
				self_mute: this.options.selfMute || false,
				self_deaf: this.options.selfDeafen || false,
			},
		});

		this.state = "CONNECTED";
		return this;
	}

	/** Disconnect from the voice channel. */
	public disconnect(): this {
		if (this.voiceChannel === null) return this;
		this.state = "DISCONNECTING";

		this.pause(true);
		this.manager.options.send(this.guild, {
			op: 4,
			d: {
				guild_id: this.guild,
				channel_id: null,
				self_mute: false,
				self_deaf: false,
			},
		});

		this.voiceChannel = null;
		this.state = "DISCONNECTED";
		return this;
	}

	/** Destroys the player. */
	public destroy(disconnect = true): void {
		this.state = "DESTROYING";

		if (disconnect) {
			this.disconnect();
		}

		this.node.rest.destroyPlayer(this.guild);
		this.manager.emit("playerDestroy", this);
		this.manager.players.delete(this.guild);
	}

	/**
	 * Sets the player voice channel.
	 * @param channel
	 */
	public setVoiceChannel(channel: string): this {
		if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

		this.voiceChannel = channel;
		this.connect();
		return this;
	}

	/**
	 * Sets the player text channel.
	 * @param channel
	 */
	public setTextChannel(channel: string): this {
		if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

		this.textChannel = channel;
		return this;
	}

	/** Sets the now playing message. */
	public setNowPlayingMessage(message: Message): Message {
		if (!message) {
			throw new TypeError("You must provide the message of the now playing message.");
		}
		return (this.nowPlayingMessage = message);
	}

	/** Plays the next track. */
	public async play(): Promise<void>;

	/**
	 * Plays the specified track.
	 * @param track
	 */
	public async play(track: Track | UnresolvedTrack): Promise<void>;

	/**
	 * Plays the next track with some options.
	 * @param options
	 */
	public async play(options: PlayOptions): Promise<void>;

	/**
	 * Plays the specified track with some options.
	 * @param track
	 * @param options
	 */
	public async play(track: Track | UnresolvedTrack, options: PlayOptions): Promise<void>;
	public async play(optionsOrTrack?: PlayOptions | Track | UnresolvedTrack, playOptions?: PlayOptions): Promise<void> {
		if (typeof optionsOrTrack !== "undefined" && TrackUtils.validate(optionsOrTrack)) {
			if (this.queue.current) this.queue.previous = this.queue.current;
			this.queue.current = optionsOrTrack as Track;
		}

		if (!this.queue.current) throw new RangeError("No current track.");

		const finalOptions = playOptions
			? playOptions
			: ["startTime", "endTime", "noReplace"].every((v) => Object.keys(optionsOrTrack || {}).includes(v))
			? (optionsOrTrack as PlayOptions)
			: {};

		if (TrackUtils.isUnresolvedTrack(this.queue.current)) {
			try {
				this.queue.current = await TrackUtils.getClosestTrack(this.queue.current as UnresolvedTrack);
			} catch (error) {
				this.manager.emit("trackError", this, this.queue.current, error);
				if (this.queue[0]) return this.play(this.queue[0]);
				return;
			}
		}

		await this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				encodedTrack: this.queue.current?.track,
				...finalOptions,
			},
		});

		Object.assign(this, { position: 0, playing: true });
	}

	/**
	 * Sets the autoplay-state of the player.
	 * @param autoplayState
	 * @param botUser
	 */
	public setAutoplay(autoplayState: boolean, botUser: object) {
		if (typeof autoplayState !== "boolean") {
			throw new TypeError("autoplayState must be a boolean.");
		}

		if (typeof botUser !== "object") {
			throw new TypeError("botUser must be a user-object.");
		}

		this.isAutoplay = autoplayState;
		this.set("Internal_BotUser", botUser);

		return this;
	}

	/**
	 * Gets recommended tracks and returns an array of tracks.
	 * @param track
	 */
	public async getRecommended(track: Track) {
		const node = this.manager.useableNodes;

		if (!node) {
			throw new Error("No available nodes.");
		}

		const hasSpotifyURL = ["spotify.com", "open.spotify.com"].some((url) => track.uri.includes(url));
		const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => track.uri.includes(url));

		if (hasSpotifyURL) {
			const res = await node.rest.get(`/v4/info`);
			const info = res as LavalinkInfo;

			const isSpotifyPluginEnabled = info.plugins.some((plugin: { name: string }) => plugin.name === "lavasrc-plugin");
			const isSpotifySourceManagerEnabled = info.sourceManagers.includes("spotify");

			if (isSpotifyPluginEnabled && isSpotifySourceManagerEnabled) {
				const trackID = node.extractSpotifyTrackID(track.uri);
				const artistID = node.extractSpotifyArtistID(track.pluginInfo.artistUrl);

				let identifier = "";
				if (trackID && artistID) {
					identifier = `sprec:seed_artists=${artistID}&seed_tracks=${trackID}`;
				} else if (trackID) {
					identifier = `sprec:seed_tracks=${trackID}`;
				} else if (artistID) {
					identifier = `sprec:seed_artists=${artistID}`;
				}

				if (identifier) {
					const recommendedResult = (await node.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`)) as LavalinkResponse;

					if (recommendedResult.loadType === "playlist") {
						const playlistData = recommendedResult.data as PlaylistRawData;
						const recommendedTracks = playlistData.tracks;

						if (recommendedTracks) {
							const spotifyArray = [];
							recommendedTracks.forEach((song) => {
								const track = {
									track: song.encoded,
									title: song.info.title,
									identifier: song.info.title,
									author: song.info.author,
									duration: song.info.length,
									uri: song.info.uri,
									artworkUrl: song.info.artworkUrl,
									sourceName: song.info.sourceName,
									requester: undefined,
									plugininfo: song.pluginInfo,
								};

								spotifyArray.push(track);
							});

							return spotifyArray;
						}
					}
				}
			}
		}

		let videoID = track.uri.substring(track.uri.indexOf("=") + 1);

		if (!hasYouTubeURL) {
			const res = await this.manager.search(`${track.author} - ${track.title}`);

			videoID = res.tracks[0].uri.substring(res.tracks[0].uri.indexOf("=") + 1);
		}

		const searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}`;

		const res = await this.manager.search(searchURI);

		if (res.loadType === "empty" || res.loadType === "error") return;

		let tracks = res.tracks;

		if (res.loadType === "playlist") {
			tracks = res.playlist.tracks;
		}

		const filteredTracks = tracks.filter((track) => track.uri !== `https://www.youtube.com/watch?v=${videoID}`);

		if (this.manager.options.replaceYouTubeCredentials) {
			for (const track of filteredTracks) {
				track.author = track.author.replace("- Topic", "");
				track.title = track.title.replace("Topic -", "");

				if (track.title.includes("-")) {
					const [author, title] = track.title.split("-").map((str: string) => str.trim());
					track.author = author;
					track.title = title;
				}
			}
		}

		return filteredTracks;
	}

	/**
	 * Sets the player volume.
	 * @param volume
	 */
	public setVolume(volume: number): this {
		if (isNaN(volume)) throw new TypeError("Volume must be a number.");

		this.node.rest.updatePlayer({
			guildId: this.options.guild,
			data: {
				volume,
			},
		});

		this.volume = volume;

		return this;
	}

	/**
	 * Sets the track repeat.
	 * @param repeat
	 */
	public setTrackRepeat(repeat: boolean): this {
		if (typeof repeat !== "boolean") throw new TypeError('Repeat can only be "true" or "false".');

		const oldPlayer = { ...this };

		if (repeat) {
			this.trackRepeat = true;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		} else {
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		this.manager.emit("playerStateUpdate", oldPlayer, this);
		return this;
	}

	/**
	 * Sets the queue repeat.
	 * @param repeat
	 */
	public setQueueRepeat(repeat: boolean): this {
		if (typeof repeat !== "boolean") throw new TypeError('Repeat can only be "true" or "false".');

		const oldPlayer = { ...this };

		if (repeat) {
			this.trackRepeat = false;
			this.queueRepeat = true;
			this.dynamicRepeat = false;
		} else {
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		this.manager.emit("playerStateUpdate", oldPlayer, this);
		return this;
	}

	/**
	 * Sets the queue to repeat and shuffles the queue after each song.
	 * @param repeat "true" or "false".
	 * @param ms After how many milliseconds to trigger dynamic repeat.
	 */
	public setDynamicRepeat(repeat: boolean, ms: number): this {
		if (typeof repeat !== "boolean") {
			throw new TypeError('Repeat can only be "true" or "false".');
		}

		if (this.queue.size <= 1) {
			throw new RangeError("The queue size must be greater than 1.");
		}

		const oldPlayer = { ...this };

		if (repeat) {
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = true;

			this.dynamicLoopInterval = setInterval(() => {
				if (!this.dynamicRepeat) return;
				const shuffled = _.shuffle(this.queue);
				this.queue.clear();
				shuffled.forEach((track) => {
					this.queue.add(track);
				});
			}, ms);
		} else {
			clearInterval(this.dynamicLoopInterval);
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		this.manager.emit("playerStateUpdate", oldPlayer, this);
		return this;
	}

	/** Restarts the current track to the start. */
	public restart(): void {
		if (!this.queue.current?.track) {
			if (this.queue.length) this.play();
			return;
		}

		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				position: 0,
				encodedTrack: this.queue.current?.track,
			},
		});
	}

	/** Stops the current track, optionally give an amount to skip to, e.g 5 would play the 5th song. */
	public stop(amount?: number): this {
		if (typeof amount === "number" && amount > 1) {
			if (amount > this.queue.length) throw new RangeError("Cannot skip more than the queue length.");
			this.queue.splice(0, amount - 1);
		}

		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				encodedTrack: null,
			},
		});

		return this;
	}

	/**
	 * Pauses the current track.
	 * @param pause
	 */
	public pause(pause: boolean): this {
		if (typeof pause !== "boolean") throw new RangeError('Pause can only be "true" or "false".');

		if (this.paused === pause || !this.queue.totalSize) return this;

		const oldPlayer = { ...this };

		this.playing = !pause;
		this.paused = pause;

		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				paused: pause,
			},
		});

		this.manager.emit("playerStateUpdate", oldPlayer, this);
		return this;
	}

	/** Go back to the previous song. */
	public previous(): this {
		this.queue.unshift(this.queue.previous);
		this.stop();

		return this;
	}

	/**
	 * Seeks to the position in the current track.
	 * @param position
	 */
	public seek(position: number): this {
		if (!this.queue.current) return undefined;
		position = Number(position);

		if (isNaN(position)) {
			throw new RangeError("Position must be a number.");
		}
		if (position < 0 || position > this.queue.current.duration) position = Math.max(Math.min(position, this.queue.current.duration), 0);

		this.position = position;

		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				position: position,
			},
		});

		return this;
	}
}

export interface PlayerOptions {
	/** The guild the Player belongs to. */
	guild: string;
	/** The text channel the Player belongs to. */
	textChannel: string;
	/** The voice channel the Player belongs to. */
	voiceChannel?: string;
	/** The node the Player uses. */
	node?: string;
	/** The initial volume the Player will use. */
	volume?: number;
	/** If the player should mute itself. */
	selfMute?: boolean;
	/** If the player should deaf itself. */
	selfDeafen?: boolean;
}

/** If track partials are set some of these will be `undefined` as they were removed. */
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
	readonly requester: User | ClientUser | null;
	/** Displays the track thumbnail with optional size or null if it's a unsupported source. */
	displayThumbnail(size?: Sizes): string;
	/** Additional track info provided by plugins. */
	pluginInfo: TrackPluginInfo;
	/** Add your own data to the track. */
	customData: Record<string, unknown>;
}

export interface TrackPluginInfo {
	albumName?: string;
	albumUrl?: string;
	artistArtworkUrl?: string;
	artistUrl?: string;
	isPreview?: string;
	previewUrl?: string;
}

/** Unresolved tracks can't be played normally, they will resolve before playing into a Track. */
export interface UnresolvedTrack extends Partial<Track> {
	/** The title to search against. */
	title: string;
	/** The author to search against. */
	author?: string;
	/** The duration to search within 1500 milliseconds of the results from YouTube. */
	duration?: number;
	/** Resolves into a Track. */
	resolve(): Promise<void>;
}

export interface PlayOptions {
	/** The position to start the track. */
	readonly startTime?: number;
	/** The position to end the track. */
	readonly endTime?: number;
	/** Whether to not replace the track if a play payload is sent. */
	readonly noReplace?: boolean;
}

export interface EqualizerBand {
	/** The band number being 0 to 14. */
	band: number;
	/** The gain amount being -0.25 to 1.00, 0.25 being double. */
	gain: number;
}
