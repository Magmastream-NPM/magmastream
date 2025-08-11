import { Manager } from "../structures/Manager"; // Import Manager to access emit method
import { ClientUser, User } from "discord.js";
import { ManagerEventTypes, PlayerStateEventTypes } from "../structures/Enums";
import { IQueue, PlayerStateUpdateEvent, Track } from "../structures/Types";

/**
 * The player's queue, the `current` property is the currently playing track, think of the rest as the up-coming tracks.
 */
export class MemoryQueue extends Array<Track> implements IQueue {
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

	/**
	 * @returns The current track.
	 */
	async getCurrent(): Promise<Track | null> {
		return this.current;
	}

	/**
	 * @param track The track to set.
	 */
	async setCurrent(track: Track | null): Promise<void> {
		this.current = track;
	}

	/**
	 * @returns The previous tracks.
	 */
	async getPrevious(): Promise<Track[]> {
		return [...this.previous];
	}

	public async addPrevious(track: Track | Track[]): Promise<void> {
		if (Array.isArray(track)) {
			const newTracks = track.filter((t) => !this.previous.some((p) => p.identifier === t.identifier));
			this.previous.unshift(...newTracks);
		} else {
			const exists = this.previous.some((p) => p.identifier === track.identifier);
			if (!exists) {
				this.previous.unshift(track);
			}
		}
	}

	/**
	 * @param tracks The tracks to set.
	 */
	public async setPrevious(tracks: Track[]): Promise<void> {
		this.previous = [...tracks];
	}

	/**
	 * @returns The newest track.
	 */
	public async popPrevious(): Promise<Track | null> {
		return this.previous.shift() || null; // get newest track
	}

	/**
	 * Clears the previous tracks.
	 */
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
		const isArray = Array.isArray(track);
		const tracks = isArray ? [...track] : [track];

		// Get the track info as a string
		const trackInfo = isArray ? tracks.map((t) => JSON.stringify(t, null, 2)).join(", ") : JSON.stringify(track, null, 2);

		// Emit a debug message
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Added ${tracks.length} track(s) to queue: ${trackInfo}`);

		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// If the queue is empty, set the track as the current track
		if (!this.current) {
			if (isArray) {
				this.current = (tracks.shift() as Track) || null;
				this.push(...tracks);
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
				if (isArray) {
					this.splice(offset, 0, ...tracks);
				} else {
					this.splice(offset, 0, track);
				}
			} else {
				// If no offset is provided, add the track(s) at the end of the queue
				if (isArray) {
					this.push(...tracks);
				} else {
					this.push(track);
				}
			}
		}

		if (this.manager.players.has(this.guildId) && this.manager.players.get(this.guildId).isAutoplay) {
			if (!isArray) {
				const botUser = this.manager.players.get(this.guildId).get("Internal_BotUser") as User | ClientUser;
				if (botUser && botUser.id === track.requester.id) {
					this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
						changeType: PlayerStateEventTypes.QueueChange,
						details: {
							type: "queue",
							action: "autoPlayAdd",
							tracks: [track],
						},
					} as PlayerStateUpdateEvent);

					return;
				}
			}
		}
		// Emit a player state update event with the added track(s)
		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "add",
				tracks: isArray ? tracks : [track],
			},
		} as PlayerStateUpdateEvent);
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
					type: "queue",
					action: "remove",
					tracks: removedTracks,
				},
			} as PlayerStateUpdateEvent);

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
				type: "queue",
				action: "remove",
				tracks: tracksToEmit,
			},
		} as PlayerStateUpdateEvent);

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
				type: "queue",
				action: "clear",
				tracks: [], // No tracks are left after clearing
			},
		} as PlayerStateUpdateEvent);

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
				type: "queue",
				action: "shuffle",
			},
		} as PlayerStateUpdateEvent);

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
				type: "queue",
				action: "userBlock",
			},
		} as PlayerStateUpdateEvent);

		// Emit a debug message indicating the queue has been shuffled for a specific guild ID.
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] userBlockShuffled the queue for: ${this.guildId}`);
	}

	/**
	 * Shuffles the queue to play tracks requested by each user one by one.
	 */
	public async roundRobinShuffle(): Promise<void> {
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
				type: "queue",
				action: "roundRobin",
			},
		} as PlayerStateUpdateEvent);

		// Emit a debug message indicating the queue has been shuffled for a specific guild ID.
		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] roundRobinShuffled the queue for: ${this.guildId}`);
	}

	/**
	 * Removes the first element from the queue.
	 */
	public async dequeue(): Promise<Track | undefined> {
		return super.shift();
	}

	/**
	 * Adds the specified track or tracks to the front of the queue.
	 * @param track The track or tracks to add.
	 */
	public async enqueueFront(track: Track | Track[]): Promise<void> {
		if (Array.isArray(track)) {
			this.unshift(...track);
		} else {
			this.unshift(track);
		}
	}

	/**
	 * @returns A shallow copy of the queue.
	 */
	public async getTracks(): Promise<Track[]> {
		return [...this]; // clone to avoid direct mutation
	}

	/**
	 * @returns A shallow copy of the queue.
	 */
	public async getSlice(start?: number, end?: number): Promise<Track[]> {
		return this.slice(start, end); // Native sync method, still wrapped in a Promise
	}

	/**
	 * Modifies the queue at the specified index.
	 * @param start The index at which to start modifying the queue.
	 * @param deleteCount The number of elements to remove from the queue.
	 * @param items The elements to add to the queue.
	 * @returns The modified queue.
	 */
	public async modifyAt(start: number, deleteCount = 0, ...items: Track[]): Promise<Track[]> {
		return super.splice(start, deleteCount, ...items);
	}

	/**
	 * @returns A new array with the results of calling a provided function on every element in the queue.
	 */
	public async mapAsync<T>(callback: (track: Track, index: number, array: Track[]) => T): Promise<T[]> {
		return this.map(callback);
	}

	/**
	 * @returns A new array with all elements that pass the test implemented by the provided function.
	 */
	public async filterAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track[]> {
		return this.filter(callback);
	}

	/**
	 * @returns The first element in the queue that satisfies the provided testing function.
	 */
	public async findAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track | undefined> {
		return this.find(callback);
	}

	/**
	 * @returns Whether at least one element in the queue satisfies the provided testing function.
	 */
	public async someAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		return this.some(callback);
	}

	/**
	 * @returns Whether all elements in the queue satisfy the provided testing function.
	 */
	public async everyAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		return this.every(callback);
	}
}
