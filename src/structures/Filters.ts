import {
	Band,
	bassBoostEqualizer,
	electronicEqualizer,
	popEqualizer,
	radioEqualizer,
	softEqualizer,
	trebleBassEqualizer,
	tvEqualizer,
	vaporwaveEqualizer,
} from "../utils/filtersEqualizers";
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
	public filtersStatus: Record<AvailableFilters, boolean>;

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
		this.filtersStatus = Object.values(AvailableFilters).reduce((acc, filter) => {
			acc[filter] = false;
			return acc;
		}, {} as Record<AvailableFilters, boolean>);
	}

	public async updateFilters(): Promise<this> {
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

	/**
	 * Applies a specific filter to the player.
	 *
	 * This method sets a filter property to the specified value and updates the player's
	 * filters if the `updateFilters` flag is true.
	 *
	 * @param {Object} filter - The filter property and value to apply.
	 * @param {string} filter.property - The property of the filter to modify.
	 * @param {any} filter.value - The value to set for the filter property.
	 * @param {boolean} [updateFilters=true] - Whether to update the filters on the player.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	private applyFilter<T extends keyof Filters>(filter: { property: T; value: Filters[T] }, updateFilters: boolean = true): this {
		this[filter.property] = filter.value as this[T];

		if (updateFilters) {
			this.updateFilters();
		}

		return this;
	}

	/**
	 * Sets the status of a specific filter.
	 *
	 * This method updates the filter status to either true or false, indicating whether
	 * the filter is applied or not. This helps track which filters are active.
	 *
	 * @param {AvailableFilters} filter - The filter to update.
	 * @param {boolean} status - The status to set (true for active, false for inactive).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	private setFilterStatus(filter: AvailableFilters, status: boolean): this {
		this.filtersStatus[filter] = status;
		return this;
	}

	/**
	 * Retrieves the status of a specific filter.
	 *
	 * This method returns whether a specific filter is currently applied or not.
	 *
	 * @param {AvailableFilters} filter - The filter to check.
	 * @returns {boolean} - Returns true if the filter is active, false otherwise.
	 */
	public getFilterStatus(filter: AvailableFilters): boolean {
		return this.filtersStatus[filter];
	}

	/**
	 * Clears all filters applied to the audio.
	 *
	 * This method resets all filter settings to their default values and removes any
	 * active filters from the player.
	 *
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public async clearFilters(): Promise<this> {
		this.filtersStatus = Object.values(AvailableFilters).reduce((acc, filter) => {
			acc[filter] = false;
			return acc;
		}, {} as Record<AvailableFilters, boolean>);

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

	/**
	 * Sets the equalizer bands for the player.
	 *
	 * This method updates the player's equalizer settings by applying the provided
	 * bands configuration. The equalizer is an array of Band objects, each containing
	 * a band number and a gain value. The method ensures that the filters are updated
	 * after setting the equalizer, to reflect the changes in audio output.
	 *
	 * @param {Band[]} [bands] - The equalizer bands to apply. Each band includes a
	 * band number and a gain value. If no bands are provided, the equalizer is reset.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setEqualizer(bands?: Band[]): this {
		return this.applyFilter({ property: "equalizer", value: bands });
	}

	/**
	 * Sets the karaoke effect on the audio.
	 *
	 * This method adjusts the player's audio output to apply a karaoke effect, which
	 * may include filtering out vocals or adjusting levels for optimal karaoke performance.
	 *
	 * @param {karaokeOptions} [karaoke] - The karaoke settings to apply (level, mono level, filter band, etc.).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setKaraoke(karaoke?: karaokeOptions): this {
		return karaoke
			? this.applyFilter({ property: "karaoke", value: karaoke }).setFilterStatus(AvailableFilters.SetKaraoke, true)
			: this.applyFilter({ property: "karaoke", value: null }).setFilterStatus(AvailableFilters.SetKaraoke, false);
	}

	/**
	 * Sets the timescale (speed, pitch, rate) for the audio.
	 *
	 * This method adjusts the speed, pitch, and rate of the audio, allowing for effects
	 * such as faster or slower playback, pitch shifts, and time dilation.
	 *
	 * @param {timescaleOptions} [timescale] - The timescale settings to apply (speed, pitch, rate).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setTimescale(timescale?: timescaleOptions): this {
		return timescale
			? this.applyFilter({ property: "timescale", value: timescale }).setFilterStatus(AvailableFilters.SetTimescale, true)
			: this.applyFilter({ property: "timescale", value: null }).setFilterStatus(AvailableFilters.SetTimescale, false);
	}

	/**
	 * Sets the vibrato effect on the audio.
	 *
	 * This method applies a vibrato effect to the audio, which creates a wobble in the
	 * pitch by modulating it at a specified frequency and depth.
	 *
	 * @param {vibratoOptions} [vibrato] - The vibrato settings to apply (frequency and depth).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setVibrato(vibrato?: vibratoOptions): this {
		return vibrato
			? this.applyFilter({ property: "vibrato", value: vibrato }).setFilterStatus(AvailableFilters.Vibrato, true)
			: this.applyFilter({ property: "vibrato", value: null }).setFilterStatus(AvailableFilters.Vibrato, false);
	}

	/**
	 * Sets the rotation effect on the audio.
	 *
	 * This method applies a rotation effect to the audio, creating the illusion of sound
	 * moving around the listener's head.
	 *
	 * @param {rotationOptions} [rotation] - The rotation settings (rotationHz).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setRotation(rotation?: rotationOptions): this {
		return rotation
			? this.applyFilter({ property: "rotation", value: rotation }).setFilterStatus(AvailableFilters.SetRotation, true)
			: this.applyFilter({ property: "rotation", value: null }).setFilterStatus(AvailableFilters.SetRotation, false);
	}

	/**
	 * Sets the distortion effect on the audio.
	 *
	 * This method applies a distortion effect to the audio, which adds an aggressive,
	 * rough texture to the sound.
	 *
	 * @param {distortionOptions} [distortion] - The distortion settings to apply.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setDistortion(distortion?: distortionOptions): this {
		return distortion
			? this.applyFilter({ property: "distortion", value: distortion }).setFilterStatus(AvailableFilters.SetDistortion, true)
			: this.applyFilter({ property: "distortion", value: null }).setFilterStatus(AvailableFilters.SetDistortion, false);
	}

	/**
	 * Applies the bass boost effect by setting an equalizer with boosted bass frequencies.
	 *
	 * This method enhances the lower frequencies of the audio, giving the audio a deep
	 * and powerful bass response.
	 *	@param {boolean} status - Whether to enable or disable the bass boost effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public bassBoost(status: boolean): this {
		return status
			? this.setEqualizer(bassBoostEqualizer).setFilterStatus(AvailableFilters.BassBoost, true)
			: this.setEqualizer().setFilterStatus(AvailableFilters.BassBoost, false);
	}

	/**
	 * Applies a chipmunk effect to the audio.
	 *
	 * This method applies a chipmunk effect to audio.
	 * @param {boolean} status - Whether to enable or disable the chipmunk effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public chipmunk(status: boolean): this {
		return status
			? this.setTimescale({ speed: 1.5, pitch: 1.5, rate: 1.5 }).setFilterStatus(AvailableFilters.Chipmunk, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Chipmunk, false);
	}

	/**
	 * Applies a china effect to the audio.
	 *
	 * This method applies a china effect to audio.
	 * @param {boolean} status - Whether to enable or disable the china effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public china(status: boolean): this {
		return status
			? this.setTimescale({ speed: 1.0, pitch: 0.5, rate: 1.0 }).setFilterStatus(AvailableFilters.China, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.China, false);
	}

	/**
	 * Applies the "8D audio" effect by setting a rotation filter.
	 *
	 * This method creates the "8D audio" effect, which gives the illusion of sound
	 * moving around the listener's head. It applies a subtle rotation effect to the audio.
	 *	@param {boolean} status - Whether to enable or disable the 8D audio effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public eightD(status: boolean): this {
		return status
			? this.setRotation({ rotationHz: 0.2 }).setFilterStatus(AvailableFilters.EightD, true)
			: this.setRotation().setFilterStatus(AvailableFilters.EightD, false);
	}

	/**
	 * Applies the nightcore effect by adjusting the speed and pitch of the audio.
	 *
	 * This method increases the tempo and pitch of the audio, giving it a faster and
	 * higher-pitched sound, characteristic of the nightcore genre.
	 * @param {boolean} status - Whether to enable or disable the nightcore effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public nightcore(status: boolean): this {
		return status
			? this.setTimescale({ speed: 1.1, pitch: 1.125, rate: 1.05 }).setFilterStatus(AvailableFilters.Nightcore, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Nightcore, false);
	}

	/**
	 * Applies the slow-motion effect by reducing the speed and pitch of the audio.
	 *
	 * This method slows down the audio, giving it a slower and more relaxed feel.
	 *
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public slowmo(status: boolean): this {
		return status
			? this.setTimescale({ speed: 0.7, pitch: 1.0, rate: 0.8 }).setFilterStatus(AvailableFilters.Slowmo, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Slowmo, false);
	}

	/**
	 * Applies a soft equalizer to give the audio a smoother sound.
	 *
	 * This method adjusts the equalizer settings to soften the frequencies and give
	 * the audio a more mellow tone.
	 * @param {boolean} status - Whether to enable or disable the soft effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public soft(status: boolean): this {
		return status
			? this.setEqualizer(softEqualizer).setFilterStatus(AvailableFilters.Soft, true)
			: this.setEqualizer().setFilterStatus(AvailableFilters.Soft, false);
	}

	/**
	 * Applies a TV-like equalizer effect to the audio.
	 *
	 * This method adjusts the equalizer to give the audio a "TV" effect, which may
	 * simulate the audio quality heard from television speakers.
	 * @param {boolean} status - Whether to enable or disable the TV effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public tv(status: boolean): this {
		return status ? this.setEqualizer(tvEqualizer).setFilterStatus(AvailableFilters.TV, true) : this.setEqualizer().setFilterStatus(AvailableFilters.TV, false);
	}

	/**
	 * Applies the "treble and bass boost" effect to the audio.
	 *
	 * This method adjusts the equalizer to boost both the treble (high frequencies)
	 * and bass (low frequencies), giving the audio a more balanced and enhanced sound.
	 * @param {boolean} status - Whether to enable or disable the treble and bass boost effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public trebleBass(status: boolean): this {
		return status
			? this.setEqualizer(trebleBassEqualizer).setFilterStatus(AvailableFilters.TrebleBass, true)
			: this.setEqualizer().setFilterStatus(AvailableFilters.TrebleBass, false);
	}

	/**
	 * Applies the vaporwave effect by adjusting the equalizer and pitch.
	 *
	 * This method applies a vaporwave-style equalizer, with softer tones, and adjusts
	 * the pitch to give the audio a dreamy, nostalgic feel.
	 * @param {boolean} status - Whether to enable or disable the vaporwave effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public vaporwave(status: boolean): this {
		return status
			? this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 }).setFilterStatus(AvailableFilters.Vaporwave, true)
			: this.setEqualizer().setTimescale().setFilterStatus(AvailableFilters.Vaporwave, false);
	}

	/**
	 * Applies a distortion effect to the audio.
	 *
	 * This method applies a distortion effect by adjusting various distortion parameters.
	 * It can make the audio sound rougher and more intense.
	 * @param {boolean} status - Whether to enable or disable the distort effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public distort(status: boolean): this {
		return status
			? this.setDistortion({
					sinOffset: 0,
					sinScale: 0.2,
					cosOffset: 0,
					cosScale: 0.2,
					tanOffset: 0,
					tanScale: 0.2,
					offset: 0,
					scale: 1.2,
			  }).setFilterStatus(AvailableFilters.Distort, true)
			: this.setDistortion().setFilterStatus(AvailableFilters.Distort, false);
	}

	/**
	 * Applies a pop effect to the audio.
	 *
	 * This method applies a pop effect to audio.
	 * @param {boolean} status - Whether to enable or disable the pop effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public pop(status: boolean): this {
		return status
			? this.setEqualizer(popEqualizer).setFilterStatus(AvailableFilters.Pop, true)
			: this.setEqualizer().setFilterStatus(AvailableFilters.Pop, false);
	}

	/**
	 * Applies a party effect to the audio.
	 *
	 * This method applies a party effect to audio.
	 * @param {boolean} status - Whether to enable or disable the party effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public party(status: boolean): this {
		return status
			? this.setTimescale({ speed: 1.25, pitch: 1.0, rate: 1.0 }).setFilterStatus(AvailableFilters.Party, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Party, false);
	}

	/**
	 * Applies earrape effect to the audio.
	 *
	 * This method applies earrape effect to audio.
	 * @param {boolean} status - Whether to enable or disable the earrape effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public earrape(status: boolean): this {
		if (status) {
			this.player.setVolume(200);
			return this.setFilterStatus(AvailableFilters.Earrape, true);
		} else {
			this.player.setVolume(100);
			return this.setFilterStatus(AvailableFilters.Earrape, false);
		}
	}

	/**
	 * Applies electronic effect to the audio.
	 *
	 * This method applies electronic effect to audio.
	 * @param {boolean} status - Whether to enable or disable the electronic effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public electronic(status: boolean): this {
		return status
			? this.setEqualizer(electronicEqualizer).setFilterStatus(AvailableFilters.Electronic, true)
			: this.setEqualizer().setFilterStatus(AvailableFilters.Electronic, false);
	}

	/**
	 * Applies a radio effect to the audio.
	 *
	 * This method applies a radio effect to audio.
	 * @param {boolean} status - Whether to enable or disable the radio effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public radio(status: boolean): this {
		return status
			? this.setEqualizer(radioEqualizer).setFilterStatus(AvailableFilters.Radio, true)
			: this.setEqualizer().setFilterStatus(AvailableFilters.Radio, false);
	}

	/**
	 * Applies a tremolo effect to the audio.
	 *
	 * This method applies a tremolo effect to audio.
	 * @param {boolean} status - Whether to enable or disable the tremolo effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public tremolo(status: boolean): this {
		return status
			? this.setVibrato({ frequency: 5, depth: 0.5 }).setFilterStatus(AvailableFilters.Tremolo, true)
			: this.setVibrato().setFilterStatus(AvailableFilters.Tremolo, false);
	}

	/**
	 * Applies a darthvader effect to the audio.
	 *
	 * This method applies a darthvader effect to audio.
	 * @param {boolean} status - Whether to enable or disable the darthvader effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public darthvader(status: boolean): this {
		return status
			? this.setTimescale({ speed: 1.0, pitch: 0.5, rate: 1.0 }).setFilterStatus(AvailableFilters.Darthvader, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Darthvader, false);
	}

	/**
	 * Applies a party daycore to the audio.
	 *
	 * This method applies a daycore effect to audio.
	 * @param {boolean} status - Whether to enable or disable the daycore effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public daycore(status: boolean): this {
		return status
			? this.setTimescale({ speed: 0.7, pitch: 0.8, rate: 0.8 }).setFilterStatus(AvailableFilters.Daycore, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Daycore, false);
	}

	/**
	 * Applies a doubletime effect to the audio.
	 *
	 * This method applies a doubletime effect to audio.
	 * @param {boolean} status - Whether to enable or disable the doubletime effect.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public doubletime(status: boolean): this {
		return status
			? this.setTimescale({ speed: 2.0, pitch: 1.0, rate: 2.0 }).setFilterStatus(AvailableFilters.Doubletime, true)
			: this.setTimescale().setFilterStatus(AvailableFilters.Doubletime, false);
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

export enum AvailableFilters {
	BassBoost = "bassboost",
	Distort = "distort",
	SetDistortion = "setDistortion",
	EightD = "eightD",
	SetKaraoke = "setKaraoke",
	Nightcore = "nightcore",
	Slowmo = "slowmo",
	Soft = "soft",
	TrebleBass = "trebleBass",
	SetTimescale = "setTimescale",
	TV = "tv",
	Vibrato = "vibrato",
	Vaporwave = "vaporwave",
	Pop = "pop",
	Party = "party",
	Earrape = "earrape",
	Electronic = "electronic",
	Radio = "radio",
	SetRotation = "setRotation",
	Tremolo = "tremolo",
	China = "china",
	Chipmunk = "chipmunk",
	Darthvader = "darthvader",
	Daycore = "daycore",
	Doubletime = "doubletime",
}
