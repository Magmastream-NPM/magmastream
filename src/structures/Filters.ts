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
			pop: false,
			party: false,
			earrape: false,
			electronic: false,
			radio: false,
			tremolo: false,
			china: false,
			chipmunk: false,
			darthvader: false,
			daycore: false,
			doubletime: false,
		};
	}

	/**
	 * Updates the player's filters by applying the current settings.
	 * 
	 * This method sends the updated filter settings, including distortion, equalizer,
	 * karaoke, rotation, timescale, vibrato, and volume, to the player. It ensures that
	 * the player's audio output is updated to reflect the applied filters.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
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
	 * @param {keyof availableFilters} filter - The filter to update.
	 * @param {boolean} status - The status to set (true for active, false for inactive).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	private setFilterStatus(filter: keyof availableFilters, status: boolean): this {
		this.filterStatus[filter] = status;
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
	 * Applies the "8D audio" effect by setting a rotation filter.
	 * 
	 * This method creates the "8D audio" effect, which gives the illusion of sound
	 * moving around the listener's head. It applies a subtle rotation effect to the audio.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public eightD(): this {
		return this.setRotation({ rotationHz: 0.2 }).setFilterStatus("eightD", true);
	}

	/**
	 * Applies the bass boost effect by setting an equalizer with boosted bass frequencies.
	 * 
	 * This method enhances the lower frequencies of the audio, giving the audio a deep
	 * and powerful bass response.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public bassBoost(): this {
		return this.setEqualizer(bassBoostEqualizer).setFilterStatus("bassboost", true);
	}

	/**
	 * Applies the nightcore effect by adjusting the speed and pitch of the audio.
	 * 
	 * This method increases the tempo and pitch of the audio, giving it a faster and
	 * higher-pitched sound, characteristic of the nightcore genre.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public nightcore(): this {
		return this.setTimescale({
			speed: 1.1,
			pitch: 1.125,
			rate: 1.05,
		}).setFilterStatus("nightcore", true);
	}

	/**
	 * Applies the slow-motion effect by reducing the speed and pitch of the audio.
	 * 
	 * This method slows down the audio, giving it a slower and more relaxed feel.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public slowmo(): this {
		return this.setTimescale({
			speed: 0.7,
			pitch: 1.0,
			rate: 0.8,
		}).setFilterStatus("slowmo", true);
	}

	/**
	 * Applies a soft equalizer to give the audio a smoother sound.
	 * 
	 * This method adjusts the equalizer settings to soften the frequencies and give
	 * the audio a more mellow tone.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public soft(): this {
		return this.setEqualizer(softEqualizer).setFilterStatus("soft", true);
	}

	/**
	 * Applies a TV-like equalizer effect to the audio.
	 * 
	 * This method adjusts the equalizer to give the audio a "TV" effect, which may
	 * simulate the audio quality heard from television speakers.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public tv(): this {
		return this.setEqualizer(tvEqualizer).setFilterStatus("tv", true);
	}

	/**
	 * Applies the "treble and bass boost" effect to the audio.
	 * 
	 * This method adjusts the equalizer to boost both the treble (high frequencies)
	 * and bass (low frequencies), giving the audio a more balanced and enhanced sound.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public trebleBass(): this {
		return this.setEqualizer(trebleBassEqualizer).setFilterStatus("trebleBass", true);
	}

	/**
	 * Applies the vaporwave effect by adjusting the equalizer and pitch.
	 * 
	 * This method applies a vaporwave-style equalizer, with softer tones, and adjusts
	 * the pitch to give the audio a dreamy, nostalgic feel.
	 * 
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public vaporwave(): this {
		return this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 }).setFilterStatus("vaporwave", true);
	}

	/**
	 * Applies a distortion effect to the audio.
	 * 
	 * This method applies a distortion effect by adjusting various distortion parameters.
	 * It can make the audio sound rougher and more intense.
	 * 
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
	 * Sets the karaoke effect on the audio.
	 * 
	 * This method adjusts the player's audio output to apply a karaoke effect, which
	 * may include filtering out vocals or adjusting levels for optimal karaoke performance.
	 * 
	 * @param {karaokeOptions} [karaoke] - The karaoke settings to apply (level, mono level, filter band, etc.).
	 * @returns {this} - Returns the current instance of the Filters class for method chaining.
	 */
	public setKaraoke(karaoke?: karaokeOptions): this {
		return this.applyFilter({
			property: "karaoke",
			value: karaoke,
		}).setFilterStatus("karaoke", true);
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
		return this.applyFilter({ property: "timescale", value: timescale });
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
		return this.applyFilter({ property: "vibrato", value: vibrato });
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
		return this.applyFilter({ property: "rotation", value: rotation });
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
		return this.applyFilter({ property: "distortion", value: distortion });
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
			electronic: false,
			radio: false,
			tremolo: false,
			china: false,
			chipmunk: false,
			darthvader: false,
			daycore: false,
			doubletime: false,
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

	/**
	 * Retrieves the status of a specific filter.
	 * 
	 * This method returns whether a specific filter is currently applied or not.
	 * 
	 * @param {keyof availableFilters} filter - The filter to check.
	 * @returns {boolean} - Returns true if the filter is active, false otherwise.
	 */
	public getFilterStatus(filter: keyof availableFilters): boolean {
		return this.filterStatus[filter];
	}

	// New filters
	public pop(): this {
		const popEqualizer: Band[] = [
			{ band: 0, gain: 0.5 },
			{ band: 1, gain: 1.5 },
			{ band: 2, gain: 2 },
			{ band: 3, gain: 1.5 },
		];
		return this.setEqualizer(popEqualizer).setFilterStatus("pop", true);
	}

	public party(): this {
		return this.setTimescale({
			speed: 1.25,
			pitch: 1.0,
			rate: 1.0,
		}).setFilterStatus("party", true);
	}

	public earrape(): this {
		this.player.setVolume(2.0)
		return this.setFilterStatus("earrape", true);
	}

	public electronic(): this {
		const electronicEqualizer: Band[] = [
			{ band: 0, gain: 1.0 },
			{ band: 1, gain: 2.0 },
			{ band: 2, gain: 3.0 },
			{ band: 3, gain: 2.5 },
		];
		return this.setEqualizer(electronicEqualizer).setFilterStatus("electronic", true);
	}

	public radio(): this {
		const radioEqualizer: Band[] = [
			{ band: 0, gain: 3.0 },
			{ band: 1, gain: 3.0 },
			{ band: 2, gain: 1.0 },
			{ band: 3, gain: 0.5 },
		];
		return this.setEqualizer(radioEqualizer).setFilterStatus("radio", true);
	}

	public tremolo(): this {
		return this.setVibrato({ frequency: 5, depth: 0.5 }).setFilterStatus("tremolo", true);
	}

	public china(): this {
		return this.setTimescale({
			speed: 1.0,
			pitch: 0.5,
			rate: 1.0,
		}).setFilterStatus("china", true);
	}

	public chipmunk(): this {
		return this.setTimescale({
			speed: 1.5,
			pitch: 1.5,
			rate: 1.5,
		}).setFilterStatus("chipmunk", true);
	}

	public darthvader(): this {
		return this.setTimescale({
			speed: 1.0,
			pitch: 0.5,
			rate: 1.0,
		}).setFilterStatus("darthvader", true);
	}

	public daycore(): this {
		return this.setTimescale({
			speed: 0.7,
			pitch: 0.8,
			rate: 0.8,
		}).setFilterStatus("daycore", true);
	}

	public doubletime(): this {
		return this.setTimescale({
			speed: 2.0,
			pitch: 1.0,
			rate: 2.0,
		}).setFilterStatus("doubletime", true);
	}

	// Volume setter method
	public setVolume(volume: number): this {
		this.volume = volume;
		return this.applyFilter({ property: "volume", value: this.volume });
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

interface availableFilters {
	[key: string]: boolean;
}
