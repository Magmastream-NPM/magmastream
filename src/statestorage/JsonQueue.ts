import { Manager } from "../structures/Manager";
import { MagmaStreamErrorCode, ManagerEventTypes, PlayerStateEventTypes } from "../structures/Enums";
import { AnyUser, IQueue, PlayerStateUpdateEvent, Track } from "../structures/Types";
import path from "path";
import { promises as fs } from "fs";
import { JSONUtils } from "../structures/Utils";
import { MagmaStreamError } from "../structures/MagmastreamError";

/**
 * The player's queue, the `current` property is the currently playing track, think of the rest as the up-coming tracks.
 */
export class JsonQueue implements IQueue {
	/**
	 * The base path for the queue files.
	 */
	private basePath: string;

	/**
	 * @param guildId The guild ID.
	 * @param manager The manager.
	 */
	constructor(public readonly guildId: string, public readonly manager: Manager) {
		const base = manager.options.stateStorage?.jsonConfig?.path ?? path.join(process.cwd(), "magmastream", "sessionData", "players");

		this.basePath = path.join(base, this.guildId);
	}

	// #region Public
	/**
	 * @param track The track or tracks to add. Can be a single `Track` or an array of `Track`s.
	 * @param [offset=null] The position to add the track(s) at. If not provided, the track(s) will be added at the end of the queue.
	 */
	public async add(track: Track | Track[], offset?: number): Promise<void> {
		try {
			const isArray = Array.isArray(track);
			const inputTracks = isArray ? track : [track];
			const tracks = [...inputTracks];

			const queue = await this.getQueue();

			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

			// Set first track as current if none is active
			if (!(await this.getCurrent())) {
				const current = tracks.shift();
				if (current) {
					await this.setCurrent(current);
				}
			}

			if (typeof offset === "number" && !isNaN(offset)) {
				queue.splice(offset, 0, ...tracks);
			} else {
				queue.push(...tracks);
			}

			await this.setQueue(queue);

			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] Added ${tracks.length} track(s) to queue`);

			if (this.manager.players.has(this.guildId) && this.manager.players.get(this.guildId).isAutoplay) {
				if (!isArray) {
					const AutoplayUser = (await this.manager.players.get(this.guildId).get("Internal_AutoplayUser")) as AnyUser | null;
					if (AutoplayUser && AutoplayUser.id === track.requester.id) {
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

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					type: "queue",
					action: "add",
					tracks,
				},
			} as PlayerStateUpdateEvent);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to add tracks to JSON queue for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * @param track The track to add.
	 */
	public async addPrevious(track: Track | Track[]): Promise<void> {
		try {
			const max = this.manager.options.maxPreviousTracks;
			const tracks = Array.isArray(track) ? track : [track];
			if (!tracks.length) return;

			const current = await this.getPrevious();

			const newTracks = tracks.filter((t) => !current.some((p) => p.identifier === t.identifier));
			if (!newTracks.length) return;

			const updated = [...current, ...newTracks];

			const trimmed = updated.slice(-max);

			await this.writeJSON(this.previousPath, trimmed);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to add tracks to JSON queue for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * Clears the queue.
	 */
	public async clear(): Promise<void> {
		try {
			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;
			await this.deleteFile(this.queuePath);

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					type: "queue",
					action: "clear",
					tracks: [],
				},
			} as PlayerStateUpdateEvent);

			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] Cleared the queue for: ${this.guildId}`);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to clear JSON queue for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * Clears the previous tracks.
	 */
	public async clearPrevious(): Promise<void> {
		await this.deleteFile(this.previousPath);
	}

