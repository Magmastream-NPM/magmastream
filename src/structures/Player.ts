import { Filters } from "./Filters";
import { Manager, ManagerEventTypes, PlayerStateEventTypes, SearchPlatform, SearchQuery, SearchResult } from "./Manager";
import { Lyrics, Node, SponsorBlockSegment } from "./Node";
import { Queue } from "./Queue";
import { LoadTypes, Sizes, StateTypes, Structure, TrackSourceName, TrackUtils, VoiceState } from "./Utils";
import * as _ from "lodash";
import playerCheck from "../utils/playerCheck";
import { ClientUser, Message, User } from "discord.js";
import axios from "axios";

export class Player {
	/** The Queue for the Player. */
	public readonly queue: Queue;
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
	/** The guild ID for the player. */
	public guildId: string;
	/** The voice channel for the player. */
	public voiceChannelId: string | null = null;
	/** The text channel for the player. */
	public textChannelId: string | null = null;
	/**The now playing message. */
	public nowPlayingMessage?: Message;
	/** The current state of the player. */
	public state: StateTypes = StateTypes.Disconnected;
	/** The equalizer bands array. */
	public bands = new Array<number>(15).fill(0.0);
	/** The voice state object from Discord. */
	public voiceState: VoiceState;
	/** The Manager. */
	public manager: Manager;
	/** The autoplay state of the player. */
	public isAutoplay: boolean = false;
	/** The number of times to try autoplay before emitting queueEnd. */
	public autoplayTries: number | null = null;

	private static _manager: Manager;
	private readonly data: Record<string, unknown> = {};
	private dynamicLoopInterval: NodeJS.Timeout | null = null;
	private dynamicRepeatIntervalMs: number | null = null;

	/**
	 * Creates a new player, returns one if it already exists.
	 * @param options The player options.
	 * @see https://docs.magmastream.com/main/introduction/getting-started
	 */
	constructor(public options: PlayerOptions) {
		// If the Manager is not initiated, throw an error.
		if (!this.manager) this.manager = Structure.get("Player")._manager;
		if (!this.manager) throw new RangeError("Manager has not been initiated.");

		// If a player with the same guild ID already exists, return it.
		if (this.manager.players.has(options.guildId)) {
			return this.manager.players.get(options.guildId);
		}

		// Check the player options for errors.
		playerCheck(options);

		// Set the guild ID and voice state.
		this.guildId = options.guildId;
		this.voiceState = Object.assign({
			op: "voiceUpdate",
			guild_id: options.guildId,
		});

		// Set the voice and text channels if they exist.
		if (options.voiceChannelId) this.voiceChannelId = options.voiceChannelId;
		if (options.textChannelId) this.textChannelId = options.textChannelId;

		// Set the node to use, either the specified node or the first available node.
		const node = this.manager.nodes.get(options.node);
		this.node = node || this.manager.useableNode;

		// If no node is available, throw an error.
		if (!this.node) throw new RangeError("No available nodes.");

		// Initialize the queue with the guild ID and manager.
		this.queue = new Queue(this.guildId, this.manager);
		this.queue.previous = new Array<Track>();

		// Add the player to the manager's player collection.
		this.manager.players.set(options.guildId, this);

		// Emit the playerCreate event.
		this.manager.emit(ManagerEventTypes.PlayerCreate, this);

		// Set the initial volume.
		this.setVolume(options.volume ?? 100);

		// Initialize the filters.
		this.filters = new Filters(this);
	}

	/**
	 * Set custom data.
	 * @param key - The key to set the data for.
	 * @param value - The value to set the data to.
	 */
	public set(key: string, value: unknown): void {
		// Store the data in the data object using the key.
		this.data[key] = value;
	}

	/**
	 * Retrieves custom data associated with a given key.
	 * @template T - The expected type of the data.
	 * @param {string} key - The key to retrieve the data for.
	 * @returns {T} - The data associated with the key, cast to the specified type.
	 */
	public get<T>(key: string): T {
		// Access the data object using the key and cast it to the specified type T.
		return this.data[key] as T;
	}

	/**
	 * Initializes the static properties of the Player class.
	 * @hidden
	 * @param manager The Manager to use.
	 */
	public static init(manager: Manager): void {
		// Set the Manager to use.
		this._manager = manager;
	}

