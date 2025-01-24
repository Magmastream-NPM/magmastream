import { Band, bassBoostEqualizer, softEqualizer, trebleBassEqualizer, tvEqualizer, vaporwaveEqualizer } from "../utils/filtersEqualizers"; 

// Define custom equalizers for new effects
const popEqualizer: Band[] = [
  { band: 0, gain: 0.5 },
  { band: 1, gain: 0.7 },
  { band: 2, gain: 1.0 },
  { band: 3, gain: 1.2 },
  { band: 4, gain: 0.8 },
];

const partyEqualizer: Band[] = [
  { band: 0, gain: 1.5 },
  { band: 1, gain: 1.0 },
  { band: 2, gain: 1.2 },
  { band: 3, gain: 1.5 },
  { band: 4, gain: 1.0 },
];

const earrapeEqualizer: Band[] = [
  { band: 0, gain: 5.0 },
  { band: 1, gain: 5.0 },
  { band: 2, gain: 5.0 },
  { band: 3, gain: 5.0 },
  { band: 4, gain: 5.0 },
];

export class Filters {
	public distortion: distortionOptions | null;
	public equalizer: Band[];
	public karaoke: karaokeOptions | null;
	public player: Player;
	public rotation: rotationOptions | null;
	public timescale: timescaleOptions | null;
	public vibrato: vibratoOptions | null;
	public volume: number;

	private filterStatus: {
		[key: string]: boolean;
	};

	constructor(player: Player) {
		this.distortion = null;
		this.equalizer = [];
		this.karaoke = null;
		this.player = player;
		this.rotation = null;
		this.timescale = null;
		this.vibrato = null;
		this.volume = 1.0;

		// Initialize filter status
		this.filterStatus = {
			bassboost: false,
			distort: false,
			eightD: false,
			karaoke: false,
			nightcore: false,
			slowmo: false,
			soft: false,
			trebleBass: false,
			tv: false,
			vaporwave: false,
			pop: false,
			party: false,
			earrape: false,
			equalizer: false,
		};
	}

	// Updates the filters on the player
	private async updateFilters(): Promise<this> {
		const { distortion, equalizer, karaoke, rotation, timescale, vibrato, volume } = this;
		await this.player.node.rest.updatePlayer({
			data: {
				filters: {
					distortion,
					equalizer,
					karaoke,
					rotation,
					timescale,
					vibrato,
					volume,
				},
			},
			guildId: this.player.guildId,
		});
		return this;
	}

	// Applies a filter to the player
	private applyFilter<T extends keyof Filters>(filter: { property: T; value: Filters[T] }, updateFilters: boolean = true): this {
		this[filter.property] = filter.value as this[T];
		if (updateFilters) {
			this.updateFilters();
		}
		return this;
	}

	// Sets the status of the given filter
	private setFilterStatus(filter: keyof availableFilters, status: boolean): this {
		this.filterStatus[filter] = status;
		return this;
	}

	// Pop filter (custom equalizer effect)
	public pop(): this {
		return this.setEqualizer(popEqualizer).setFilterStatus("pop", true);
	}

	// Party filter (custom equalizer effect)
	public party(): this {
		return this.setEqualizer(partyEqualizer).setFilterStatus("party", true);
	}

	// Earrape filter (extreme distortion)
	public earrape(): this {
		return this.setEqualizer(earrapeEqualizer).setDistortion({
			sinOffset: 0,
			sinScale: 1.0,
			cosOffset: 0,
			cosScale: 1.0,
			tanOffset: 0,
			tanScale: 1.0,
			offset: 0,
			scale: 5.0, // Extreme distortion for the earrape effect
		}).setFilterStatus("earrape", true);
	}

	// Existing filters
	public bassBoost(): this {
		return this.setEqualizer(bassBoostEqualizer).setFilterStatus("bassboost", true);
	}

	public soft(): this {
		return this.setEqualizer(softEqualizer).setFilterStatus("soft", true);
	}

	public trebleBass(): this {
		return this.setEqualizer(trebleBassEqualizer).setFilterStatus("trebleBass", true);
	}

	public tv(): this {
		return this.setEqualizer(tvEqualizer).setFilterStatus("tv", true);
	}

	public vaporwave(): this {
		return this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 }).setFilterStatus("vaporwave", true);
	}

	// Reset all filters
	public async clearFilters(): Promise<this> {
		this.filterStatus = {
			bassboost: false,
			distort: false,
			eightD: false,
			karaoke: false,
			nightcore: false,
			slowmo: false,
			soft: false,
			trebleBass: false,
			tv: false,
			vaporwave: false,
			pop: false,
			party: false,
			earrape: false,
			equalizer: false,
		};
		this.player.filters = new Filters(this.player);
		this.setEqualizer([]);
		this.setDistortion(null);
		this.setKaraoke(null);
		this.setRotation(null);
		this.setTimescale(null);
		this.setVibrato(null);
		await this.updateFilters();
		return this;
	}

	// Set custom equalizer
	public setEqualizer(bands?: Band[]): this {
		return this.applyFilter({ property: "equalizer", value: bands });
	}

	// Set distortion options
	public setDistortion(distortion?: distortionOptions): this {
		return this.applyFilter({ property: "distortion", value: distortion });
	}

	// Set karaoke options
	public setKaraoke(karaoke?: karaokeOptions): this {
		return this.applyFilter({ property: "karaoke", value: karaoke });
	}

	// Set timescale options
	public setTimescale(timescale?: timescaleOptions): this {
		return this.applyFilter({ property: "timescale", value: timescale });
	}

	// Set vibrato options
	public setVibrato(vibrato?: vibratoOptions): this {
		return this.applyFilter({ property: "vibrato", value: vibrato });
	}

	// Set rotation options
	public setRotation(rotation?: rotationOptions): this {
		return this.applyFilter({ property: "rotation", value: rotation });
	}

	// Returns the status of the specified filter
	public getFilterStatus(filter: keyof availableFilters): boolean {
		return this.filterStatus[filter];
	}
}

/** Options for distortion effect */
interface distortionOptions {
	sinOffset?: number;
	sinScale?: number;
	cosOffset?: number;
	cosScale?: number;
	tanOffset?: number;
	tanScale?: number;
	offset?: number;
	scale?: number;
}

/** Options for timescale effect */
interface timescaleOptions {
	speed?: number;
	pitch?: number;
	rate?: number;
}

/** Options for vibrato effect */
interface vibratoOptions {
	frequency: number;
	depth: number;
}

/** Options for rotation effect */
interface rotationOptions {
	rotationHz: number;
}

/** Options for karaoke effect */
interface karaokeOptions {
	level?: number;
	monoLevel?: number;
	filterBand?: number;
	filterWidth?: number;
}

/** Available filters */
interface availableFilters {
	bassboost: boolean;
	distort: boolean;
	eightD: boolean;
	karaoke: boolean;
	nightcore: boolean;
	slowmo: boolean;
	soft: boolean;
	trebleBass: boolean;
	tv: boolean;
	vaporwave: boolean;
	pop: boolean;
	party: boolean;
	earrape: boolean;
	equalizer: boolean;
}