	/**
	 * Removes the first track from the queue.
	 */
	public async dequeue(): Promise<Track | undefined> {
		try {
			const queue = await this.getQueue();
			const track = queue.shift();
			await this.setQueue(queue);
			return track;
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to dequeue track for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * @returns The total duration of the queue.
	 */
	public async duration(): Promise<number> {
		try {
			const queue = await this.getQueue();
			const current = await this.getCurrent();
			const currentDuration = current?.duration || 0;

			const total = queue.reduce((acc, track) => acc + (track.duration || 0), currentDuration);
			return total;
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to get duration for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * Adds a track to the front of the queue.
	 */
	public async enqueueFront(track: Track | Track[]): Promise<void> {
		try {
			const tracks = Array.isArray(track) ? track : [track];
			const queue = await this.getQueue();
			await this.setQueue([...tracks.reverse(), ...queue]);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to enqueue front track for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * Tests whether all elements in the queue pass the test implemented by the provided function.
	 */
	public async everyAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		const queue = await this.getQueue();
		return queue.every(callback);
	}

	/**
	 * Filters the queue.
	 */
	public async filterAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track[]> {
		const queue = await this.getQueue();
		return queue.filter(callback);
	}

	/**
	 * Finds the first track in the queue that satisfies the provided testing function.
	 */
	public async findAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<Track | undefined> {
		const queue = await this.getQueue();
		return queue.find(callback);
	}

	/**
	 * @returns The current track.
	 */
	public async getCurrent(): Promise<Track | null> {
		return await this.readJSON<Track>(this.currentPath);
	}

	/**
	 * @returns The previous tracks.
	 */
	public async getPrevious(): Promise<Track[]> {
		const data = await this.readJSON<Track[]>(this.previousPath);
		return Array.isArray(data) ? data : [];
	}

	/**
	 * @returns The tracks in the queue from start to end.
	 */
	public async getSlice(start = 0, end = -1): Promise<Track[]> {
		const queue = await this.getQueue();
		if (end === -1) return queue.slice(start);
		return queue.slice(start, end);
	}

	/**
	 * @returns The tracks in the queue.
	 */
	public async getTracks(): Promise<Track[]> {
		return await this.getQueue();
	}

	/**
	 * Maps the queue to a new array.
	 */
	public async mapAsync<T>(callback: (track: Track, index: number, array: Track[]) => T): Promise<T[]> {
		const queue = await this.getQueue();
		return queue.map(callback);
	}

	/**
	 * Modifies the queue at the specified index.
	 */
	public async modifyAt(start: number, deleteCount = 0, ...items: Track[]): Promise<Track[]> {
		const queue = await this.getQueue();

		const removed = queue.splice(start, deleteCount, ...items);

		await this.setQueue(queue);
		return removed;
	}

	/**
	 * @returns The newest track.
	 */
	public async popPrevious(): Promise<Track | null> {
		try {
			const current = await this.getPrevious();
			if (!current.length) return null;

			const popped = current.pop()!;
			await this.writeJSON(this.previousPath, current);
			return popped;
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to pop previous track for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * Removes a track from the queue.
	 * @param position The position to remove the track at.
	 * @param end The end position to remove the track at.
	 */
	public async remove(position?: number): Promise<Track[]>;
	public async remove(start: number, end: number): Promise<Track[]>;
	public async remove(startOrPos = 0, end?: number): Promise<Track[]> {
		try {
			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

			const queue = await this.getQueue();
			let removed: Track[] = [];

			if (typeof end === "number") {
				if (startOrPos >= end || startOrPos >= queue.length) throw new RangeError("Invalid range.");
				removed = queue.splice(startOrPos, end - startOrPos);
			} else {
				removed = queue.splice(startOrPos, 1);
			}

			await this.setQueue(queue);

			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] Removed ${removed.length} track(s) from position ${startOrPos}${end ? ` to ${end}` : ""}`);
			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					type: "queue",
					action: "remove",
					tracks: removed,
				},
			} as PlayerStateUpdateEvent);

			return removed;
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to remove track for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * Shuffles the queue by round-robin.
	 */
	public async roundRobinShuffle(): Promise<void> {
		try {
			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

			const queue = await this.getQueue();

			const userMap = new Map<string, Track[]>();
			for (const track of queue) {
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

			await this.setQueue(shuffledQueue);

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					type: "queue",
					action: "roundRobin",
				},
			} as PlayerStateUpdateEvent);

			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] roundRobinShuffled the queue for: ${this.guildId}`);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to round robin shuffle queue for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * @param track The track to set.
	 */
	public async setCurrent(track: Track | null): Promise<void> {
		if (track) {
			await this.writeJSON(this.currentPath, track);
		} else {
			await this.deleteFile(this.currentPath);
		}
	}

	/**
	 * @param track The track to set.
	 */
	public async setPrevious(track: Track | Track[]): Promise<void> {
		const tracks = Array.isArray(track) ? track : [track];
		if (!tracks.length) return;

		await this.writeJSON(this.previousPath, tracks);
	}

	/**
	 * Shuffles the queue.
	 */
	public async shuffle(): Promise<void> {
		try {
			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

			const queue = await this.getQueue();
			for (let i = queue.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[queue[i], queue[j]] = [queue[j], queue[i]];
			}

			await this.setQueue(queue);

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					type: "queue",
					action: "shuffle",
				},
			} as PlayerStateUpdateEvent);

			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] Shuffled the queue for: ${this.guildId}`);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to shuffle queue for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}

	/**
	 * @returns The size of the queue.
	 */
	public async size(): Promise<number> {
		const queue = await this.getQueue();
		return queue.length;
	}

	/**
	 * Tests whether at least one element in the queue passes the test implemented by the provided function.
	 */
	public async someAsync(callback: (track: Track, index: number, array: Track[]) => boolean): Promise<boolean> {
		const queue = await this.getQueue();
		return queue.some(callback);
	}

	/**
	 * @returns The total size of the queue.
	 */
	public async totalSize(): Promise<number> {
		const size = await this.size();
		return (await this.getCurrent()) ? size + 1 : size;
	}

	/**
	 * Shuffles the queue by user.
	 */
	public async userBlockShuffle(): Promise<void> {
		try {
			const oldPlayer = this.manager.players.get(this.guildId) ? { ...this.manager.players.get(this.guildId) } : null;

			const queue = await this.getQueue();

			const userMap = new Map<string, Track[]>();
			for (const track of queue) {
				const userId = track.requester.id;
				if (!userMap.has(userId)) userMap.set(userId, []);
				userMap.get(userId)!.push(track);
			}

			const shuffledQueue: Track[] = [];
			while (shuffledQueue.length < queue.length) {
				for (const [, tracks] of userMap) {
					const track = tracks.shift();
					if (track) shuffledQueue.push(track);
				}
			}

			await this.setQueue(shuffledQueue);

			this.manager.emit(ManagerEventTypes.PlayerStateUpdate, oldPlayer, this.manager.players.get(this.guildId), {
				changeType: PlayerStateEventTypes.QueueChange,
				details: {
					type: "queue",
					action: "userBlock",
				},
			} as PlayerStateUpdateEvent);

			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] userBlockShuffled the queue for: ${this.guildId}`);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to user block shuffle queue for guild ${this.guildId}: ${(err as Error).message}`,
							cause: err,
					  });

			console.error(error);
		}
	}
	// #endregion Public
	// #region Private
	/**
	 * @returns The current path.
	 */
	private get currentPath(): string {
		return path.join(this.basePath, "current.json");
	}

	/**
	 * @param filePath The file path.
	 */
	private async deleteFile(filePath: string): Promise<void> {
		try {
			await fs.unlink(filePath);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to delete file: ${filePath}`,
							cause: err,
					  });

			console.error(error);
			this.manager.emit(ManagerEventTypes.Debug, `[JSONQUEUE] Failed to delete file: ${filePath}`);
		}
	}

