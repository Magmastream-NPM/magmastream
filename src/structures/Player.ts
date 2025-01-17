import { Filters } from "./Filters";
import { LavalinkResponse, Manager, PlaylistRawData, SearchQuery, SearchResult, PlayerStateEventTypes } from "./Manager";
import { LavalinkInfo, Node, SponsorBlockSegment } from "./Node";
import { Queue } from "./Queue";
import { Sizes, State, Structure, TrackSourceName, TrackUtils, VoiceState } from "./Utils";
import * as _ from "lodash";
import playerCheck from "../utils/playerCheck";
import { ClientUser, Message, User } from "discord.js";

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
	/** The number of times to try autoplay before emitting queueEnd. */
	public autoplayTries: number = 3;

	private static _manager: Manager;
	private readonly data: Record<string, unknown> = {};
	private dynamicLoopInterval: NodeJS.Timeout | null = null;

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
	 * Creates a new player, returns one if it already exists.
	 * @param options The player options.
	 * @see https://docs.magmastream.com/main/introduction/getting-started
	 */
	constructor(public options: PlayerOptions) {
		// If the Manager is not initiated, throw an error.
		if (!this.manager) this.manager = Structure.get("Player")._manager;
		if (!this.manager) throw new RangeError("Manager has not been initiated.");

		// If a player with the same guild ID already exists, return it.
		if (this.manager.players.has(options.guild)) {
			return this.manager.players.get(options.guild);
		}

		// Check the player options for errors.
		playerCheck(options);

		// Set the guild ID and voice state.
		this.guild = options.guild;
		this.voiceState = Object.assign({
			op: "voiceUpdate",
			guild_id: options.guild,
		});

		// Set the voice and text channels if they exist.
		if (options.voiceChannel) this.voiceChannel = options.voiceChannel;
		if (options.textChannel) this.textChannel = options.textChannel;

		// Set the node to use, either the specified node or the first available node.
		const node = this.manager.nodes.get(options.node);
		this.node = node || this.manager.useableNodes;

		// If no node is available, throw an error.
		if (!this.node) throw new RangeError("No available nodes.");

		// Initialize the queue with the guild and manager.
		this.queue = new Queue(this.guild, this.manager);

		// Add the player to the manager's player collection.
		this.manager.players.set(options.guild, this);

		// Emit the playerCreate event.
		this.manager.emit("playerCreate", this);

		// Set the initial volume.
		this.setVolume(options.volume ?? 100);

		// Initialize the filters.
		this.filters = new Filters(this);
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
	 * Connect to the voice channel.
	 * @returns {this} - The player instance.
	 * @throws {RangeError} If no voice channel has been set.
	 */
	public connect(): this {
		if (!this.voiceChannel) throw new RangeError("No voice channel has been set.");

		this.state = "CONNECTING";

		const oldPlayer = this ? { ...this } : null;

		// Send the voice state update to the gateway
		this.manager.options.send(this.guild, {
			op: 4,
			d: {
				guild_id: this.guild,
				channel_id: this.voiceChannel,
				self_mute: this.options.selfMute || false,
				self_deaf: this.options.selfDeafen || false,
			},
		});

		// Set the player state to connected
		this.state = "CONNECTED";

		// Emit the player state update event
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.CONNECTION_CHANGE,
			details: {
				changeType: "connect",
				previousConnection: oldPlayer?.state === "CONNECTED",
				currentConnection: true,
			},
		});

		return this;
	}

	/**
	 * Disconnects the player from the voice channel.
	 * @returns {this} - The player instance.
	 * @throws {TypeError} If the player is not connected.
	 */
	public disconnect(): this {
		if (this.voiceChannel === null) {
			throw new TypeError("The player is not connected.");
		}

		this.state = "DISCONNECTING";

		const oldPlayer = this ? { ...this } : null;
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

		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.CONNECTION_CHANGE,
			details: {
				changeType: "disconnect",
				previousConnection: oldPlayer.state === "CONNECTED",
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
	public destroy(disconnect: boolean = true): void {
		if (typeof disconnect !== "boolean") throw new TypeError("Disconnect must be a boolean.");

		const oldPlayer = this ? { ...this } : null;
		this.state = "DESTROYING";

		if (disconnect) {
			this.disconnect();
		}

		this.node.rest.destroyPlayer(this.guild);
		this.manager.emit("playerDestroy", this);
		this.manager.players.delete(this.guild);
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.PLAYER_DESTROY,
		});
	}

	/**
	 * Sets the player voice channel.
	 * @param {string} channel - The new voice channel ID.
	 * @returns {this} - The player instance.
	 * @throws {TypeError} If the channel parameter is not a string.
	 */
	public setVoiceChannel(channel: string): this {
		// Validate the channel parameter
		if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

		// Clone the current player state for comparison
		const oldPlayer = this ? { ...this } : null;

		// Update the player voice channel
		this.voiceChannel = channel;
		this.connect();

		// Emit a player state update event
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.CHANNEL_CHANGE,
			details: {
				changeType: "voice",
				previousChannel: oldPlayer.voiceChannel || null,
				currentChannel: this.voiceChannel,
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
	public setTextChannel(channel: string): this {
		// Validate the channel parameter
		if (typeof channel !== "string") throw new TypeError("Channel must be a non-empty string.");

		// Clone the current player state for comparison
		const oldPlayer = this ? { ...this } : null;

		// Update the text channel property
		this.textChannel = channel;

		// Emit a player state update event with channel change details
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.CHANNEL_CHANGE,
			details: {
				changeType: "text",
				previousChannel: oldPlayer.textChannel || null,
				currentChannel: this.textChannel,
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
	 * @returns {Promise<void>}
	 */
	public async play(): Promise<void>;
	public async play(track: Track | UnresolvedTrack): Promise<void>;
	public async play(options: PlayOptions): Promise<void>;
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
	public setAutoplay(autoplayState: boolean, botUser: object, tries: number = 3) {
		if (typeof autoplayState !== "boolean") {
			throw new TypeError("autoplayState must be a boolean.");
		}

		if (typeof botUser !== "object") {
			throw new TypeError("botUser must be a user-object.");
		}

		if (typeof tries !== "number" || tries < 1) {
			tries = 3; // Default to 3 if invalid
		}

		const oldPlayer = this ? { ...this } : null;

		this.isAutoplay = autoplayState;
		this.autoplayTries = tries;
		this.set("Internal_BotUser", botUser);

		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.AUTOPLAY_CHANGE,
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
	 * @param {User | ClientUser} requester - The user who requested the track.
	 * @returns {Promise<Track[]>} - Array of recommended tracks.
	 */
	public async getRecommended<T = User | ClientUser>(track: Track, requester?: T): Promise<Track[]> {
		const node = this.manager.useableNodes;

		if (!node) {
			throw new Error("No available nodes.");
		}

		const hasSpotifyURL = ["spotify.com", "open.spotify.com"].some((url) => track.uri.includes(url));
		const hasYouTubeURL = ["youtube.com", "youtu.be"].some((url) => track.uri.includes(url));

		/**
		 * If the track has a Spotify URL, use the Spotify plugin to get recommendations.
		 * @see {@link https://github.com/topi314/LavaSrc}
		 */
		if (hasSpotifyURL) {
			const res = await node.rest.get(`/v4/info`);
			const info = res as LavalinkInfo;

			/**
			 * Check if the Spotify plugin is enabled and if the Spotify source manager is enabled.
			 * @see {@link https://lavalink.dev/api/rest.html#info-response}
			 */
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
							const tracks = recommendedTracks.map((track) => TrackUtils.build(track, requester));

							return tracks;
						}
					}
				}
			}
		}

		// If the track has a YouTube URL, use YouTube to get recommendations.
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
	 * @param {number} volume - The volume to set the player to. Must be between 0 and 100.
	 * @returns {this} - The player instance.
	 */
	public setVolume(volume: number): this {
		if (isNaN(volume)) throw new TypeError("Volume must be a number.");
		if (volume < 0 || volume > 100) throw new RangeError("Volume must be between 0 and 100.");

		const oldPlayer = this ? { ...this } : null;
		this.node.rest.updatePlayer({
			guildId: this.options.guild,
			data: {
				volume,
			},
		});

		this.volume = volume;

		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.VOLUME_CHANGE,
			details: { previousVolume: oldPlayer.volume || null, currentVolume: this.volume },
		});

		return this;
	}

	/**
	 * Sets the sponsorblock for the player. This will set the sponsorblock segments for the player to the given segments.
	 * @param {SponsorBlockSegment[]} segments - The sponsorblock segments to set. Defaults to `["sponsor", "selfpromo"]` if not provided.
	 * @returns {Promise<void>} The promise is resolved when the operation is complete.
	 */
	public async setSponsorBlock(segments: SponsorBlockSegment[] = ["sponsor", "selfpromo"]): Promise<void> {
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
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.REPEAT_CHANGE,
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
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.REPEAT_CHANGE,
			detail: {
				changeType: "queue",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		});

		// Return the current instance for chaining
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
					this.queue.add(track);
				});
			}, ms);
		} else {
			// Clear the interval and reset repeat states
			clearInterval(this.dynamicLoopInterval);
			this.trackRepeat = false;
			this.queueRepeat = false;
			this.dynamicRepeat = false;
		}

		// Emit a player state update event
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.REPEAT_CHANGE,
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
	public restart(): void {
		// Check if there is a current track in the queue
		if (!this.queue.current?.track) {
			// If the queue has tracks, play the next one
			if (this.queue.length) this.play();
			return;
		}

		// Reset the track's position to the start
		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				position: 0,
				encodedTrack: this.queue.current?.track,
			},
		});
	}

	/**
	 * Stops the current track, optionally give an amount to skip to, e.g 5 would play the 5th song.
	 * @param amount - The amount of tracks to skip, e.g 5 would play the 5th song.
	 * @returns {this} - The player instance.
	 */
	public stop(amount?: number): this {
		const oldPlayer = this ? { ...this } : null;

		let removedTracks: (Track | UnresolvedTrack)[] = [];

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
		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				encodedTrack: null,
			},
		});

		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "remove",
				tracks: removedTracks,
			},
		});

		return this;
	}

	/**
	 * Pauses or resumes the current track.
	 * @param pause - A boolean indicating whether to pause (true) or resume (false) the track.
	 * @returns {this} - The player instance.
	 */
	public pause(pause: boolean): this {
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
		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				paused: pause,
			},
		});

		// Emit an event indicating the pause state has changed.
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.PAUSE_CHANGE,
			details: {
				previousPause: oldPlayer.paused,
				currentPause: this.paused,
			},
		});

		return this;
	}

	/**
	 * Goes back to the previous song in the queue.
	 * @returns {this} - The player instance.
	 */
	public previous(): this {
		// Capture the current state of the player before making changes.
		const oldPlayer = this ? { ...this } : null;

		// Move the previous track to the beginning of the queue.
		this.queue.unshift(this.queue.previous);

		// Stop the current track to allow playing the previous track.
		this.stop();

		// Emit a player state update event indicating the track change to previous.
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.TRACK_CHANGE,
			details: {
				changeType: "previous",
				track: this.queue.previous,
			},
		});

		// Return the player instance for method chaining.
		return this;
	}

	/**
	 * Seeks to the specified position in the current track.
	 * @param position The position in milliseconds to seek to.
	 * @returns {this} - The player instance.
	 */
	public seek(position: number): this {
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
		this.node.rest.updatePlayer({
			guildId: this.guild,
			data: {
				position: position,
			},
		});

		// Emit an event to notify the manager of the track change.
		this.manager.emit("playerStateUpdate", oldPlayer, this, {
			changeType: PlayerStateEventTypes.TRACK_CHANGE,
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
