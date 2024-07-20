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

	/**
	 * Sets the equalizer bands and updates the filters.
	 * @param bands - The equalizer bands.
	 */
	public setEqualizer(bands?: Band[]): this {
		return this.applyFilter({ property: "equalizer", value: bands });
	}

	/** Applies the eight dimension audio effect. */
	public eightD(): this {
		return this.setRotation({ rotationHz: 0.2 }).setFilterStatus("eightD", true);
	}

	/** Applies the bass boost effect. */
	public bassBoost(): this {
		return this.setEqualizer(bassBoostEqualizer).setFilterStatus("bassboost", true);
	}

	/** Applies the nightcore effect. */
	public nightcore(): this {
		return this.setTimescale({
			speed: 1.1,
			pitch: 1.125,
			rate: 1.05,
		}).setFilterStatus("nightcore", true);
	}

	/** Applies the slow motion audio effect. */
	public slowmo(): this {
		return this.setTimescale({
			speed: 0.7,
			pitch: 1.0,
			rate: 0.8,
		}).setFilterStatus("slowmo", true);
	}

	/** Applies the soft audio effect. */
	public soft(): this {
		return this.setEqualizer(softEqualizer).setFilterStatus("soft", true);
	}

	/** Applies the television audio effect. */
	public tv(): this {
		return this.setEqualizer(tvEqualizer).setFilterStatus("tv", true);
	}

	/** Applies the treble bass effect. */
	public trebleBass(): this {
		return this.setEqualizer(trebleBassEqualizer).setFilterStatus("trebleBass", true);
	}

	/** Applies the vaporwave effect. */
	public vaporwave(): this {
		return this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 }).setFilterStatus("vaporwave", true);
	}

	/** Applies the distortion audio effect. */
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

	/** Applies the karaoke options specified by the filter. */
	public setKaraoke(karaoke?: karaokeOptions): this {
		return this.applyFilter({
			property: "karaoke",
			value: karaoke,
		}).setFilterStatus("karaoke", true);
	}

	/** Applies the timescale options specified by the filter. */
	public setTimescale(timescale?: timescaleOptions): this {
		return this.applyFilter({ property: "timescale", value: timescale });
	}

	/** Applies the vibrato options specified by the filter. */
	public setVibrato(vibrato?: vibratoOptions): this {
		return this.applyFilter({ property: "vibrato", value: vibrato });
	}

	/** Applies the rotation options specified by the filter. */
	public setRotation(rotation?: rotationOptions): this {
		return this.applyFilter({ property: "rotation", value: rotation });
	}

	/** Applies the distortion options specified by the filter. */
	public setDistortion(distortion?: distortionOptions): this {
		return this.applyFilter({ property: "distortion", value: distortion });
	}

	/** Removes the audio effects and resets the filter status. */
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

	/** Returns the status of the specified filter . */
	public getFilterStatus(filter: keyof availableFilters): boolean {
		return this.filterStatus[filter];
	}
}

/** Options for adjusting the timescale of audio. */
interface timescaleOptions {
	/** The speed factor for the timescale. */
	speed?: number;
	/** The pitch factor for the timescale. */
	pitch?: number;
	/** The rate factor for the timescale. */
	rate?: number;
}

/** Options for applying vibrato effect to audio. */
interface vibratoOptions {
	/** The frequency of the vibrato effect. */
	frequency: number;
	/** * The depth of the vibrato effect.*/
	depth: number;
}

/** Options for applying rotation effect to audio. */
interface rotationOptions {
	/** The rotation speed in Hertz (Hz). */
	rotationHz: number;
}

/** Options for applying karaoke effect to audio. */
interface karaokeOptions {
	/** The level of karaoke effect. */
	level?: number;
	/** The mono level of karaoke effect. */
	monoLevel?: number;
	/** The filter band of karaoke effect. */
	filterBand?: number;
	/** The filter width of karaoke effect. */
	filterWidth?: number;
}

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
}