	/**
	 * Ensures the directory exists.
	 */
	private async ensureDir(): Promise<void> {
		await fs.mkdir(this.basePath, { recursive: true });
	}

	/**
	 * @returns The queue.
	 */
	private async getQueue(): Promise<Track[]> {
		const data = await this.readJSON<Track[]>(this.queuePath);
		return Array.isArray(data) ? data : [];
	}

	/**
	 * @returns The previous path.
	 */
	private get previousPath(): string {
		return path.join(this.basePath, "previous.json");
	}

	/**
	 * @returns The queue path.
	 */
	private get queuePath(): string {
		return path.join(this.basePath, "queue.json");
	}

	/**
	 * @param filePath The file path.
	 * @returns The JSON data.
	 */
	private async readJSON<T>(filePath: string): Promise<T | null> {
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			return JSON.parse(raw);
		} catch (err) {
			const error =
				err instanceof MagmaStreamError
					? err
					: new MagmaStreamError({
							code: MagmaStreamErrorCode.QUEUE_JSON_ERROR,
							message: `Failed to read file: ${filePath}`,
							cause: err,
					  });

			console.error(error);
			return null;
		}
	}

	/**
	 * @param queue The queue.
	 */
	private async setQueue(queue: Track[]): Promise<void> {
		await this.deleteFile(this.queuePath);
		await this.writeJSON(this.queuePath, queue);
	}

	/**
	 * @param filePath The file path.
	 * @param data The data to write.
	 */
	private async writeJSON<T>(filePath: string, data: T): Promise<void> {
		await this.ensureDir();
		await fs.writeFile(filePath, JSONUtils.safe(data, 2), "utf-8");
	}
	// #endregion Private
	// #region Protected
	// #endregion Protected
}
