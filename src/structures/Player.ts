import { Filters } from "./Filters";
import { Manager } from "./Manager";
import { Node } from "./Node";
import { MemoryQueue } from "../statestorage/MemoryQueue";
import { AutoPlayUtils, Structure, TrackUtils } from "./Utils";
import * as _ from "lodash";
import playerCheck from "../utils/playerCheck";
import { ClientUser, Message, User } from "discord.js";
import { RedisQueue } from "../statestorage/RedisQueue";
import { IQueue, Lyrics, PlayerOptions, PlayerStateUpdateEvent, PlayOptions, SearchQuery, SearchResult, Track, VoiceReceiverEvent, VoiceState } from "./Types";
import { ManagerEventTypes, PlayerStateEventTypes, SponsorBlockSegment, StateStorageType, StateTypes } from "./Enums";
import { WebSocket } from "ws";
import { JsonQueue } from "../statestorage/JsonQueue";

export class Player {
	/** The Queue for the Player. */
	public queue: IQueue;
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
	public volume = 100;
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
	public autoplayTries: number = 3;
	/** The cluster ID for the player. */
	public clusterId: number = 0;

	private readonly data: Record<string, unknown> = {};
	private dynamicLoopInterval: NodeJS.Timeout | null = null;
	public dynamicRepeatIntervalMs: number | null = null;
	private static _manager: Manager;

	/** Should only be used when the node is a NodeLink */
	protected voiceReceiverWsClient: WebSocket | null;
	protected isConnectToVoiceReceiver: boolean;
	protected voiceReceiverReconnectTimeout: NodeJS.Timeout | null;
	protected voiceReceiverAttempt: number;
	protected voiceReceiverReconnectTries: number;

	/**
	 * Creates a new player, returns one if it already exists.
	 * @param options The player options.
	 * @see https://docs.magmastream.com/main/introduction/getting-started
	 */
	constructor(public options: PlayerOptions) {
		// If the Manager is not initiated, throw an error.
		if (!this.manager) this.manager = Structure.get("Player")._manager;
		if (!this.manager) throw new RangeError("Manager has not been initiated.");

		this.clusterId = this.manager.options.clusterId || 0;
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
		switch (this.manager.options.stateStorage.type) {
			case StateStorageType.Redis:
				this.queue = new RedisQueue(this.guildId, this.manager);
				break;
			case StateStorageType.Memory:
				this.queue = new MemoryQueue(this.guildId, this.manager);
				break;
			case StateStorageType.JSON:
				this.queue = new JsonQueue(this.guildId, this.manager);
				break;
		}

		// if (this.queue instanceof MemoryQueue) {
		// 	this.queue.previous = [];
		// }

		// Add the player to the manager's player collection.
		this.manager.players.set(options.guildId, this);

		// Set the initial volume.
		this.setVolume(options.volume ?? 100);

		// Initialize the filters.
		this.filters = new Filters(this);

		// Emit the playerCreate event.
		this.manager.emit(ManagerEventTypes.PlayerCreate, this);
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
	 * Same as Manager#search() but a shortcut on the player itself.
	 * @param query
	 * @param requester
	 */
	public async search<T = unknown>(query: string | SearchQuery, requester?: T): Promise<SearchResult> {
		return await this.manager.search(query, requester);
	}

	/**
	 * Connects the player to the voice channel.
	 * @throws {RangeError} If no voice channel has been set.
	 * @returns {void}
	 */
	public async connect(): Promise<void> {
		// Check if the voice channel has been set.
		if (!this.voiceChannelId) {
			throw new RangeError("No voice channel has been set. You must use the `setVoiceChannelId()` method to set the voice channel before connecting.");
		}

		// Set the player state to connecting.
		this.state = StateTypes.Connecting;

		// Clone the current player state for comparison.
		const oldPlayer = this ? { ...this } : null;

		this.manager.sendPacket({
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
				type: "connection",
				action: "connect",
				previousConnection: oldPlayer?.state === StateTypes.Connected,
				currentConnection: true,
			},
		} as PlayerStateUpdateEvent);
	}

