import { Track, UnresolvedTrack } from "./Player";
import { TrackUtils } from "./Utils";

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

	/**
	 * Adds a track to the queue.
	 * @param track
	 * @param [offset=null]
	 */
	public add(track: (Track | UnresolvedTrack) | (Track | UnresolvedTrack)[], offset?: number): void {
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
		if (typeof end !== "undefined") {
			if (isNaN(Number(startOrPosition)) || isNaN(Number(end))) {
				throw new RangeError(`Missing "start" or "end" parameter.`);
			}

			if (startOrPosition >= end || startOrPosition >= this.length) {
				throw new RangeError("Invalid start or end values.");
			}

			return this.splice(startOrPosition, end - startOrPosition);
		}

		return this.splice(startOrPosition, 1);
	}

	/** Clears the queue. */
	public clear(): void {
		this.splice(0);
	}

	/** Shuffles the queue. */
	public shuffle(): void {
		for (let i = this.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this[i], this[j]] = [this[j], this[i]];
		}
	}

	public equalizedShuffle() {
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

		this.clear();
		this.add(shuffledQueue);
		console.log(this);
	}
}
