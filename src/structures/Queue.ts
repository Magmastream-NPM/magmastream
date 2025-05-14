import { Track } from "./Player";
import { Manager, ManagerEventTypes, PlayerStateEventTypes } from "./Manager"; // Import Manager to access emit method
import { ClientUser, User } from "discord.js";
import { IQueue } from "./Utils";

/**
 * The player's queue, the `current` property is the currently playing track, think of the rest as the up-coming tracks.
 */
export class Queue extends Array<Track> implements IQueue {
	/** The current track */
	public current: Track | null = null;

	/** The previous tracks */
	public previous: Track[] = [];

	/** The Manager instance. */
	public manager: Manager;

	/** The guild ID property. */
	guildId: string;

	/**
	 * Constructs a new Queue.
	 * @param guildId The guild ID.
	 * @param manager The Manager instance.
	 */
	constructor(guildId: string, manager: Manager) {
		super();
		/** The Manager instance. */
		this.manager = manager;
		/** The guild property. */
		this.guildId = guildId;
	}

	async getCurrent(): Promise<Track | null> {
		return this.current;
	}

	async setCurrent(track: Track | null): Promise<void> {
		this.current = track;
	}

	async getPrevious(): Promise<Track[]> {
		return this.previous;
	}

	public async addPrevious(track: Track | Track[]): Promise<void> {
		if (Array.isArray(track)) {
			this.previous.unshift(...track);
		} else {
			this.previous.unshift(track);
		}
	}

	public async clearPrevious(): Promise<void> {
		this.previous = [];
	}

	/**
	 * The total duration of the queue in milliseconds.
	 * This includes the duration of the currently playing track.
	 */
	public async duration(): Promise<number> {
		const current = this.current?.duration ?? 0;
		return this.reduce((acc, cur) => acc + (cur.duration || 0), current);
	}

	/**
	 * The total size of tracks in the queue including the current track.
	 * This includes the current track if it is not null.
	 * @returns The total size of tracks in the queue including the current track.
	 */
	public async totalSize(): Promise<number> {
		return this.length + (this.current ? 1 : 0);
	}

	/**
	 * The size of tracks in the queue.
	 * This does not include the currently playing track.
	 * @returns The size of tracks in the queue.
	 */
	public async size(): Promise<number> {
		return this.length;
	}

