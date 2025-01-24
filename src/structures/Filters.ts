import { Band, bassBoostEqualizer, softEqualizer, trebleBassEqualizer, tvEqualizer, vaporwaveEqualizer } from "../utils/filtersEqualizers";
import { Player } from "./Player";

export class Filters {
	public distortion: distortionOptions | null;
	public equalizer: Band[];
	public karaoke: karaokeOptions | null;
	public player: Player;
	public rotation: rotationOptions | null;
	public timescale: timescaleOptions | null;
	public vibrato: vibratoOptions | null;
	public volume: number;

	private filterStatus: Record<keyof availableFilters, boolean>;

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
			chipmunk: false,
			demon: false,
			robotic: false,
			underwater: false,
			reverb: false,
		};
	}

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
			guildId: this.player.guild,
		});

		return this;
	}

	private applyFilter<T extends keyof Filters>(filter: { property: T; value: Filters[T] }, updateFilters: boolean = true): this {
		this[filter.property] = filter.value as this[T];
		if (updateFilters) {
			this.updateFilters();
		}
		return this;
	}

	private setFilterStatus(filter: keyof availableFilters, status: boolean): this {
		this.filterStatus[filter] = status;
		return this;
	}

	/** Sets the equalizer bands and updates the filters. */
	public setEqualizer(bands?: Band[]): this {
		return this.applyFilter({ property: "equalizer", value: bands });
	}

	/** Applies the bass boost effect. */
	public bassBoost(): this {
		return this.setEqualizer(bassBoostEqualizer).setFilterStatus("bassboost", true);
	}

	/** Applies the soft audio effect. */
	public soft(): this {
		return this.setEqualizer(softEqualizer).setFilterStatus("soft", true);
	}

	/** Applies the treble bass effect. */
	public trebleBass(): this {
		return this.setEqualizer(trebleBassEqualizer).setFilterStatus("trebleBass", true);
	}

	/** Applies the vaporwave effect. */
	public vaporwave(): this {
		return this.setEqualizer(vaporwaveEqualizer)
			.setTimescale({ pitch: 0.55 })
			.setFilterStatus("vaporwave", true);
	}

	/** Applies the karaoke effect. */
	public setKaraoke(karaoke?: karaokeOptions): this {
		return this.applyFilter({ property: "karaoke", value: karaoke }).setFilterStatus("karaoke", true);
	}

	/** Applies the nightcore effect. */
	public nightcore(): this {
		return this.setTimescale({
			speed: 1.1,
			pitch: 1.125,
			rate: 1.05,
		}).setFilterStatus("nightcore", true);
	}

	/** Applies the slow motion effect. */
	public slowmo(): this {
		return this.setTimescale({
			speed: 0.7,
			pitch: 1.0,
			rate: 0.8,
		}).setFilterStatus("slowmo", true);
	}

	/** Applies the eight-dimensional effect. */
	public eightD(): this {
		return this.setRotation({ rotationHz: 0.2 }).setFilterStatus("eightD", true);
	}

	/** Applies the distortion effect. */
	public distort(): this {
		return this.setDistortion({
			sinOffset: 0,
			sinScale: 0.2,
			cosOffset: 0,
			cosScale: 0.2,
			tanOffset: 0,
			tanScale: 0.2,
			offset: 0,
			scale: 1.2,
		}).setFilterStatus("distort", true);
	}

	/** Applies a chipmunk voice effect. */
	public chipmunk(): this {
		return this.setTimescale({ pitch: 2.0, speed: 1.2 }).setFilterStatus("chipmunk", true);
	}

	/** Applies a demon voice effect. */
	public demon(): this {
		return this.setTimescale({ pitch: 0.5, speed: 0.8 }).setFilterStatus("demon", true);
	}

	/** Applies a robotic voice effect. */
	public robotic(): this {
		return this.setVibrato({ frequency: 15, depth: 0.8 }).setFilterStatus("robotic", true);
	}

	/** Applies an underwater effect. */
	public underwater(): this {
		return this.setEqualizer([{ band: 0, gain: -1.0 }, { band: 1, gain: -0.5 }]).setFilterStatus("underwater", true);
	}

	/** Applies a reverb effect. */
	public reverb(): this {
		return this.setDistortion({ offset: 0, scale: 0.8 }).setFilterStatus("reverb", true);
	}

	/** Removes all filters and resets their status. */
	public async clearFilters(): Promise<this> {
		this.resetFilters();
		await this.updateFilters();
		return this;
	}

	/** Returns the status of the specified filter. */
	public getFilterStatus(filter: keyof availableFilters): boolean {
		return this.filterStatus[filter];
	}

	/** Resets all filter settings to their default values. */
	private resetFilters(): void {
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
			chipmunk: false,
			demon: false,
			robotic: false,
			underwater: false,
			reverb: false,
		};

		this.equalizer = [];
		this.distortion = null;
		this.karaoke = null;
		this.rotation = null;
		this.timescale = null;
		this.vibrato = null;
		this.volume = 1.0;
	}
}

/** Options for adjusting the timescale of audio. */
interface timescaleOptions {
	speed?: number;
	pitch?: number;
	rate?: number;
}

/** Options for applying vibrato effect to audio. */
interface vibratoOptions {
	frequency: number;
	depth: number;
}

/** Options for applying rotation effect to audio. */
interface rotationOptions {
	rotationHz: number;
}

/** Options for applying karaoke effect to audio. */
interface karaokeOptions {
	level?: number;
	monoLevel?: number;
	filterBand?: number;
	filterWidth?: number;
}

/** Options for applying distortion effect to audio. */
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

/** List of all available filters. */
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
	chipmunk: boolean;
	demon: boolean;
	robotic: boolean;
	underwater: boolean;
	reverb: boolean;
}