	/**
	 * Disconnects the player from the voice channel.
	 * @returns {this} The player instance.
	 */
	public async disconnect(): Promise<this> {
		// Set the player state to disconnecting.
		this.state = StateTypes.Disconnecting;

		// Clone the current player state for comparison.
		const oldPlayer = this ? { ...this } : null;

		// Pause the player.
		await this.pause(true);

		// Send the voice state update to the gateway.
		this.manager.sendPacket({
			op: 4,
			d: {
				guild_id: this.guildId,
				channel_id: null,
				self_mute: null,
				self_deaf: null,
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
				type: "connection",
				action: "disconnect",
				previousConnection: oldPlayer.state === StateTypes.Connected,
				currentConnection: false,
			},
		} as PlayerStateUpdateEvent);

		return this;
	}

	/**
	 * Destroys the player and clears the queue.
	 * @param {boolean} disconnect - Whether to disconnect the player from the voice channel.
	 * @returns {Promise<boolean>} - Whether the player was successfully destroyed.
	 * @emits {PlayerDestroy} - Emitted when the player is destroyed.
	 * @emits {PlayerStateUpdate} - Emitted when the player state is updated.
	 */
	public async destroy(disconnect: boolean = true): Promise<boolean> {
		this.state = StateTypes.Destroying;

		if (disconnect) {
			await this.disconnect().catch((err) => {
				console.warn(`[Player#destroy] Failed to disconnect player ${this.guildId}:`, err);
			});
		}

		await this.node.rest.destroyPlayer(this.guildId).catch((err) => {
			console.warn(`[Player#destroy] REST failed to destroy player ${this.guildId}:`, err);
		});

		await this.queue.clear();
		await this.queue.clearPrevious();
		await this.queue.setCurrent(null);

		this.manager.emit(ManagerEventTypes.PlayerDestroy, this);

		const deleted = this.manager.players.delete(this.guildId);

		if (this.manager.options.stateStorage.deleteInactivePlayers) await this.manager.cleanupInactivePlayer(this.guildId);
		return deleted;
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
				type: "channel",
				action: "voice",
				previousChannel: oldPlayer.voiceChannelId || null,
				currentChannel: this.voiceChannelId,
			},
		} as PlayerStateUpdateEvent);

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
				type: "channel",
				action: "text",
				previousChannel: oldPlayer.textChannelId || null,
				currentChannel: this.textChannelId,
			},
		} as PlayerStateUpdateEvent);

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
			await this.queue.setCurrent(optionsOrTrack as Track);
		}

		if (!(await this.queue.getCurrent())) throw new RangeError("No current track.");

		const finalOptions = playOptions
			? playOptions
			: ["startTime", "endTime", "noReplace"].every((v) => Object.keys(optionsOrTrack || {}).includes(v))
			? (optionsOrTrack as PlayOptions)
			: {};

		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				encodedTrack: (await this.queue.getCurrent()).track,
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
	public setAutoplay<T = unknown>(autoplayState: boolean, botUser?: T, tries?: number): this {
		if (typeof autoplayState !== "boolean") {
			throw new Error("autoplayState must be a boolean.");
		}

		if (autoplayState) {
			if (!botUser) {
				throw new Error("botUser must be provided when enabling autoplay.");
			}

			if (!["ClientUser", "User"].includes(botUser.constructor.name)) {
				throw new Error("botUser must be a user-object.");
			}

			this.autoplayTries = tries && typeof tries === "number" && tries > 0 ? tries : 3; // Default to 3 if invalid
			this.isAutoplay = true;
			this.set("Internal_BotUser", botUser as User | ClientUser);
		} else {
			this.isAutoplay = false;
			this.autoplayTries = null;
			this.set("Internal_BotUser", null);
		}

		const oldPlayer = { ...this };

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.AutoPlayChange,
			details: {
				type: "autoplay",
				action: "toggle",
				previousAutoplay: oldPlayer.isAutoplay,
				currentAutoplay: this.isAutoplay,
			},
		} as PlayerStateUpdateEvent);

		return this;
	}

	/**
	 * Gets recommended tracks and returns an array of tracks.
	 * @param {Track} track - The track to find recommendations for.
	 * @returns {Promise<Track[]>} - Array of recommended tracks.
	 */
	public async getRecommendedTracks(track: Track): Promise<Track[]> {
		const tracks = await AutoPlayUtils.getRecommendedTracks(track);
		return tracks;
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
	 * player.setVolume(50, { gradual: true, interval: 50, step: 5 });
	 */
	public async setVolume(volume: number): Promise<this> {
		if (isNaN(volume)) throw new TypeError("Volume must be a number.");
		if (volume < 0 || volume > 1000) throw new RangeError("Volume must be between 0 and 1000.");

		const oldVolume = this.volume;
		const oldPlayer = { ...this };

		await this.node.rest.updatePlayer({
			guildId: this.options.guildId,
			data: { volume },
		});

		this.volume = volume;

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.VolumeChange,
			details: {
				type: "volume",
				action: "adjust",
				previousVolume: oldVolume,
				currentVolume: this.volume,
			},
		} as PlayerStateUpdateEvent);

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
			details: {
				type: "repeat",
				action: "track",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		} as PlayerStateUpdateEvent);

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
			details: {
				type: "repeat",
				action: "queue",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		} as PlayerStateUpdateEvent);

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
	public async setDynamicRepeat(repeat: boolean, ms: number): Promise<this> {
		// Validate the repeat parameter
		if (typeof repeat !== "boolean") {
			throw new TypeError('Repeat can only be "true" or "false".');
		}

		// Ensure the queue has more than one track for dynamic repeat
		if ((await this.queue.size()) <= 1) {
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
			this.dynamicLoopInterval = setInterval(async () => {
				if (!this.dynamicRepeat) return;
				// Shuffle the queue and replace it with the shuffled tracks
				const tracks = await this.queue.getTracks();
				const shuffled = _.shuffle(tracks);
				await this.queue.clear();
				await this.queue.add(shuffled);
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
			details: {
				type: "repeat",
				action: "dynamic",
				previousRepeat: this.getRepeatState(oldPlayer),
				currentRepeat: this.getRepeatState(this),
			},
		} as PlayerStateUpdateEvent);

		return this;
	}

	/**
	 * Restarts the currently playing track from the beginning.
	 * If there is no track playing, it will play the next track in the queue.
	 * @returns {Promise<Player>} The current instance of the Player class for method chaining.
	 */
	public async restart(): Promise<Player> {
		// Check if there is a current track in the queue
		if (!(await this.queue.getCurrent())?.track) {
			// If the queue has tracks, play the next one
			if (await this.queue.size()) await this.play();
			return this;
		}

		// Reset the track's position to the start
		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				position: 0,
				encodedTrack: (await this.queue.getCurrent())?.track,
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
		const oldPlayer = { ...this };
		let removedTracks: Track[] = [];

		if (typeof amount === "number" && amount > 1) {
			if (amount > (await this.queue.size())) throw new RangeError("Cannot skip more than the queue length.");
			removedTracks = await this.queue.getSlice(0, amount - 1);
			await this.queue.modifyAt(0, amount - 1);
		}

		this.node.rest.updatePlayer({
			guildId: this.guildId,
			data: {
				encodedTrack: null,
			},
		});

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "remove",
				tracks: removedTracks,
			},
		} as PlayerStateUpdateEvent);

		return this;
	}

	/**
	 * Skips the current track.
	 * @returns {this} - The player instance.
	 * @throws {Error} If there are no tracks in the queue.
	 * @emits {PlayerStateUpdate} - With {@link PlayerStateEventTypes.TrackChange} as the change type.
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
				type: "pause",
				action: "pause",
				previousPause: oldPlayer.paused,
				currentPause: this.paused,
			},
		} as PlayerStateUpdateEvent);

		return this;
	}

	/**
	 * Skips to the previous track in the queue.
	 * @returns {this} - The player instance.
	 * @throws {Error} If there are no previous tracks in the queue.
	 * @emits {PlayerStateUpdate} - With {@link PlayerStateEventTypes.TrackChange} as the change type.
	 */
	public async previous(): Promise<this> {
		// Get and remove the most recent previous track
		const lastTrack = await this.queue.popPrevious();

		if (!lastTrack) {
			await this.queue.clearPrevious();
			throw new Error("No previous track available.");
		}

		// Capture the current state of the player before making changes.
		const oldPlayer = { ...this };

		// Set skip flag so trackEnd doesn't add current to previous
		this.set("skipFlag", true);
		await this.play(lastTrack);

		// Emit state update
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this, {
			changeType: PlayerStateEventTypes.TrackChange,
			details: {
				type: "track",
				action: "previous",
				track: lastTrack,
			},
		} as PlayerStateUpdateEvent);

		return this;
	}

	/**
	 * Seeks to a given position in the currently playing track.
	 * @param position - The position in milliseconds to seek to.
	 * @returns {this} - The player instance.
	 * @throws {Error} If the position is invalid.
	 * @emits {PlayerStateUpdate} - With {@link PlayerStateEventTypes.TrackChange} as the change type.
	 */
	public async seek(position: number): Promise<this> {
		if (!(await this.queue.getCurrent())) return undefined;
		position = Number(position);

		// Check if the position is valid.
		if (isNaN(position)) {
			throw new RangeError("Position must be a number.");
		}

		// Get the old player state.
		const oldPlayer = this ? { ...this } : null;

		// Clamp the position to ensure it is within the valid range.
		if (position < 0 || position > (await this.queue.getCurrent()).duration) {
			position = Math.max(Math.min(position, (await this.queue.getCurrent()).duration), 0);
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
				type: "track",
				action: "timeUpdate",
				previousTime: oldPlayer.position,
				currentTime: this.position,
			},
		} as PlayerStateUpdateEvent);

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
		const node = this.manager.nodes.get(identifier);

		if (!node) throw new Error(`Node with identifier ${identifier} not found`);

		if (this.state !== StateTypes.Connected) {
			return this;
		}

		if (node.options.identifier === this.node.options.identifier) {
			return this;
		}

		try {
			const playerPosition = this.position;
			const currentTrack = (await this.queue.getCurrent()) ? await this.queue.getCurrent() : null;

			// Safely get voice state properties with null checks
			const sessionId = this.voiceState?.sessionId;
			const token = this.voiceState?.event?.token;
			const endpoint = this.voiceState?.event?.endpoint;

			if (!sessionId || !token || !endpoint) {
				throw new Error(`Voice state is not properly initialized for player ${this.guildId}. The bot might not be connected to a voice channel.`);
			}

			await this.node.rest.destroyPlayer(this.guildId).catch(() => {});

			this.manager.players.delete(this.guildId);

			this.node = node;
			this.manager.players.set(this.guildId, this);

			await this.node.rest.updatePlayer({
				guildId: this.guildId,
				data: { paused: this.paused, volume: this.volume, position: playerPosition, encodedTrack: currentTrack?.track, voice: { token, endpoint, sessionId } },
			});

			await this.filters.updateFilters();
		} catch (error) {
			throw new Error(`Failed to move player to node ${identifier}: ${error}`);
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
		if (!newOptions.guildId) throw new Error("guildId is required");
		if (!newOptions.voiceChannelId) throw new Error("Voice channel ID is required");
		if (!newOptions.textChannelId) throw new Error("Text channel ID is required");

		// Check if a player already exists for the new guild
		let newPlayer = this.manager.getPlayer(newOptions.guildId);

		// If the player already exists and force is false, return the existing player
		if (newPlayer && !force) return newPlayer;

		const oldPlayerProperties = {
			paused: this.paused,
			selfMute: this.options.selfMute,
			selfDeafen: this.options.selfDeafen,
			volume: this.volume,
			position: this.position,
			queue: {
				current: await this.queue.getCurrent(),
				tracks: [...(await this.queue.getTracks())],
				previous: [...(await this.queue.getPrevious())],
			},
			trackRepeat: this.trackRepeat,
			queueRepeat: this.queueRepeat,
			dynamicRepeat: this.dynamicRepeat,
			dynamicRepeatIntervalMs: this.dynamicRepeatIntervalMs,
			ClientUser: this.get("Internal_BotUser") as User | ClientUser,
			filters: this.filters,
			nowPlayingMessage: this.nowPlayingMessage,
			isAutoplay: this.isAutoplay,
		};

		// If force is true, destroy the existing player for the new guild
		if (force && newPlayer) {
			await newPlayer.destroy();
		}

		newOptions.node = newOptions.node ?? this.options.node;
		newOptions.selfDeafen = newOptions.selfDeafen ?? oldPlayerProperties.selfDeafen;
		newOptions.selfMute = newOptions.selfMute ?? oldPlayerProperties.selfMute;
		newOptions.volume = newOptions.volume ?? oldPlayerProperties.volume;

		// Deep clone the current player
		const clonedPlayer = this.manager.create(newOptions);

		// Connect the cloned player to the new voice channel
		clonedPlayer.connect();

		// Update the player's state on the Lavalink node
		await clonedPlayer.node.rest.updatePlayer({
			guildId: clonedPlayer.guildId,
			data: {
				paused: oldPlayerProperties.paused,
				volume: oldPlayerProperties.volume,
				position: oldPlayerProperties.position,
				encodedTrack: oldPlayerProperties.queue.current?.track,
			},
		});

		await clonedPlayer.queue.setCurrent(oldPlayerProperties.queue.current);
		await clonedPlayer.queue.addPrevious(oldPlayerProperties.queue.previous);
		await clonedPlayer.queue.add(oldPlayerProperties.queue.tracks);
		clonedPlayer.filters = oldPlayerProperties.filters;
		clonedPlayer.isAutoplay = oldPlayerProperties.isAutoplay;
		clonedPlayer.nowPlayingMessage = oldPlayerProperties.nowPlayingMessage;
		clonedPlayer.trackRepeat = oldPlayerProperties.trackRepeat;
		clonedPlayer.queueRepeat = oldPlayerProperties.queueRepeat;
		clonedPlayer.dynamicRepeat = oldPlayerProperties.dynamicRepeat;
		clonedPlayer.dynamicRepeatIntervalMs = oldPlayerProperties.dynamicRepeatIntervalMs;
		clonedPlayer.set("Internal_BotUser", oldPlayerProperties.ClientUser as User | ClientUser);
		clonedPlayer.paused = oldPlayerProperties.paused;

		// Update filters for the cloned player
		await clonedPlayer.filters.updateFilters();

		// Debug information
		const debugInfo = {
			success: true,
			message: `Transferred ${await clonedPlayer.queue.size()} tracks successfully to <#${newOptions.voiceChannelId}> bound to <#${newOptions.textChannelId}>.`,
			player: {
				guildId: clonedPlayer.guildId,
				voiceChannelId: clonedPlayer.voiceChannelId,
				textChannelId: clonedPlayer.textChannelId,
				volume: clonedPlayer.volume,
				playing: clonedPlayer.playing,
				queueSize: clonedPlayer.queue.size,
			},
		};

		this.manager.emit(ManagerEventTypes.Debug, `[PLAYER] Transferred player to a new server: ${JSON.stringify(debugInfo)}.`);

		// Return the cloned player
		return clonedPlayer;
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
		let result = (await this.node.getLyrics(await this.queue.getCurrent(), skipTrackSource)) as Lyrics;

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

	/**
	 * Sets up the voice receiver for the player.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver is set up.
	 * @throws {Error} - If the node is not a NodeLink.
	 */
	public async setupVoiceReceiver(): Promise<void> {
		if (!this.node.isNodeLink) throw new Error("This function is only available for NodeLinks");

		if (this.voiceReceiverWsClient) await this.removeVoiceReceiver();

		const headers: { [key: string]: string } = {
			Authorization: this.node.options.password,
			"User-Id": this.manager.options.clientId,
			"Guild-Id": this.guildId,
			"Client-Name": this.manager.options.clientName,
		};

		const { host, useSSL, port } = this.node.options;

		this.voiceReceiverWsClient = new WebSocket(`${useSSL ? "wss" : "ws"}://${host}:${port}/connection/data`, { headers });
		this.voiceReceiverWsClient.on("open", () => this.openVoiceReceiver());
		this.voiceReceiverWsClient.on("error", (err) => this.onVoiceReceiverError(err));
		this.voiceReceiverWsClient.on("message", (data) => this.onVoiceReceiverMessage(data.toString()));
		this.voiceReceiverWsClient.on("close", (code, reason) => this.closeVoiceReceiver(code, reason.toString()));
	}

	/**
	 * Removes the voice receiver for the player.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver is removed.
	 * @throws {Error} - If the node is not a NodeLink.
	 */
	public async removeVoiceReceiver(): Promise<void> {
		if (!this.node.isNodeLink) throw new Error("This function is only available for NodeLinks");

		if (this.voiceReceiverWsClient) {
			this.voiceReceiverWsClient.close(1000, "destroy");
			this.voiceReceiverWsClient.removeAllListeners();
			this.voiceReceiverWsClient = null;
		}

		this.isConnectToVoiceReceiver = false;
	}

	/**
	 * Closes the voice receiver for the player.
	 * @param {number} code - The code to close the voice receiver with.
	 * @param {string} reason - The reason to close the voice receiver with.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver is closed.
	 */
	private async closeVoiceReceiver(code: number, reason: string): Promise<void> {
		await this.disconnectVoiceReceiver();

		this.manager.emit(ManagerEventTypes.Debug, `[PLAYER] Closed voice receiver for player ${this.guildId} with code ${code} and reason ${reason}`);

		if (code !== 1000) await this.reconnectVoiceReceiver();
	}

	/**
	 * Reconnects the voice receiver for the player.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver is reconnected.
	 */
	private async reconnectVoiceReceiver(): Promise<void> {
		this.voiceReceiverReconnectTimeout = setTimeout(async () => {
			if (this.voiceReceiverAttempt > this.voiceReceiverReconnectTries) throw new Error("Failed to reconnect to voice receiver");

			this.voiceReceiverWsClient?.removeAllListeners();
			this.voiceReceiverWsClient = null;

			this.manager.emit(ManagerEventTypes.Debug, `[PLAYER] Reconnecting to voice receiver for player ${this.guildId}`);

			await this.setupVoiceReceiver();
			this.voiceReceiverAttempt++;
		}, this.node.options.retryDelayMs);
	}

	/**
	 * Disconnects the voice receiver for the player.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver is disconnected.
	 */
	private async disconnectVoiceReceiver(): Promise<void> {
		if (!this.isConnectToVoiceReceiver) return;

		this.voiceReceiverWsClient?.close(1000, "destroy");
		this.voiceReceiverWsClient?.removeAllListeners();
		this.voiceReceiverWsClient = null;

		this.manager.emit(ManagerEventTypes.Debug, `[PLAYER] Disconnected from voice receiver for player ${this.guildId}`);
		this.manager.emit(ManagerEventTypes.VoiceReceiverDisconnect, this);
	}

	/**
	 * Opens the voice receiver for the player.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver is opened.
	 */
	private async openVoiceReceiver(): Promise<void> {
		if (this.voiceReceiverReconnectTimeout) clearTimeout(this.voiceReceiverReconnectTimeout);
		this.voiceReceiverReconnectTimeout = null;
		this.isConnectToVoiceReceiver = true;
		this.manager.emit(ManagerEventTypes.Debug, `[PLAYER] Opened voice receiver for player ${this.guildId}`);
		this.manager.emit(ManagerEventTypes.VoiceReceiverConnect, this);
	}

	/**
	 * Handles a voice receiver message.
	 * @param {string} payload - The payload to handle.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver message is handled.
	 */
	private async onVoiceReceiverMessage(payload: string): Promise<void> {
		const packet = JSON.parse(payload) as VoiceReceiverEvent;
		if (!packet?.op) return;

		this.manager.emit(ManagerEventTypes.Debug, `VoiceReceiver recieved a payload: ${JSON.stringify(payload)}`);

		switch (packet.type) {
			case "startSpeakingEvent": {
				this.manager.emit(ManagerEventTypes.VoiceReceiverStartSpeaking, this, packet.data);
				break;
			}
			case "endSpeakingEvent": {
				const data = {
					...packet.data,
					data: Buffer.from(packet.data.data, "base64"),
				};

				this.manager.emit(ManagerEventTypes.VoiceReceiverEndSpeaking, this, data);
				break;
			}
			default: {
				this.manager.emit(ManagerEventTypes.Debug, `VoiceReceiver recieved an unknown payload: ${JSON.stringify(payload)}`);
				break;
			}
		}
	}

	/**
	 * Handles a voice receiver error.
	 * @param {Error} error - The error to handle.
	 * @returns {Promise<void>} - A promise that resolves when the voice receiver error is handled.
	 */
	private async onVoiceReceiverError(error: Error): Promise<void> {
		this.manager.emit(ManagerEventTypes.Debug, `VoiceReceiver error for player ${this.guildId}: ${error.message}`);
		this.manager.emit(ManagerEventTypes.VoiceReceiverError, this, error);
	}
}
