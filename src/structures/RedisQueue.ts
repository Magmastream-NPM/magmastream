import { Track } from "./Player";
import { Manager, ManagerEventTypes, PlayerStateEventTypes } from "./Manager";
import { ClientUser, User } from "discord.js";
import { Redis } from "ioredis";
import { IQueue } from "./Utils";
import { logExecutionTime } from "../utils/logExecutionTime";

export class RedisQueue implements IQueue {
	public current: Track | null = null;
	public previous: Track[] = [];

	private redis: Redis;
	private redisPrefix: string;

	constructor(public readonly guildId: string, public readonly manager: Manager) {
		this.redis = manager.redis;
		this.redisPrefix = manager.options.stateStorage.redisConfig.prefix?.endsWith(":")
			? manager.options.stateStorage.redisConfig.prefix
			: `${manager.options.stateStorage.redisConfig.prefix ?? "magmastream"}:`;
	}

	private get queueKey(): string {
		return `${this.redisPrefix}queue:${this.guildId}:tracks`;
	}

	private get currentKey(): string {
		return `${this.redisPrefix}queue:${this.guildId}:current`;
	}

	private get previousKey(): string {
		return `${this.redisPrefix}queue:${this.guildId}:previous`;
	}

	// Helper to serialize/deserialize Track
	private serialize(track: Track): string {
		return JSON.stringify(track);
	}

	private deserialize(data: string): Track {
		return JSON.parse(data) as Track;
	}

	async getCurrent(): Promise<Track | null> {
		return logExecutionTime("getCurrent (RedisQueue)", async () => {
			const raw = await this.redis.get(this.currentKey);
			return raw ? this.deserialize(raw) : null;
		});
	}

	async setCurrent(track: Track | null): Promise<void> {
		return logExecutionTime("setCurrent (RedisQueue)", async () => {
			if (track) {
				await this.redis.set(this.currentKey, this.serialize(track));
			} else {
				await this.redis.del(this.currentKey);
			}
		});
	}

	async getPrevious(): Promise<Track[]> {
		return logExecutionTime("getPrevious (RedisQueue)", async () => {
			const raw = await this.redis.lrange(this.previousKey, 0, -1);
			return raw.map(this.deserialize);
		});
	}
	public async addPrevious(track: Track | Track[]): Promise<void> {
		return logExecutionTime("addPrevious (RedisQueue)", async () => {
			const tracks = Array.isArray(track) ? track : [track];
			if (!tracks.length) return;
			const serialized = tracks.map(this.serialize);
			if (!serialized.length) return; // avoid lpush with no values

			await this.redis.lpush(this.previousKey, ...serialized.reverse());
		});
	}

	public async clearPrevious(): Promise<void> {
		return logExecutionTime("clearPrevious (RedisQueue)", async () => {
			await this.redis.del(this.previousKey);
		});
	}