	/**
	 * Adds a track to the queue.
	 * @param track The track or tracks to add. Can be a single `Track` or an array of `Track`s.
	 * @param [offset=null] The position to add the track(s) at. If not provided, the track(s) will be added at the end of the queue.
	 */
	public async add(track: Track | Track[], offset?: number): Promise<void> {
		// Get the track info as a string
		const trackInfo = Array.isArray(track) ? track.map((t) => JSON.stringify(t, null, 2)).join(", ") : JSON.stringify(track, null, 2);

		// Emit a debug message
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Added ${Array.isArray(track) ? track.length : 1} track(s) to queue: ${trackInfo}`);

		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// If the queue is empty, set the track as the current track
		if (!this.current) {
			if (Array.isArray(track)) {
				this.current = (track.shift() as Track) || null;
				this.push(...track);
			} else {
				this.current = track;
			}
		} else {
			// If an offset is provided, add the track(s) at that position
			if (typeof offset !== "undefined" && typeof offset === "number") {
				// Validate the offset
				if (isNaN(offset)) {
					throw new RangeError("Offset must be a number.");
				}

				// Make sure the offset is between 0 and the length of the queue
				if (offset < 0 || offset > this.length) {
					throw new RangeError(`Offset must be between 0 and ${this.length}.`);
				}

				// Add the track(s) at the offset position
				if (Array.isArray(track)) {
					this.splice(offset, 0, ...track);
				} else {
					this.splice(offset, 0, track);
				}
			} else {
				// If no offset is provided, add the track(s) at the end of the queue
				if (Array.isArray(track)) {
					this.push(...track);
				} else {
					this.push(track);
				}
			}
		}

		if (this.manager.players.has(this.guildId) && this.manager.players.get(this.guildId).isAutoplay) {
			if (!Array.isArray(track)) {
				const botUser = this.manager.players.get(this.guildId).get("Internal_BotUser") as User | ClientUser;
				if (botUser && botUser.id === track.requester.id) {
					this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
						changeType: PlayerStateEventTypes.QueueChange,
						details: {
							changeType: "autoPlayAdd",
							tracks: Array.isArray(track) ? track : [track],
						},
					});

					return;
				}
			}
		}
		// Emit a player state update event with the added track(s)
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "add",
				tracks: Array.isArray(track) ? track : [track],
			},
		});
	}

	/**
	 * Removes track(s) from the queue.
	 * @param startOrPosition If a single number is provided, it will be treated as the position of the track to remove.
	 *                         If two numbers are provided, they will be used as the start and end of a range of tracks to remove.
	 * @param end Optional, end of the range of tracks to remove.
	 * @returns The removed track(s).
	 */
	public async remove(position?: number): Promise<Track[]>;
	public async remove(start: number, end: number): Promise<Track[]>;
	public async remove(startOrPosition = 0, end?: number): Promise<Track[]> {
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		if (typeof end !== "undefined") {
			// Validate input for `start` and `end`
			if (isNaN(Number(startOrPosition)) || isNaN(Number(end))) {
				throw new RangeError(`Invalid "start" or "end" parameter: start = ${startOrPosition}, end = ${end}`);
			}

			if (startOrPosition >= end || startOrPosition >= this.length) {
				throw new RangeError("Invalid range: start should be less than end and within queue length.");
			}

			const removedTracks = this.splice(startOrPosition, end - startOrPosition);
			this.manager.emit(
				ManagerEventTypes.Debug,
				`[QUEUE] Removed ${removedTracks.length} track(s) from player: ${this.guildId} from position ${startOrPosition} to ${end}.`
			);

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					changeType: "remove",
					tracks: removedTracks,
				},
			});

			return removedTracks;
		}

		// Single item removal when no end specified
		const removedTrack = this.splice(startOrPosition, 1);
		this.manager.emit(
			ManagerEventTypes.Debug,
			`[QUEUE] Removed 1 track from player: ${this.guildId} from position ${startOrPosition}: ${JSON.stringify(removedTrack[0], null, 2)}`
		);

		// Ensure removedTrack is an array for consistency
		const tracksToEmit = removedTrack.length > 0 ? removedTrack : [];

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "remove",
				tracks: tracksToEmit,
			},
		});

		return removedTrack;
	}

	/**
	 * Clears the queue.
	 * This will remove all tracks from the queue and emit a state update event.
	 */
	public async clear(): Promise<void> {
		// Capture the current state of the player for event emission.
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// Remove all items from the queue.
		this.splice(0);

		// Emit an event to update the player state indicating the queue has been cleared.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "clear",
				tracks: [], // No tracks are left after clearing
			},
		});

		// Emit a debug message indicating the queue has been cleared for a specific guild ID.
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Cleared the queue for: ${this.guildId}`);
	}

	/**
	 * Shuffles the queue.
	 * This will randomize the order of the tracks in the queue and emit a state update event.
	 */
	public async shuffle(): Promise<void> {
		// Capture the current state of the player for event emission.
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// Shuffle the queue.
		for (let i = this.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this[i], this[j]] = [this[j], this[i]];
		}

		// Emit an event to update the player state indicating the queue has been shuffled.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "shuffle",
			},
		});

		// Emit a debug message indicating the queue has been shuffled for a specific guild ID.
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Shuffled the queue for: ${this.guildId}`);
	}

	/**
	 * Shuffles the queue to play tracks requested by each user one block at a time.
	 */
	public async userBlockShuffle(): Promise<void> {
		// Capture the current state of the player for event emission.
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// Group the tracks in the queue by the user that requested them.
		const userTracks = new Map<string, Array<Track>>();
		this.forEach((track) => {
			const user = track.requester.id;

			if (!userTracks.has(user)) {
				userTracks.set(user, []);
			}

			userTracks.get(user).push(track);
		});

		// Create a new array for the shuffled queue.
		const shuffledQueue: Array<Track> = [];

		// Iterate over the user tracks and add one track from each user to the shuffled queue.
		// This will ensure that all the tracks requested by each user are played in a block order.
		while (shuffledQueue.length < this.length) {
			userTracks.forEach((tracks) => {
				const track = tracks.shift();
				if (track) {
					shuffledQueue.push(track);
				}
			});
		}

		// Clear the queue and add the shuffled tracks.
		this.splice(0);
		this.add(shuffledQueue);

		// Emit an event to update the player state indicating the queue has been shuffled.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "userBlock",
			},
		});

		// Emit a debug message indicating the queue has been shuffled for a specific guild ID.
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] userBlockShuffled the queue for: ${this.guildId}`);
	}

	/**
	 * Shuffles the queue to play tracks requested by each user one by one.
	 */
	public async roundRobinShuffle() {
		// Capture the current state of the player for event emission.
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// Group the tracks in the queue by the user that requested them.
		const userTracks = new Map<string, Array<Track>>();

		// Group the tracks in the queue by the user that requested them.
		this.forEach((track) => {
			const user = track.requester.id;

			if (!userTracks.has(user)) {
				userTracks.set(user, []);
			}

			userTracks.get(user).push(track);
		});

		// Shuffle the tracks of each user.
		userTracks.forEach((tracks) => {
			for (let i = tracks.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[tracks[i], tracks[j]] = [tracks[j], tracks[i]];
			}
		});

		// Create a new array for the shuffled queue.
		const shuffledQueue: Array<Track> = [];

		// Add the shuffled tracks to the queue in a round-robin fashion.
		const users = Array.from(userTracks.keys());
		const userQueues = users.map((user) => userTracks.get(user)!);
		const userCount = users.length;

		while (userQueues.some((queue) => queue.length > 0)) {
			for (let i = 0; i < userCount; i++) {
				const queue = userQueues[i];
				if (queue.length > 0) {
					shuffledQueue.push(queue.shift()!);
				}
			}
		}

		// Clear the queue and add the shuffled tracks.
		this.splice(0);
		this.add(shuffledQueue);

		// Emit an event to update the player state indicating the queue has been shuffled.
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				changeType: "roundRobin",
			},
		});

		// Emit a debug message indicating the queue has been shuffled for a specific guild ID.
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] roundRobinShuffled the queue for: ${this.guildId}`);
	}

	public async dequeue(): Promise<Track | undefined> {
		return super.shift();
	}

	public async enqueueFront(track: Track | Track[]): Promise<void> {
		if (Array.isArray(track)) {
			this.unshift(...track);
		} else {
			this.unshift(track);
		}
	}

	public async getTracks(): Promise<Track[]> {
		return [...this]; // clone to avoid direct mutation
	}

	public async getSlice(start?: number, end?: number): Promise<Track[]> {
		return this.slice(start, end); // Native sync method, still wrapped in a Promise
	}

	public async modifyAt(start: number, deleteCount = 0, ...items: Track[]): Promise<Track[]> {
		return super.splice(start, deleteCount, ...items);
	}

	public async mapAsync<T>(callback: (track: Track, index: number, array: Track[]) => T): Promise<T[]> {
		return this.map(callback);
	}

	public async filterAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track[]> {
		return this.filter(callback);
	}

	public async findAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track | undefined> {
		return this.find(callback);
	}

	public async someAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		return this.some(callback);
	}

	public async everyAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		return this.every(callback);
	}
}