	/**
	 * Same as Manager#search() but a shortcut on the player itself.
	 * @param query
	 * @param requester
	 */
	public search<T = User | ClientUser>(query: string | SearchQuery, requester?: T): Promise<SearchResult> {
		return this.manager.search(query, requester);
	}

	/**
	 * Connects the player to the voice channel.
	 * @throws {RangeError} If no voice channel has been set.
	 * @returns {void}
	 */
	public connect(): void {
		// Check if the voice channel has been set.
		if (!this.voiceChannelId) {
			throw new RangeError("No voice channel has been set. You must use the `setVoiceChannelId()` method to set the voice channel before connecting.");
		}

		// Set the player state to connecting.
		this.state = StateTypes.Connecting;

		// Clone the current player state for comparison.
		const oldPlayer = this ? { ...this } : null;

		// Send the voice state update to the gateway.
		this.manager.options.send(this.guildId, {
			op: 4,
			d: {
				guild_id: this.guildId,
				channel_id: this.voiceChannelId,
				self_mute: this.options.selfMute || false,
				self_deaf: this.options.selfDeafen || false,
			},
		});

		// Set the player state to connected.
		this.state = StateTypes.Connected;

		// Emit the player state update event.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.ConnectionChange,
			details: {
				changeType: "connect",
				previousConnection: oldPlayer?.state === StateTypes.Connected,
				currentConnection: true,
			},
		});
	}

	/**
	 * Disconnects the player from the voice channel.
	 * @throws {TypeError} If the player is not connected.
	 * @returns {this} - The current instance of the Player class for method chaining.
	 */
	public async disconnect(): Promise<this> {
		// Check if the player is connected.
		// if (this.state !== StateTypes.Connected) {
		// 	throw new TypeError("The player is not connected.");
		// }

		// Set the player state to disconnecting.
		this.state = StateTypes.Disconnecting;

		// Clone the current player state for comparison.
		const oldPlayer = this ? { ...this } : null;

		// Pause the player.
		await this.pause(true);

		// Send the voice state update to the gateway.
		this.manager.options.send(this.guildId, {
			op: 4,
			d: {
				guild_id: this.guildId,
				channel_id: null,
				self_mute: false,
				self_deaf: false,
			},
		});

		// Set the player voice channel to null.
		this.voiceChannelId = null;

		// Set the player state to disconnected.
		this.state = StateTypes.Disconnected;

		// Emit the player state update event.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.ConnectionChange,
			details: {
				changeType: "disconnect",
				previousConnection: oldPlayer.state === StateTypes.Connected,
				currentConnection: false,
			},
		});

		return this;
	}

	/**
	 * Destroys the player.
	 * @param {boolean} [disconnect=true] - If `true`, disconnects the player from the voice channel before destroying it.
	 * @returns {void}
	 * @throws {TypeError} If the `disconnect` parameter is not a boolean.
	 * @emits {playerDestroy} - The player that was destroyed.
	 * @emits {playerStateUpdate} - The old and new player states after the destruction.
	 */
	public async destroy(disconnect: boolean = true): Promise<boolean> {
		const oldPlayer = this ? { ...this } : null;
		this.state = StateTypes.Destroying;

		if (disconnect) {
			await this.disconnect();
		}

		await this.node.rest.destroyPlayer(this.guildId);
		this.manager.emit(ManagerEventTypes.PlayerDestroy, this);
		this.queue.clear();
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, null, {
			changeType: PlayerStateEventTypes.PlayerDestroy,
		});
		return this.manager.players.delete(this.guildId);
	}

	/**
	 * Sets the player voice channel.
	 * @param {string} channel - The new voice channel ID.
	 * @returns {this} - The player instance.
	 * @throws {TypeError} If the channel parameter is not a string.
	 */
	public setVoiceChannelId(channel: string): this {
		// Validate the channel parameter
		if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

		// Clone the current player state for comparison
		const oldPlayer = this ? { ...this } : null;

		// Update the player voice channel
		this.voiceChannelId = channel;
		this.connect();

		// Emit a player state update event
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.ChannelChange,
			details: {
				changeType: "voice",
				previousChannel: oldPlayer.voiceChannelId || null,
				currentChannel: this.voiceChannelId,
			},
		});

		return this;
	}

	/**
	 * Sets the player text channel.
	 *
	 * This method updates the text channel associated with the player. It also
	 * emits a player state update event indicating the change in the channel.
	 *
	 * @param {string} channel - The new text channel ID.
	 * @returns {this} - The player instance for method chaining.
	 * @throws {TypeError} If the channel parameter is not a string.
	 */
	public setTextChannelId(channel: string): this {
		// Validate the channel parameter
		if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

		// Clone the current player state for comparison
		const oldPlayer = this ? { ...this } : null;

		// Update the text channel property
		this.textChannelId = channel;

		// Emit a player state update event with channel change details
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.ChannelChange,
			details: {
				changeType: "text",
				previousChannel: oldPlayer.textChannelId || null,
				currentChannel: this.textChannelId,
			},
		});

		// Return the player instance for chaining
		return this;
	}

	/**
	 * Sets the now playing message.
	 *
	 * @param message - The message of the now playing message.
	 * @returns The now playing message.
	 */
	public setNowPlayingMessage<T = Message>(message: T): Message {
		if (!message) {
			throw new TypeError("You must provide the message of the now playing message.");
		}

		this.nowPlayingMessage = message as Message;

		return this.nowPlayingMessage;
	}

	/**
	 * Plays the next track.
	 *
	 * If a track is provided, it will be played. Otherwise, the next track in the queue will be played.
	 * If the queue is not empty, but the current track has not finished yet, it will be replaced with the provided track.
	 *
	 * @param {object} [optionsOrTrack] - The track to play or the options to play with.
	 * @param {object} [playOptions] - The options to play with.
	 *
	 * @returns {Promise<void>}
	 */
	public async play(): Promise<Player>;
	public async play(track: Track): Promise<Player>;
	public async play(options: PlayOptions): Promise<Player>;
	public async play(track: Track, options: PlayOptions): Promise<Player>;
	public async play(optionsOrTrack?: PlayOptions | Track, playOptions?: PlayOptions): Promise<Player> {
		if (typeof optionsOrTrack !== "undefined" && TrackUtils.validate(optionsOrTrack)) {
			this.queue.current = optionsOrTrack as Track;
		}

		if (!this.queue.current) throw new RangeError("No current track.");

		const finalOptions = playOptions
			? playOptions
			: ["startTime", "endTime", "noReplace"].every((v) => Object.keys(optionsOrTrack || {}).includes(v))
			? (optionsOrTrack as PlayOptions)
			: {};

		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				encodedTrack: this.queue.current?.track,
				...finalOptions,
			},
		});

		this.playing = true;
		this.position = 0;

		return this;
	}

	/**
	 * Sets the autoplay-state of the player.
	 *
	 * Autoplay is a feature that makes the player play a recommended
	 * track when the current track ends.
	 *
	 * @param {boolean} autoplayState - Whether or not autoplay should be enabled.
	 * @param {object} botUser - The user-object that should be used as the bot-user.
	 * @param {number} [tries=3] - The number of times the player should try to find a
	 * recommended track if the first one doesn't work.
	 * @returns {this} - The player instance.
	 */
	public setAutoplay(autoplayState: boolean, botUser?: object, tries?: number): this {
		if (typeof autoplayState !== "boolean") {
			throw new TypeError("autoplayState must be a boolean.");
		}

		if (autoplayState) {
			if (!botUser) {
				throw new TypeError("botUser must be provided when enabling autoplay.");
			}

			if (!(botUser instanceof ClientUser) || !(botUser instanceof User)) {
				throw new TypeError("botUser must be a user-object.");
			}

			this.autoplayTries = tries && typeof tries === "number" && tries > 0 ? tries : 3; // Default to 3 if invalid
			this.isAutoplay = true;
			this.set("Internal_BotUser", botUser);
		} else {
			this.isAutoplay = false;
			this.autoplayTries = null;
			this.set("Internal_BotUser", null);
		}

		const oldPlayer = { ...this };

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.AutoPlayChange,
			details: {
				previousAutoplay: oldPlayer.isAutoplay,
				currentAutoplay: this.isAutoplay,
			},
		});

		return this;
	}

	/**
	 * Gets recommended tracks and returns an array of tracks.
	 * @param {Track} track - The track to find recommendations for.
	 * @returns {Promise<Track[]>} - Array of recommended tracks.
	 */
	public async getRecommendedTracks(track: Track): Promise<Track[]> {
		const node = this.manager.useableNode;

		if (!node) {
			throw new Error("No available nodes.");
		}

		if (!TrackUtils.validate(track)) {
			throw new RangeError('"Track must be a "Track" or "Track[]');
		}

		// Get the Last.fm API key and the available source managers
		const apiKey = this.manager.options.lastFmApiKey;
		const enabledSources = node.info.sourceManagers;

		// Determine if YouTube should be used
		if (!apiKey && enabledSources.includes("youtube")) {
			// Use YouTube-based autoplay
			return await this.handleYouTubeRecommendations(node, track);
		}

		if (!apiKey) return [];
		// Handle Last.fm-based autoplay (or other platforms)
		const selectedSource = node.selectPlatform(enabledSources);

		if (selectedSource) {
			// Use the selected source to handle autoplay
			return this.handlePlatformAutoplay(track, selectedSource, apiKey);
		}

		// If no source is available, return false
		return [];
	}

	private async handleYouTubeRecommendations(node: Node, track: Track): Promise<Track[]> {
		// Check if the previous track has a YouTube URL
		const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => track.uri.includes(url));
		// Get the video ID from the previous track's URL

		let videoID: string | null = null;
		if (hasYouTubeURL) {
			videoID = track.uri.split("=").pop();
		} else {
			const searchResult = await this.manager.search({ query: `${track.author} - ${track.title}`, source: SearchPlatform.YouTube }, track.requester);
			videoID = searchResult.tracks[0]?.uri.split("=").pop();
		}

		// If the video ID is not found, return false
		if (!videoID) return [];

		// Get a random video index between 2 and 24
		let randomIndex: number;
		let searchURI: string;
		do {
			// Generate a random index between 2 and 24
			randomIndex = Math.floor(Math.random() * 23) + 2;
			// Build the search URI
			searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}&index=${randomIndex}`;
		} while (track.uri.includes(searchURI));

		// Search for the video and return false if the search fails
		const res = await this.manager.search({ query: searchURI, source: SearchPlatform.YouTube }, track.requester);
		if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return [];

		// Return all track titles that do not have the same URI as the track.uri from before
		return res.tracks.filter((t) => t.uri !== track.uri);
	}

	private async handlePlatformAutoplay(track: Track, source: SearchPlatform, apiKey: string): Promise<Track[]> {
		let { author: artist } = track;
		const { title } = track;

		if (!artist || !title) {
			if (!title) {
				// No title provided, search for the artist's top tracks
				const noTitleUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
				const response = await axios.get(noTitleUrl);

				if (response.data.error || !response.data.toptracks?.track?.length) return [];

				const randomTrack = response.data.toptracks.track[Math.floor(Math.random() * response.data.toptracks.track.length)];
				const res = await this.manager.search({ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: source }, track.requester);
				if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return [];

				const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);
				if (!filteredTracks) return [];

				return filteredTracks;
			}
			if (!artist) {
				// No artist provided, search for the track title
				const noArtistUrl = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${title}&api_key=${apiKey}&format=json`;
				const response = await axios.get(noArtistUrl);
				artist = response.data.results.trackmatches?.track?.[0]?.artist;
				if (!artist) return [];
			}
		}

		// Search for similar tracks to the current track
		const url = `https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&artist=${artist}&track=${title}&limit=10&autocorrect=1&api_key=${apiKey}&format=json`;
		let response: axios.AxiosResponse;

		try {
			response = await axios.get(url);
		} catch (error) {
			if (error) return [];
		}

		if (response.data.error || !response.data.similartracks?.track?.length) {
			// Retry the request if the first attempt fails
			const retryUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getTopTracks&artist=${artist}&autocorrect=1&api_key=${apiKey}&format=json`;
			const retryResponse = await axios.get(retryUrl);

			if (retryResponse.data.error || !retryResponse.data.toptracks?.track?.length) return [];

			const randomTrack = retryResponse.data.toptracks.track[Math.floor(Math.random() * retryResponse.data.toptracks.track.length)];
			const res = await this.manager.search({ query: `${randomTrack.artist.name} - ${randomTrack.name}`, source: source }, track.requester);
			if (res.loadType === LoadTypes.Empty || res.loadType === LoadTypes.Error) return [];

			const filteredTracks = res.tracks.filter((t) => t.uri !== track.uri);
			if (!filteredTracks) return [];

			return filteredTracks;
		}

		return response.data.similartracks.track.filter((t: { uri: string }) => t.uri !== track.uri);
	}

	/**
	 * Sets the volume of the player.
	 * @param {number} volume - The new volume. Must be between 0 and 1000.
	 * @returns {Promise<Player>} - The updated player.
	 * @throws {TypeError} If the volume is not a number.
	 * @throws {RangeError} If the volume is not between 0 and 1000.
	 * @emits {PlayerStateUpdate} - Emitted when the volume is changed.
	 * @example
	 * player.setVolume(50);
	 */
	public async setVolume(volume: number): Promise<this> {
		if (isNaN(volume)) throw new TypeError("Volume must be a number.");

		if (volume < 0 || volume > 1000) throw new RangeError("Volume must be between 0 and 1000.");

		const oldPlayer = this ? { ...this } : null;
		await this.node.rest.updatePlayer({
			guildId: this.options.guildId,
			data: {
				volume,
			},
		});

		this.volume = volume;

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.VolumeChange,
			details: { previousVolume: oldPlayer.volume || null, currentVolume: this.volume },
		});

		return this;
	}

	/**
	 * Sets the sponsorblock for the player. This will set the sponsorblock segments for the player to the given segments.
	 * @param {SponsorBlockSegment[]} segments - The sponsorblock segments to set. Defaults to `[SponsorBlockSegment.Sponsor, SponsorBlockSegment.SelfPromo]` if not provided.
	 * @returns {Promise<void>} The promise is resolved when the operation is complete.
	 */
	public async setSponsorBlock(segments: SponsorBlockSegment[] = [SponsorBlockSegment.Sponsor, SponsorBlockSegment.SelfPromo]): Promise<void> {
		return this.node.setSponsorBlock(this, segments);
	}

	/**
	 * Gets the sponsorblock for the player.
	 * @returns {Promise<SponsorBlockSegment[]>} The sponsorblock segments.
	 */
	public async getSponsorBlock(): Promise<SponsorBlockSegment[]> {
		return this.node.getSponsorBlock(this);
	}

	/**
	 * Deletes the sponsorblock for the player. This will remove all sponsorblock segments that have been set for the player.
	 * @returns {Promise<void>}
	 */
	public async deleteSponsorBlock(): Promise<void> {
		return this.node.deleteSponsorBlock(this);
	}

	/**
	 * Sets the track repeat mode.
	 * When track repeat is enabled, the current track will replay after it ends.
	 * Disables queueRepeat and dynamicRepeat modes if enabled.
	 *
	 * @param repeat - A boolean indicating whether to enable track repeat.
	 * @returns {this} - The player instance.
	 * @throws {TypeError} If the repeat parameter is not a boolean.
	 */
	public setTrackRepeat(repeat: boolean): this {
		// Ensure the repeat parameter is a boolean
		if (typeof repeat !== "boolean") throw new TypeError('Repeat can only be "true" or "false".');

		// Clone the current player state for event emission
		const oldPlayer = this ? { ...this } : null;

		if (repeat) {
			// Enable track repeat and disable other repeat modes
			this.trackRepeat = true;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		} else {
			// Disable all repeat modes
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		// Emit an event indicating the repeat mode has changed
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.RepeatChange,
			detail: {
				changeType: "track",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		});

		return this;
	}

	/**
	 * Sets the queue repeat.
	 * @param repeat Whether to repeat the queue or not
	 * @returns {this} - The player instance.
	 * @throws {TypeError} If the repeat parameter is not a boolean
	 */
	public setQueueRepeat(repeat: boolean): this {
		// Ensure the repeat parameter is a boolean
		if (typeof repeat !== "boolean") throw new TypeError('Repeat can only be "true" or "false".');

		// Get the current player state
		const oldPlayer = this ? { ...this } : null;

		// Update the player state
		if (repeat) {
			this.trackRepeat = false;
			this.queueRepeat = true;
			this.dynamicRepeat = false;
		} else {
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		// Emit the player state update event
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.RepeatChange,
			detail: {
				changeType: "queue",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		});

		return this;
	}

	/**
	 * Sets the queue to repeat and shuffles the queue after each song.
	 * @param repeat "true" or "false".
	 * @param ms After how many milliseconds to trigger dynamic repeat.
	 * @returns {this} - The player instance.
	 * @throws {TypeError} If the repeat parameter is not a boolean.
	 * @throws {RangeError} If the queue size is less than or equal to 1.
	 */
	public setDynamicRepeat(repeat: boolean, ms: number): this {
		// Validate the repeat parameter
		if (typeof repeat !== "boolean") {
			throw new TypeError('Repeat can only be "true" or "false".');
		}

		// Ensure the queue has more than one track for dynamic repeat
		if (this.queue.size <= 1) {
			throw new RangeError("The queue size must be greater than 1.");
		}

		// Clone the current player state for comparison
		const oldPlayer = this ? { ...this } : null;

		if (repeat) {
			// Disable other repeat modes when dynamic repeat is enabled
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = true;

			// Set an interval to shuffle the queue periodically
			this.dynamicLoopInterval = setInterval(() => {
				if (!this.dynamicRepeat) return;
				// Shuffle the queue and replace it with the shuffled tracks
				const shuffled = _.shuffle(this.queue);
				this.queue.clear();
				shuffled.forEach((track) => {
					this.queue.add(track as Track);
				});
			}, ms);

			// Store the ms value
			this.dynamicRepeatIntervalMs = ms;
		} else {
			// Clear the interval and reset repeat states
			clearInterval(this.dynamicLoopInterval);
			this.dynamicRepeatIntervalMs = null;
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		// Emit a player state update event
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.RepeatChange,
			detail: {
				changeType: "dynamic",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		});

		return this;
	}

	/**
	 * Restarts the current track to the start.
	 * If there's no current track and there are tracks in the queue, it plays the next track.
	 */
	public async restart(): Promise<Player> {
		// Check if there is a current track in the queue
		if (!this.queue.current?.track) {
			// If the queue has tracks, play the next one
			if (this.queue.length) await this.play();
			return this;
		}

		// Reset the track's position to the start
		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				position: 0,
				encodedTrack: this.queue.current?.track,
			},
		});

		return this;
	}

	/**
	 * Stops the player and optionally removes tracks from the queue.
	 * @param {number} [amount] The amount of tracks to remove from the queue. If not provided, removes the current track if it exists.
	 * @returns {Promise<this>} - The player instance.
	 * @throws {RangeError} If the amount is greater than the queue length.
	 */
	public async stop(amount?: number): Promise<this> {
		const oldPlayer = this ? { ...this } : null;

		let removedTracks: Track[] = [];

		// If an amount is provided, remove that many tracks from the queue.
		if (typeof amount === "number" && amount > 1) {
			if (amount > this.queue.length) {
				throw new RangeError("Cannot skip more than the queue length.");
			}

			removedTracks = this.queue.slice(0, amount - 1);
			this.queue.splice(0, amount - 1);
		} else {
			// If no amount is provided, remove the current track if it exists.
			if (this.queue.current) {
				removedTracks.push(this.queue.current);
			}
		}

		// Stop the player and send an event to the manager.
		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				encodedTrack: null,
			},
		});

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "remove",
				tracks: removedTracks,
			},
		});

		return this;
	}

	/**
	 * Pauses or unpauses the player.
	 * @param {boolean} pause - Whether to pause or unpause the player.
	 * @returns {this} - The player instance.
	 * @throws {RangeError} If the pause parameter is not a boolean.
	 * @emits {PlayerStateUpdate} - With {@link PlayerStateEventTypes.PauseChange} as the change type.
	 */
	public async pause(pause: boolean): Promise<this> {
		// Validate the pause parameter to ensure it's a boolean.
		if (typeof pause !== "boolean") throw new RangeError('Pause can only be "true" or "false".');

		// If the pause state is already as desired or there are no tracks, return early.
		if (this.paused === pause || !this.queue.totalSize) return this;

		// Create a copy of the current player state for event emission.
		const oldPlayer = this ? { ...this } : null;

		// Update the playing and paused states.
		this.playing = !pause;
		this.paused = pause;

		// Send an update to the backend to change the pause state of the player.
		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				paused: pause,
			},
		});

		// Emit an event indicating the pause state has changed.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.PauseChange,
			details: {
				previousPause: oldPlayer.paused,
				currentPause: this.paused,
			},
		});

		return this;
	}

	
	/**
	 * Goes to the previous track in the queue.
	 * @returns {this} - The player instance.
	 * @throws {Error} If there are no previous tracks.
	 * @emits {PlayerStateUpdate} - With {@link PlayerStateEventTypes.TrackChange} as the change type.
	 */
	public async previous(): Promise<this> {
		// Check if there are previous tracks in the queue.
		if (!this.queue.previous.length) {
			throw new Error("No previous track available.");
		}

		// Capture the current state of the player before making changes.
		const oldPlayer = { ...this };

		// Get the last played track and remove it from the history
		const lastTrack = this.queue.previous.shift() as Track;

		// Set the skip flag to true to prevent the onTrackEnd event from playing the next track.
		this.set("skipFlag", true);
		await this.play(lastTrack);

		// Add the current track back to the start of the queue.
		this.queue.unshift(this.queue.current);

		// Emit a player state update event indicating the track change to previous.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.TrackChange,
			details: {
				changeType: "previous",
				track: lastTrack,
			},
		});

		// Reset the skip flag.
		this.set("skipFlag", false);
		return this;
	}

	/**
	 * Seeks to a position in the current track.
	 * @param position The position in milliseconds to seek to.
	 * @returns The player instance.
	 * @throws {RangeError} If the position is not a number.
	 */
	public async seek(position: number): Promise<this> {
		if (!this.queue.current) return undefined;
		position = Number(position);

		// Check if the position is valid.
		if (isNaN(position)) {
			throw new RangeError("Position must be a number.");
		}

		// Get the old player state.
		const oldPlayer = this ? { ...this } : null;

		// Clamp the position to ensure it is within the valid range.
		if (position < 0 || position > this.queue.current.duration) {
			position = Math.max(Math.min(position, this.queue.current.duration), 0);
		}

		// Update the player's position.
		this.position = position;

		// Send the seek request to the node.
		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				position: position,
			},
		});

		// Emit an event to notify the manager of the track change.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.TrackChange,
			details: {
				changeType: "timeUpdate",
				previousTime: oldPlayer.position,
				currentTime: this.position,
			},
		});

		return this;
	}

	/**
	 * Returns the current repeat state of the player.
	 * @param player The player to get the repeat state from.
	 * @returns The repeat state of the player, or null if it is not repeating.
	 */
	private getRepeatState(player: Player): string | null {
		// If the queue is repeating, return the queue repeat state.
		if (player.queueRepeat) return "queue";

		// If the track is repeating, return the track repeat state.
		if (player.trackRepeat) return "track";

		// If the dynamic repeat is enabled, return the dynamic repeat state.
		if (player.dynamicRepeat) return "dynamic";

		// If none of the above conditions are met, return null.
		return null;
	}

	/**
	 * Automatically moves the player to a usable node.
	 * @returns {Promise<Player | void>} - The player instance or void if not moved.
	 */
	public async autoMoveNode(): Promise<Player | void> {
		// Get a usable node from the manager
		const node = this.manager.useableNode;

		// Move the player to the usable node and return the result
		return await this.moveNode(node.options.identifier);
	}

	/**
	 * Moves the player to another node.
	 * @param {string} identifier - The identifier of the node to move to.
	 * @returns {Promise<Player>} - The player instance after being moved.
	 */
	public async moveNode(identifier: string): Promise<Player> {
		console.log(`Fetching node: ${identifier}`);
		const node = this.manager.nodes.get(identifier);

		if (!node) throw new Error(`Node with identifier ${identifier} not found`);

		if (node.options.identifier === this.node.options.identifier) {
			console.log("Already on the specified node, no need to move.");
			return this;
		}

		try {
			const playerPosition = this.position;
			const {
				sessionId,
				event: { token, endpoint },
			} = this.voiceState;
			const currentTrack = this.queue.current ? this.queue.current : null;

			await this.node.rest.destroyPlayer(this.guildId).catch(() => {});

			this.manager.players.delete(this.guildId);
			this.node = node;
			this.manager.players.set(this.guildId, this);

			await this.node.rest.updatePlayer({
				guildId: this.guildId,
				data: { position: playerPosition, encodedTrack: currentTrack?.track, voice: { token, endpoint, sessionId } },
			});

			// await this.node.rest.updatePlayer({
			// 	guildId: this.guildId,
			// 	data: {
			// 		position: playerPosition,
			// 		encodedTrack: this.queue.current?.track,
			// 	},
			// });
			// if (this.playing) await this.play();
		} catch (error) {
			console.log(error);
		}
	}

	/**
	 * Transfers the player to a new server. If the player already exists on the new server
	 * and force is false, this method will return the existing player. Otherwise, a new player
	 * will be created and the current player will be destroyed.
	 * @param {PlayerOptions} newOptions - The new options for the player.
	 * @param {boolean} force - Whether to force the creation of a new player.
	 * @returns {Promise<Player>} - The new player instance.
	 */
	public async switchGuild(newOptions: PlayerOptions, force: boolean = false): Promise<Player> {
		let newPlayer = this.manager.players.get(newOptions.guildId);

		// If the player already exists and force is false, return the existing player
		if (newPlayer && !force) {
			return newPlayer;
		}

		// Helper function to build tracks
		// const buildTrack = (trackData: Track) => {
		// 	return TrackUtils.buildUnresolved(trackData, trackData.requester);
		// };

		// Create a new player if it doesn't exist or force is true
		if (!newPlayer || force) {
			newPlayer = this.manager.create({
				guildId: newOptions.guildId,
				textChannelId: newOptions.textChannelId,
				voiceChannelId: newOptions.voiceChannelId,
				volume: newOptions.volume ?? this.volume,
				node: newOptions.node ?? this.node.options.identifier,
				selfMute: newOptions.selfMute ?? this.options.selfMute,
				selfDeafen: newOptions.selfDeafen ?? this.options.selfDeafen,
			});

			// Connect the new player
			newPlayer.connect();

			// Build tracks from the current player's queue
			const tracks = [this.queue.current, ...this.queue];

			// Add tracks to the new player
			newPlayer.queue.add(tracks as Track[]);

			// Play the first track if the old player was playing
			if (this.playing) {
				await newPlayer.play();
				newPlayer.seek(this.position);
			}

			// Pause the new player if the old player was paused
			if (this.paused) newPlayer.pause(true);

			// Set repeat settings
			if (this.queueRepeat) newPlayer.setQueueRepeat(true);
			if (this.trackRepeat) newPlayer.setTrackRepeat(true);
			if (this.dynamicRepeat && this.dynamicRepeatIntervalMs) {
				newPlayer.setDynamicRepeat(true, this.dynamicRepeatIntervalMs);
			}

			// Destroy the current player
			await this.destroy();

			// Emit a debug event with the transfer information
			const debugInfo = {
				success: true,
				message: `Transferred ${tracks.length} tracks successfully to <#${newOptions.voiceChannelId}> bound to <#${newOptions.textChannelId}>.`,
				player: {
					guildId: newPlayer.guildId,
					voiceChannelId: newPlayer.voiceChannelId,
					textChannelId: newPlayer.textChannelId,
					volume: newPlayer.volume,
					playing: newPlayer.playing,
					queueSize: newPlayer.queue.size,
				},
			};

			this.manager.emit(ManagerEventTypes.Debug, `[PLAYER] Transferred player to a new server: ${JSON.stringify(debugInfo)}.`);
		}

		// Return the new player
		return newPlayer;
	}

	/**
	 * Retrieves the current lyrics for the playing track.
	 * @param skipTrackSource - Indicates whether to skip the track source when fetching lyrics.
	 * @returns {Promise<Lyrics>} - The lyrics of the current track.
	 * @throws {RangeError} - If the 'lavalyrics-plugin' is not available on the Lavalink node.
	 */
	public async getCurrentLyrics(skipTrackSource: boolean = false): Promise<Lyrics> {
		// Check if the 'lavalyrics-plugin' is available on the node
		const hasLyricsPlugin = this.node.info.plugins.some((plugin: { name: string }) => plugin.name === "lavalyrics-plugin");
		if (!hasLyricsPlugin) {
			throw new RangeError(`There is no lavalyrics-plugin available in the Lavalink node: ${this.node.options.identifier}`);
		}

		// Fetch the lyrics for the current track from the Lavalink node
		let result = (await this.node.getLyrics(this.queue.current, skipTrackSource)) as Lyrics;

		// If no lyrics are found, return a default empty lyrics object
		if (!result) {
			result = {
				source: null,
				provider: null,
				text: null,
				lines: [],
				plugin: [],
			};
		}

		return result;
	}
}

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
	readonly requester?: User | ClientUser;
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