	public async add(track: Track | Track[], offset?: number): Promise<void> {
		return logExecutionTime("add (RedisQueue)", async () => {
			const isArray = Array.isArray(track);
			const tracks = isArray ? track : [track];
			const serialized = tracks.map((t) => this.serialize(t));

			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

			// If there's no current track, pop one from the list
			if (!this.current) {
				const current = serialized.shift();
				if (current) {
					await this.redis.set(this.currentKey, current);
					this.current = this.deserialize(current);
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
					const botUser = (await this.manager.players.get(this.guildId).get("Internal_BotUser")) as User | ClientUser;
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

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					changeType: "add",
					tracks,
				},
			});
		});
	}

	public async remove(position?: number): Promise<Track[]>;
	public async remove(start: number, end: number): Promise<Track[]>;
	public async remove(startOrPos = 0, end?: number): Promise<Track[]> {
		return logExecutionTime("remove (RedisQueue)", async () => {
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
					changeType: "remove",
					tracks: deserialized,
				},
			});

			return deserialized;
		});
	}

	public async clear(): Promise<void> {
		return logExecutionTime("clear (RedisQueue)", async () => {
			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;
			await this.redis.del(this.queueKey);

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					changeType: "clear",
					tracks: [],
				},
			});

			this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Cleared the queue for: ${this.guildId}`);
		});
	}

	public async size(): Promise<number> {
		return logExecutionTime("size (RedisQueue)", async () => {
			return await this.redis.llen(this.queueKey);
		});
	}

	public async totalSize(): Promise<number> {
		return logExecutionTime("totalSize (RedisQueue)", async () => {
			const size = await this.size();
			return this.current ? size + 1 : size;
		});
	}

	public async duration(): Promise<number> {
		return logExecutionTime("duration (RedisQueue)", async () => {
			const tracks = await this.redis.lrange(this.queueKey, 0, -1);
			const currentDuration = this.current?.duration || 0;

			const total = tracks.reduce((acc, raw) => {
				try {
					const parsed = this.deserialize(raw);
					return acc + (parsed.duration || 0);
				} catch {
					return acc;
				}
			}, currentDuration);

			return total;
		});
	}

	public async shuffle(): Promise<void> {
		return logExecutionTime("shuffle (RedisQueue)", async () => {
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
				details: { changeType: "shuffle" },
			});

			this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] Shuffled the queue for: ${this.guildId}`);
		});
	}

	public async userBlockShuffle(): Promise<void> {
		return logExecutionTime("userBlockShuffle (RedisQueue)", async () => {
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
				details: { changeType: "userBlock" },
			});

			this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] userBlockShuffled the queue for: ${this.guildId}`);
		});
	}

	public async roundRobinShuffle(): Promise<void> {
		return logExecutionTime("roundRobinShuffle (RedisQueue)", async () => {
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
				details: { changeType: "roundRobin" },
			});

			this.manager.emit(ManagerEventTypes.Debug, `[QUEUE] roundRobinShuffled the queue for: ${this.guildId}`);
		});
	}

	public async dequeue(): Promise<Track | undefined> {
		return logExecutionTime("dequeue (RedisQueue)", async () => {
			const raw = await this.redis.lpop(this.queueKey);
			return raw ? this.deserialize(raw) : undefined;
		});
	}

	public async enqueueFront(track: Track | Track[]): Promise<void> {
		return logExecutionTime("enqueueFront (RedisQueue)", async () => {
			const serialized = Array.isArray(track) ? track.map(this.serialize) : [this.serialize(track)];

			// Redis: LPUSH adds to front, reverse to maintain order if multiple tracks
			await this.redis.lpush(this.queueKey, ...serialized.reverse());
		});
	}

	public async getTracks(): Promise<Track[]> {
		return logExecutionTime("getTracks (RedisQueue)", async () => {
			const raw = await this.redis.lrange(this.queueKey, 0, -1);
			return raw.map(this.deserialize);
		});
	}

	public async getSlice(start = 0, end = -1): Promise<Track[]> {
		return logExecutionTime("getSlice (RedisQueue)", async () => {
			const raw = await this.redis.lrange(this.queueKey, start, end === -1 ? -1 : end - 1);
			return raw.map(this.deserialize);
		});
	}

	public async modifyAt(start: number, deleteCount = 0, ...items: Track[]): Promise<Track[]> {
		return logExecutionTime("modifyAt (RedisQueue)", async () => {
			const queue = await this.redis.lrange(this.queueKey, 0, -1);

			const removed = queue.splice(start, deleteCount, ...items.map(this.serialize));

			await this.redis.del(this.queueKey);
			if (queue.length > 0) {
				await this.redis.rpush(this.queueKey, ...queue);
			}

			return removed.map(this.deserialize);
		});
	}

	public async mapAsync<T>(callback: (track: Track, index: number, array: Track[]) => T): Promise<T[]> {
		return logExecutionTime("mapAsync (RedisQueue)", async () => {
			const tracks = await this.getTracks(); // same as lrange + deserialize
			return tracks.map(callback);
		});
	}

	public async filterAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track[]> {
		return logExecutionTime("filterAsync (RedisQueue)", async () => {
			const tracks = await this.getTracks();
			return tracks.filter(callback);
		});
	}
	public async findAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track | undefined> {
		return logExecutionTime("findAsync (RedisQueue)", async () => {
			const tracks = await this.getTracks();
			return tracks.find(callback);
		});
	}
	public async someAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		return logExecutionTime("someAsync (RedisQueue)", async () => {
			const tracks = await this.getTracks();
			return tracks.some(callback);
		});
	}
	public async everyAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		return logExecutionTime("everyAsync (RedisQueue)", async () => {
			const tracks = await this.getTracks();
			return tracks.every(callback);
		});
	}
}
