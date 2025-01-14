import { Track, UnresolvedTrack } from "./Player";
import { TrackUtils } from "./Utils";
import { Manager, PlayerStateEventTypes } from "./Manager"; // Import Manager to access emit method

/**
 * The player's queue, the `current` property is the currently playing track, think of the rest as the up-coming tracks.
 */
export class Queue extends Array<Track | UnresolvedTrack> {
	/** The total duration of the queue. */
	public get duration(): number {
		const current = this.current?.duration ?? 0;
		return this.reduce((acc, cur) => acc + (cur.duration || 0), current);
	}

	/** The total size of tracks in the queue including the current track. */
	public get totalSize(): number {
		return this.length + (this.current ? 1 : 0);
	}

	/** The size of tracks in the queue. */
	public get size(): number {
		return this.length;
	}

	/** The current track */
	public current: Track | UnresolvedTrack | null = null;

	/** The previous track */
	public previous: Track | UnresolvedTrack | null = null;

	/** The Manager instance. */
	public manager: Manager;

	/** The guild property. */
	guild: string;

	constructor(guild: string, manager: Manager) {
		super();
		this.manager = manager; // Initialize the manager
		this.guild = guild; // Initialize the guild property
	}

	/**
	 * Adds a track to the queue.
	 * @param track
	 * @param [offset=null]
	 */
	public add(track: (Track | UnresolvedTrack) | (Track | UnresolvedTrack)[], offset?: number): void {
		const trackInfo = Array.isArray(track) ? track.map((t) => JSON.stringify(t, null, 2)).join(", ") : JSON.stringify(track, null, 2);
		this.manager.emit("debug", `[QUEUE] Added ${Array.isArray(track) ? track.length : 1} track(s) to queue: ${trackInfo}`);

		const oldPlayer = this.manager.players.get(this.guild) ? { ...this.manager.players.get(this.guild) } : null;
		if (!TrackUtils.validate(track)) {
			throw new RangeError('Track must be a "Track" or "Track[]".');
		}

		if (!this.current) {
			if (Array.isArray(track)) {
				this.current = track.shift() || null;
				this.push(...track);
			} else {
				this.current = track;
			}
		} else {
			if (typeof offset !== "undefined" && typeof offset === "number") {
				if (isNaN(offset)) {
					throw new RangeError("Offset must be a number.");
				}

				if (offset < 0 || offset > this.length) {
					throw new RangeError(`Offset must be between 0 and ${this.length}.`);
				}

				if (Array.isArray(track)) {
					this.splice(offset, 0, ...track);
				} else {
					this.splice(offset, 0, track);
				}
			} else {
				if (Array.isArray(track)) {
					this.push(...track);
				} else {
					this.push(track);
				}
			}
		}

		this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "add",
				tracks: Array.isArray(track) ? track : [track],
			},
		});
	}

	/**
	 * Removes a track from the queue. Defaults to the first track, returning the removed track, EXCLUDING THE `current` TRACK.
	 * @param [position=0]
	 */
	public remove(position?: number): (Track | UnresolvedTrack)[];

	/**
	 * Removes an amount of tracks using a exclusive start and end exclusive index, returning the removed tracks, EXCLUDING THE `current` TRACK.
	 * @param start
	 * @param end
	 */
	public remove(start: number, end: number): (Track | UnresolvedTrack)[];

	public remove(startOrPosition = 0, end?: number): (Track | UnresolvedTrack)[] {
		const oldPlayer = this.manager.players.get(this.guild) ? { ...this.manager.players.get(this.guild) } : null;

		if (typeof end !== "undefined") {
			// Validate input for `start` and `end`
			if (isNaN(Number(startOrPosition)) || isNaN(Number(end))) {
				throw new RangeError(`Invalid "start" or "end" parameter: start = ${startOrPosition}, end = ${end}`);
			}

			if (startOrPosition >= end || startOrPosition >= this.length) {
				throw new RangeError("Invalid range: start should be less than end and within queue length.");
			}

			const removedTracks = this.splice(startOrPosition, end - startOrPosition);
			this.manager.emit("debug", `[QUEUE] Removed ${removedTracks.length} track(s) from player: ${this.guild} from position ${startOrPosition} to ${end}.`);

			this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
				changeType: PlayerStateEventTypes.QUEUE_CHANGE,
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
			"debug",
			`[QUEUE] Removed 1 track from player: ${this.guild} from position ${startOrPosition}: ${JSON.stringify(removedTrack[0], null, 2)}`
		);

		// Ensure removedTrack is an array for consistency
		const tracksToEmit = removedTrack.length > 0 ? removedTrack : [];

		this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "remove",
				tracks: tracksToEmit,
			},
		});

		return removedTrack;
	}

	/** Clears the queue. */
	public clear(): void {
		const oldPlayer = this.manager.players.get(this.guild) ? { ...this.manager.players.get(this.guild) } : null;
		this.splice(0);
		this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "clear",
				tracks: [],
			},
		});
		this.manager.emit("debug", `[QUEUE] Cleared the queue for: ${this.guild}`);
	}

	/** Shuffles the queue. */
	public shuffle(): void {
		const oldPlayer = this.manager.players.get(this.guild) ? { ...this.manager.players.get(this.guild) } : null;
		for (let i = this.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this[i], this[j]] = [this[j], this[i]];
		}
		this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "shuffle",
			},
		});
		this.manager.emit("debug", `[QUEUE] Shuffled the queue for: ${this.guild}`);
	}

	public userBlockShuffle() {
		const oldPlayer = this.manager.players.get(this.guild) ? { ...this.manager.players.get(this.guild) } : null;
		const userTracks = new Map<string, Array<Track | UnresolvedTrack>>();

		this.forEach((track) => {
			const user = track.requester.id;

			if (!userTracks.has(user)) {
				userTracks.set(user, []);
			}

			userTracks.get(user).push(track);
		});

		const shuffledQueue: Array<Track | UnresolvedTrack> = [];

		while (shuffledQueue.length < this.length) {
			userTracks.forEach((tracks) => {
				const track = tracks.shift();
				if (track) {
					shuffledQueue.push(track);
				}
			});
		}

		this.splice(0);
		this.add(shuffledQueue);
		this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "userBlock",
			},
		});
		this.manager.emit("debug", `[QUEUE] userBlockShuffled the queue for: ${this.guild}`);
	}

	public roundRobinShuffle() {
		const oldPlayer = this.manager.players.get(this.guild) ? { ...this.manager.players.get(this.guild) } : null;
		const userTracks = new Map<string, Array<Track | UnresolvedTrack>>();

		this.forEach((track) => {
			const user = track.requester.id;

			if (!userTracks.has(user)) {
				userTracks.set(user, []);
			}

			userTracks.get(user).push(track);
		});

		userTracks.forEach((tracks) => {
			for (let i = tracks.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[tracks[i], tracks[j]] = [tracks[j], tracks[i]];
			}
		});

		const shuffledQueue: Array<Track | UnresolvedTrack> = [];
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

		this.splice(0);
		this.add(shuffledQueue);
		this.manager.emit("playerStateUpdate", oldPlayer, this.manager.players.get(this.guild), {
			changeType: PlayerStateEventTypes.QUEUE_CHANGE,
			details: {
				changeType: "roundRobin",
			},
		});
		this.manager.emit("debug", `[QUEUE] roundRobinShuffled the queue for: ${this.guild}`);
	}
}
