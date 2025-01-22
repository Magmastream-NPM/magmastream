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

	/**
	 * Updates the filters on the player.
	 * @returns {Promise<Filters>} Returns the current instance of the Filters class.
	 */
	private async updateFilters(): Promise<this> {
		const { distortion, equalizer, karaoke, rotation, timescale, vibrato, volume } = this;

		// Update the filters on the player.
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

		// Return the current instance of the Filters class.
		return this;
	}

	/**
	 * Applies a filter to the player.
	 * @param filter - The filter to apply. Contains the property to update and its value.
	 * @param updateFilters - Whether to update the filters on the player after applying the filter. Defaults to `true`.
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	private applyFilter<T extends keyof Filters>(filter: { property: T; value: Filters[T] }, updateFilters: boolean = true): this {
		// Update the filter on the Filters class.
		this[filter.property] = filter.value as this[T];

		// If enabled, update the filters on the player.
		if (updateFilters) {
			this.updateFilters();
		}

		// Return the current instance of the Filters class.
		return this;
	}

	/**
	 * Sets the status of the given filter. Enables or disables the filter.
	 * @param {keyof availableFilters} filter - The filter to update. Must be one of the `availableFilters` properties.
	 * @param {boolean} status - Whether the filter is enabled (`true`) or disabled (`false`).
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	private setFilterStatus(filter: keyof availableFilters, status: boolean): this {
		/**
		 * Set the filter status in the `filterStatus` object.
		 * This is a private method, so it should only be called by methods that
		 * are intended to change the filter status.
		 */
		this.filterStatus[filter] = status;
		return this;
	}

	/**
	 * Sets the equalizer bands and updates the filters on the player.
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
		// Apply the equalizer filter to the player with the specified bands
		return this.applyFilter({ property: "equalizer", value: bands });
	}

	/**
	 * Applies the eight dimension audio effect.
	 * This filter applies a rotationHz of 0.2 to the player.
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	public eightD(): this {
		return this.setRotation({ rotationHz: 0.2 }).setFilterStatus("eightD", true);
	}

	/**
	 * Applies the bass boost audio effect.
	 * This filter sets the equalizer bands to the values defined in the
	 * `bassBoostEqualizer` array.
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	public bassBoost(): this {
		return this.setEqualizer(bassBoostEqualizer).setFilterStatus("bassboost", true);
	}

	/**
	 * Applies the nightcore audio effect.
	 * This filter sets the timescale of the player to 1.1 speed, 1.125 pitch, and 1.05 rate.
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	public nightcore(): this {
		return this.setTimescale({
			speed: 1.1,
			pitch: 1.125,
			rate: 1.05,
		}).setFilterStatus("nightcore", true);
	}

	/**
	 * Applies the slow motion audio effect.
	 * This filter sets the timescale of the player to 0.7 speed, 1.0 pitch, and 0.8 rate.
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	public slowmo(): this {
		return this.setTimescale({
			speed: 0.7,
			pitch: 1.0,
			rate: 0.8,
		}).setFilterStatus("slowmo", true);
	}

	/**
	 * Applies the soft audio effect to the player.
	 * 
	 * This method sets the equalizer bands to the values defined in the
	 * `softEqualizer` array, which is designed to create a softer sound effect
	 * by reducing the gain of certain frequency bands.
	 * 
	 * @returns {this} Returns the current instance of the Filters class for method chaining.
	 */
	public soft(): this {
		// Apply the soft equalizer settings and update the filter status
		return this.setEqualizer(softEqualizer).setFilterStatus("soft", true);
	}

	/**
	 * Applies the television audio effect.
	 * This filter applies a equalizer effect designed to make the audio sound like it is coming from a television.
	 * @returns {this} Returns the current instance of the Filters class.
	 */
	public tv(): this {
		return this.setEqualizer(tvEqualizer).setFilterStatus("tv", true);
	}

	/**
	 * Applies the treble bass audio effect.
	 * This filter applies a treble boost and a bass boost to the audio.
	 * @returns {this} Returns the current instance of the Filters class for method chaining.
	 */
	public trebleBass(): this {
		return this.setEqualizer(trebleBassEqualizer).setFilterStatus("trebleBass", true);
	}

	/**
	 * Applies the vaporwave audio effect.
	 * This filter applies a timescale effect with a pitch of 0.55 and an equalizer effect
	 * designed to create a vaporwave sound effect.
	 * @returns {this} Returns the current instance of the Filters class for method chaining.
	 */
	public vaporwave(): this {
		return this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 }).setFilterStatus("vaporwave", true);
	}

	/**
	 * Applies the distortion audio effect to the player.
	 * This filter applies a distortion effect to the audio by applying a sine, cosine, and tangent
	 * transformation to the audio signal.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
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

	/**
	 * Applies the karaoke options specified by the filter.
	 * 
	 * This method takes an optional `karaokeOptions` object as a parameter, which
	 * can be used to customize the karaoke effect. The available options are:
	 * - `level`: The level of the karaoke effect. A higher level results in a more
	 *   pronounced effect.
	 * - `monoLevel`: The level of the mono channel. A higher level results in a more
	 *   pronounced effect.
	 * - `filterBand`: The frequency band to apply the karaoke effect to.
	 * - `filterWidth`: The width of the frequency band to apply the karaoke effect to.
	 * 
	 * If no options are provided, the filter will be reset and the karaoke effect will
	 * be disabled.
	 * 
	 * @param {karaokeOptions} [karaoke] - The karaoke options to apply.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setKaraoke(karaoke?: karaokeOptions): this {
		return this.applyFilter({
			property: "karaoke",
			value: karaoke,
		}).setFilterStatus("karaoke", true);
	}


	/**
	 * Applies the timescale options specified by the filter.
	 * 
	 * This method sets the timescale of the audio player using the provided
	 * timescale options. Timescale options may include speed, pitch, and rate
	 * adjustments to modify the playback characteristics of the audio.
	 * 
	 * @param {timescaleOptions} [timescale] - The timescale options to apply.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setTimescale(timescale?: timescaleOptions): this {
		// Apply the timescale filter to the player with the specified options
		return this.applyFilter({ property: "timescale", value: timescale });
	}

	/**
	 * Applies the vibrato options specified by the filter.
	 * 
	 * This method takes an optional `vibratoOptions` object as a parameter, which
	 * can be used to customize the vibrato effect. The available options are:
	 * - `frequency`: The frequency of the vibrato effect. A higher frequency results
	 *   in a faster vibrato effect.
	 * - `depth`: The depth of the vibrato effect. A higher depth results in a more
	 *   pronounced effect.
	 * 
	 * If no options are provided, the filter will be reset and the vibrato effect will
	 * be disabled.
	 * 
	 * @param {vibratoOptions} [vibrato] - The vibrato options to apply.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setVibrato(vibrato?: vibratoOptions): this {
		return this.applyFilter({ property: "vibrato", value: vibrato });
	}

	/**
	 * Applies the rotation options specified by the filter.
	 *
	 * This method takes an optional `rotationOptions` object as a parameter, which
	 * can be used to customize the rotation effect. The available options are:
	 * - `rotationHz`: The frequency of the rotation effect. A higher frequency results
	 *   in a faster rotation effect.
	 *
	 * If no options are provided, the filter will be reset and the rotation effect will
	 * be disabled.
	 *
	 * @param {rotationOptions} [rotation] - The rotation options to apply.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setRotation(rotation?: rotationOptions): this {
		return this.applyFilter({ property: "rotation", value: rotation });
	}

	/**
	 * Applies the distortion options specified by the filter.
	 * This method takes an optional `distortionOptions` object as a parameter, which
	 * can be used to customize the distortion effect. The available options are:
	 * - `sinOffset`: The sine offset value for the distortion effect.
	 * - `sinScale`: The sine scale value for the distortion effect.
	 * - `cosOffset`: The cosine offset value for the distortion effect.
	 * - `cosScale`: The cosine scale value for the distortion effect.
	 * - `tanOffset`: The tangent offset value for the distortion effect.
	 * - `tanScale`: The tangent scale value for the distortion effect.
	 * - `offset`: The offset value for the distortion effect.
	 * - `scale`: The scale value for the distortion effect.
	 *
	 * If no options are provided, the filter will be reset and the distortion effect will
	 * be disabled.
	 *
	 * @param {distortionOptions} [distortion] - The distortion options to apply.
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setDistortion(distortion?: distortionOptions): this {
		return this.applyFilter({ property: "distortion", value: distortion });
	}

	/**
	 * Removes the audio effects and resets the filter status.
	 * 
	 * This method is useful for removing all audio effects and resetting the filter
	 * status to its default state. It is also a convenient way to disable all audio
	 * effects without having to manually reset each filter individually.
	 * 
	 * @returns {Promise<this>} - Returns a promise that resolves with the current
	 * instance of the Filters class.
	 */
	public async clearFilters(): Promise<this> {
		// Reset the filter status to its default state.
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

		// Reset each filter to its default state.
		this.player.filters = new Filters(this.player);
		this.setEqualizer([]);
		this.setDistortion(null);
		this.setKaraoke(null);
		this.setRotation(null);
		this.setTimescale(null);
		this.setVibrato(null);

		// Update the filters to apply the changes.
		await this.updateFilters();
		return this;
	}

	/**
	 * Returns the status of the specified filter.
	 * @param filter - The filter to check.
	 * @returns The status of the specified filter.
	 */
	public getFilterStatus(filter: keyof availableFilters): boolean {
		/**
		 * The filter status is stored in the `filterStatus` property.
		 * The keys of the `filterStatus` property correspond to the available filters.
		 * The values of the `filterStatus` property are boolean values indicating whether the filter is enabled or disabled.
		 */
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
