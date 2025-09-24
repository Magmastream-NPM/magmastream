import { Manager } from "../structures/Manager";
import { Redis } from "ioredis";
import { ManagerEventTypes, PlayerStateEventTypes } from "../structures/Enums";
import { IQueue, PlayerStateUpdateEvent, PortableUser, Track } from "../structures/Types";
import { JSONUtils } from "../structures/Utils";

/**
 * The player's queue, the `current` property is the currently playing track, think of the rest as the up-coming tracks.
 */
export class RedisQueue implements IQueue {
	/**
	 * The prefix for the Redis keys.
	 */
	public redisPrefix: string;
	/**
	 * The Redis instance.
	 */
	private redis: Redis;

	/**
	 * Constructs a new RedisQueue.
	 * @param guildId The guild ID.
	 * @param manager The Manager instance.
	 */
	constructor(public readonly guildId: string, public readonly manager: Manager) {
		this.redis = manager.redis;
		this.redisPrefix = manager.options.stateStorage.redisConfig.prefix?.endsWith(":")
			? manager.options.stateStorage.redisConfig.prefix
			: `${manager.options.stateStorage.redisConfig.prefix ?? "magmastream"}:`;
	}

	// #region Public
	/**
	 * Adds a track or tracks to the queue.
	 * @param track The track or tracks to add. Can be a single `Track` or an array of `Track`s.
	 * @param [offset=null] The position to add the track(s) at. If not provided, the track(s) will be added at the end of the queue.
	 */
	public async add(track: Track | Track[], offset?: number): Promise<void> {
		const isArray = Array.isArray(track);
		const tracks = isArray ? track : [track];
		const serialized = tracks.map((t) => this.serialize(t));

		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		// If there's no current track, pop one from the list
		if (!(await this.getCurrent())) {
			const current = serialized.shift();
			if (current) {
				await this.setCurrent(this.deserialize(current));
			}
		}

		if (typeof offset === "number" && !isNaN(offset)) {
			const queue = await this.redis.lrange(this.queueKey, 0, -1);
			queue.splice(offset, 0, ...serialized);
			await this.redis.del(this.queueKey);
			if (queue.length > 0) {
				await this.redis.rpush(this.queueKey, ...queue);
			}
		} else if (serialized.length > 0) {
			await this.redis.rpush(this.queueKey, ...serialized);
		}

		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Added ${tracks.length} track(s) to queue`);

		if (this.manager.players.has(this.guildId) && this.manager.players.get(this.guildId).isAutoplay) {
			if (!Array.isArray(track)) {
				const AutoplayUser = (await this.manager.players.get(this.guildId).get("Internal_AutoplayUser")) as PortableUser | null;
				if (AutoplayUser && AutoplayUser.id === track.requester.id) {
					this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
						changeType: PlayerStateEventTypes.QueueChange,
						details: {
							type: "queue",
							action: "autoPlayAdd",
							tracks: Array.isArray(track) ? track : [track],
						},
					} as PlayerStateUpdateEvent);

					return;
				}
			}
		}

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "add",
				tracks,
			},
		} as PlayerStateUpdateEvent);
	}

	/**
	 * Adds a track or tracks to the previous tracks.
	 * @param track The track or tracks to add.
	 */
	public async addPrevious(track: Track | Track[]): Promise<void> {
		const tracks = Array.isArray(track) ? track : [track];

		if (!tracks.length) return;

		const serialized = tracks.map(this.serialize);

		if (!serialized.length) return;

		await this.redis.lpush(this.previousKey, ...serialized.reverse());
	}

	/**
	 * Clears the queue.
	 */
	public async clear(): Promise<void> {
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;
		await this.redis.del(this.queueKey);

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "clear",
				tracks: [],
			},
		} as PlayerStateUpdateEvent);

		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Cleared the queue for: ${this.guildId}`);
	}

	/**
	 * Clears the previous tracks.
	 */
	public async clearPrevious(): Promise<void> {
		await this.redis.del(this.previousKey);
	}

	/**
	 * Removes the first track from the queue.
	 */
	public async dequeue(): Promise<Track | undefined> {
		const raw = await this.redis.lpop(this.queueKey);
		return raw ? this.deserialize(raw) : undefined;
	}

	/**
	 * @returns The total duration of the queue in milliseconds.
	 * This includes the duration of the currently playing track.
	 */
	public async duration(): Promise<number> {
		const tracks = await this.redis.lrange(this.queueKey, 0, -1);
		const currentDuration = (await this.getCurrent())?.duration || 0;

		const total = tracks.reduce((acc, raw) => {
			try {
				const parsed = this.deserialize(raw);
				return acc + (parsed.duration || 0);
			} catch {
				return acc;
			}
		}, currentDuration);

		return total;
	}

	/**
	 * Adds a track to the front of the queue.
	 * @param track The track or tracks to add.
	 */
	public async enqueueFront(track: Track | Track[]): Promise<void> {
		const serialized = Array.isArray(track) ? track.map(this.serialize) : [this.serialize(track)];

		// Redis: LPUSH adds to front, reverse to maintain order if multiple tracks
		await this.redis.lpush(this.queueKey, ...serialized.reverse());
	}

	/**
	 * Whether all tracks in the queue match the specified condition.
	 * @param callback The condition to match.
	 * @returns Whether all tracks in the queue match the specified condition.
	 */
	public async everyAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		const tracks = await this.getTracks();
		return tracks.every(callback);
	}

	/**
	 * Filters the tracks in the queue.
	 * @param callback The condition to match.
	 * @returns The tracks that match the condition.
	 */
	public async filterAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track[]> {
		const tracks = await this.getTracks();
		return tracks.filter(callback);
	}

	/**
	 * Finds the first track in the queue that matches the specified condition.
	 * @param callback The condition to match.
	 * @returns The first track that matches the condition.
	 */
	public async findAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track | undefined> {
		const tracks = await this.getTracks();
		return tracks.find(callback);
	}

	/**
	 * @returns The current track.
	 */
	public async getCurrent(): Promise<Track | null> {
		const raw = await this.redis.get(this.currentKey);
		return raw ? this.deserialize(raw) : null;
	}

	/**
	 * @returns The previous tracks.
	 */
	public async getPrevious(): Promise<Track[]> {
		const raw = await this.redis.lrange(this.previousKey, 0, -1);

		return raw.map(this.deserialize);
	}

	/**
	 * @returns The tracks in the queue from the start to the end.
	 */
	public async getSlice(start = 0, end = -1): Promise<Track[]> {
		const raw = await this.redis.lrange(this.queueKey, start, end === -1 ? -1 : end - 1);
		return raw.map(this.deserialize);
	}

	/**
	 * @returns The tracks in the queue.
	 */
	public async getTracks(): Promise<Track[]> {
		const raw = await this.redis.lrange(this.queueKey, 0, -1);
		return raw.map(this.deserialize);
	}

	/**
	 * Maps the tracks in the queue.
	 * @returns The tracks in the queue after the specified index.
	 */
	public async mapAsync<T>(callback: (track: Track, index: number, array: Track[]) => T): Promise<T[]> {
		const tracks = await this.getTracks(); // same as lrange + deserialize
		return tracks.map(callback);
	}

	/**
	 * Modifies the queue at the specified index.
	 * @param start The start index.
	 * @param deleteCount The number of tracks to delete.
	 * @param items The tracks to insert.
	 * @returns The removed tracks.
	 */
	public async modifyAt(start: number, deleteCount = 0, ...items: Track[]): Promise<Track[]> {
		const queue = await this.redis.lrange(this.queueKey, 0, -1);

		const removed = queue.splice(start, deleteCount, ...items.map(this.serialize));

		await this.redis.del(this.queueKey);
		if (queue.length > 0) {
			await this.redis.rpush(this.queueKey, ...queue);
		}

		return removed.map(this.deserialize);
	}

	/**
	 * Removes the newest track.
	 * @returns The newest track.
	 */
	public async popPrevious(): Promise<Track | null> {
		const raw = await this.redis.lpop(this.previousKey); // get newest track (index 0)
		return raw ? this.deserialize(raw) : null;
	}

	/**
	 * Removes the track at the specified index.
	 * @param position The position to remove the track at.
	 * @param end The end position to remove the track at.
	 */
	public async remove(position?: number): Promise<Track[]>;
	public async remove(start: number, end: number): Promise<Track[]>;
	public async remove(startOrPos = 0, end?: number): Promise<Track[]> {
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		const queue = await this.redis.lrange(this.queueKey, 0, -1);

		let removed: string[] = [];

		if (typeof end === "number") {
			if (startOrPos >= end || startOrPos >= queue.length) {
				throw new RangeError("Invalid range.");
			}
			removed = queue.slice(startOrPos, end);
			queue.splice(startOrPos, end - startOrPos);
		} else {
			removed = queue.splice(startOrPos, 1);
		}

		await this.redis.del(this.queueKey);
		if (queue.length > 0) {
			await this.redis.rpush(this.queueKey, ...queue);
		}

		const deserialized = removed.map(this.deserialize);

		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Removed ${removed.length} track(s) from position ${startOrPos}${end ? ` to ${end}` : ""}`);

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "remove",
				tracks: deserialized,
			},
		} as PlayerStateUpdateEvent);

		return deserialized;
	}

	/**
	 * Shuffles the queue round-robin style.
	 */
	public async roundRobinShuffle(): Promise<void> {
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		const rawTracks = await this.redis.lrange(this.queueKey, 0, -1);
		const deserialized = rawTracks.map(this.deserialize);

		const userMap = new Map<string, Track[]>();
		for (const track of deserialized) {
			const userId = track.requester.id;
			if (!userMap.has(userId)) userMap.set(userId, []);
			userMap.get(userId)!.push(track);
		}

		// Shuffle each user's tracks
		for (const tracks of userMap.values()) {
			for (let i = tracks.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[tracks[i], tracks[j]] = [tracks[j], tracks[i]];
			}
		}

		const users = [...userMap.keys()];
		const queues = users.map((id) => userMap.get(id)!);
		const shuffledQueue: Track[] = [];

		while (queues.some((q) => q.length > 0)) {
			for (const q of queues) {
				const track = q.shift();
				if (track) shuffledQueue.push(track);
			}
		}

		await this.redis.del(this.queueKey);
		await this.redis.rpush(this.queueKey, ...shuffledQueue.map(this.serialize));

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "roundRobin",
			},
		} as PlayerStateUpdateEvent);

		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] roundRobinShuffled the queue for: ${this.guildId}`);
	}

	/**
	 * Sets the current track.
	 * @param track The track to set.
	 */
	public async setCurrent(track: Track | null): Promise<void> {
		if (track) {
			await this.redis.set(this.currentKey, this.serialize(track));
		} else {
			await this.redis.del(this.currentKey);
		}
	}

	/**
	 * Sets the previous track(s).
	 * @param track The track to set.
	 */
	public async setPrevious(track: Track | Track[]): Promise<void> {
		const tracks = Array.isArray(track) ? track : [track];

		if (!tracks.length) return;

		await this.redis.del(this.previousKey);
		await this.redis.rpush(this.previousKey, ...tracks.map(this.serialize));
	}

	/**
	 * Shuffles the queue.
	 */
	public async shuffle(): Promise<void> {
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		const queue = await this.redis.lrange(this.queueKey, 0, -1);
		for (let i = queue.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[queue[i], queue[j]] = [queue[j], queue[i]];
		}

		await this.redis.del(this.queueKey);
		if (queue.length > 0) {
			await this.redis.rpush(this.queueKey, ...queue);
		}

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "shuffle",
			},
		} as PlayerStateUpdateEvent);

		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Shuffled the queue for: ${this.guildId}`);
	}

	/**
	 * @returns The size of the queue.
	 */
	public async size(): Promise<number> {
		return await this.redis.llen(this.queueKey);
	}

	/**
	 * @returns Whether any tracks in the queue match the specified condition.
	 */
	public async someAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		const tracks = await this.getTracks();
		return tracks.some(callback);
	}

	/**
	 * @returns The total size of tracks in the queue including the current track.
	 */
	public async totalSize(): Promise<number> {
		const size = await this.size();
		return (await this.getCurrent()) ? size + 1 : size;
	}

	/**
	 * Shuffles the queue, but keeps the tracks of the same user together.
	 */
	public async userBlockShuffle(): Promise<void> {
		const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

		const rawTracks = await this.redis.lrange(this.queueKey, 0, -1);
		const deserialized = rawTracks.map(this.deserialize);

		const userMap = new Map<string, Track[]>();
		for (const track of deserialized) {
			const userId = track.requester.id;
			if (!userMap.has(userId)) userMap.set(userId, []);
			userMap.get(userId)!.push(track);
		}

		const shuffledQueue: Track[] = [];
		while (shuffledQueue.length < deserialized.length) {
			for (const [, tracks] of userMap) {
				const track = tracks.shift();
				if (track) shuffledQueue.push(track);
			}
		}

		await this.redis.del(this.queueKey);
		await this.redis.rpush(this.queueKey, ...shuffledQueue.map(this.serialize));

		this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
			changeType: PlayerStateEventTypes.QueueChange,
			details: {
				type: "queue",
				action: "userBlock",
			},
		} as PlayerStateUpdateEvent);

		this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] userBlockShuffled the queue for: ${this.guildId}`);
	}
	// #endregion Public
	// #region Private
	/**
	 * @returns The current key.
	 */
	private get currentKey(): string {
		return `${this.redisPrefix}queue:${this.guildId}:current`;
	}

	/**
	 * Deserializes a track from a string.
	 */
	private deserialize(data: string): Track {
		return JSON.parse(data) as Track;
	}

	/**
	 * @returns The previous key.
	 */
	private get previousKey(): string {
		return `${this.redisPrefix}queue:${this.guildId}:previous`;
	}

	/**
	 * @returns The queue key.
	 */
	private get queueKey(): string {
		return `${this.redisPrefix}queue:${this.guildId}:tracks`;
	}

	/**
	 * Helper to serialize/deserialize Track
	 */
	private serialize(track: Track): string {
		return JSONUtils.safe(track, 2);
	}
	// #endregion Private
	// #region Protected
	// #endregion Protected
}
