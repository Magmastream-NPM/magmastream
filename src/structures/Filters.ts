import { Player } from "./Player";

export class Filters {
  public player: Player;
  public volume = 1.0;
  public equalizer: Band[] = [];
  public vibrato: vibratoOptions = null;
  public rotation: rotationOptions = null;
  public timescale: timescaleOptions = null;
  public karaoke: karaokeOptions = null;
  public distortion: distortionOptions = null;

  constructor(player: Player) {
    this.player = player;
  }

  /**
   * Sets the equalizer bands and updates the filters.
   * @param bands - The equalizer bands.
   */
  public setEqualizer(bands?: Band[]): this {
    this.equalizer = bands;
    this.updateFilters();
    return this;
  }

  /**
   * Applies the 8D filter.
   */
  public eightD(): this {
    return this.setRotation({ rotationHz: 0.2 });
  }

  /**
   * Applies the bass boost filter.
   */
  public bassBoost(): this {
    return this.setEqualizer(bassBoostEqualizer);
  }

  /**
   * Applies the nightcore filter.
   */
  public nightcore(): this {
    return this.setTimescale({
      speed: 1.1,
      pitch: 1.125,
      rate: 1.05,
    });
  }

  /**
   * Applies the slow motion filter.
   */
  public slowmo(): this {
    return this.setTimescale({
      speed: 0.7,
      pitch: 1.0,
      rate: 0.8,
    });
  }

  /**
   * Applies the soft filter.
   */
  public soft(): this {
    return this.setEqualizer(softEqualizer);
  }

  /**
   * Applies the TV filter.
   */
  public tv(): this {
    return this.setEqualizer(tvEqualizer);
  }

  /**
   * Applies the treble bass filter.
   */
  public trebleBass(): this {
    return this.setEqualizer(trebleBassEqualizer);
  }

  /**
   * Applies the vaporwave filter.
   */
  public vaporwave(): this {
    this.setEqualizer(vaporwaveEqualizer);
    return this.setTimescale({ pitch: 0.55 });
  }

  /**
   * Applies the distortion filter.
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
    });
  }

  /**
   * Applies the karaoke options specified by the filter.
   */
  public setKaraoke(karaoke?: karaokeOptions): this {
    this.karaoke = karaoke || null;
    this.updateFilters();

    return this;
  }

  /**
   * Applies the timescale options specified by the filter.
   */
  public setTimescale(timescale?: timescaleOptions): this {
    this.timescale = timescale || null;
    this.updateFilters();

    return this;
  }

  /**
   * Applies the vibrato options specified by the filter.
   */
  public setVibrato(vibrato?: vibratoOptions): this {
    this.vibrato = vibrato || null;
    this.updateFilters();
    return this;
  }

  /**
   * Applies the rotation options specified by the filter.
   */
  public setRotation(rotation?: rotationOptions): this {
    this.rotation = rotation || null;
    this.updateFilters();

    return this;
  }

  public setDistortion(distortion?: distortionOptions): this {
    this.distortion = distortion || null;
    this.updateFilters();

    return this;
  }
  /**
   * Clears the filters.
   */
  public clearFilters(): this {
    this.player.filters = new Filters(this.player);
    this.updateFilters();
    return this;
  }

  /**
   * Updates the filters.
   */
  public updateFilters(): this {
    const {
      equalizer,
      karaoke,
      timescale,
      vibrato,
      rotation,
      volume,
      distortion,
    } = this;

    this.player.node.rest.updatePlayer({
      guildId: this.player.guild,
      data: {
        filters: {
          volume,
          equalizer,
          karaoke,
          timescale,
          vibrato,
          rotation,
          distortion,
        },
      },
    });

    return this;
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

const bassBoostEqualizer: Band[] = [
  { band: 0, gain: 3.2 },
  { band: 1, gain: 0.2 },
  { band: 2, gain: 0.2 },
  { band: 3, gain: 0.2 },
  { band: 4, gain: 0.2 },
  { band: 5, gain: 0.2 },
  { band: 6, gain: 0.2 },
];

const softEqualizer: Band[] = [
  { band: 0, gain: 0 },
  { band: 1, gain: 0 },
  { band: 2, gain: 0 },
  { band: 3, gain: 0 },
  { band: 4, gain: 0 },
  { band: 5, gain: 0 },
  { band: 6, gain: 0 },
  { band: 7, gain: 0 },
  { band: 8, gain: -0.25 },
  { band: 9, gain: -0.25 },
  { band: 10, gain: -0.25 },
  { band: 11, gain: -0.25 },
  { band: 12, gain: -0.25 },
  { band: 13, gain: -0.25 },
];

const tvEqualizer: Band[] = [
  { band: 0, gain: 0 },
  { band: 1, gain: 0 },
  { band: 2, gain: 0 },
  { band: 3, gain: 0 },
  { band: 4, gain: 0 },
  { band: 5, gain: 0 },
  { band: 6, gain: 0 },
  { band: 7, gain: 0.65 },
  { band: 8, gain: 0.65 },
  { band: 9, gain: 0.65 },
  { band: 10, gain: 0.65 },
  { band: 11, gain: 0.65 },
  { band: 12, gain: 0.65 },
  { band: 13, gain: 0.65 },
];

const trebleBassEqualizer: Band[] = [
  { band: 0, gain: 0.6 },
  { band: 1, gain: 0.67 },
  { band: 2, gain: 0.67 },
  { band: 3, gain: 0 },
  { band: 4, gain: -0.5 },
  { band: 5, gain: 0.15 },
  { band: 6, gain: -0.45 },
  { band: 7, gain: 0.23 },
  { band: 8, gain: 0.35 },
  { band: 9, gain: 0.45 },
  { band: 10, gain: 0.55 },
  { band: 11, gain: 0.6 },
  { band: 12, gain: 0.55 },
  { band: 13, gain: 0 },
];

const vaporwaveEqualizer: Band[] = [
  { band: 0, gain: 0 },
  { band: 1, gain: 0 },
  { band: 2, gain: 0 },
  { band: 3, gain: 0 },
  { band: 4, gain: 0 },
  { band: 5, gain: 0 },
  { band: 6, gain: 0 },
  { band: 7, gain: 0 },
  { band: 8, gain: 0.15 },
  { band: 9, gain: 0.15 },
  { band: 10, gain: 0.15 },
  { band: 11, gain: 0.15 },
  { band: 12, gain: 0.15 },
  { band: 13, gain: 0.15 },
];

/** Represents an equalizer band. */
interface Band {
  /** The index of the equalizer band. */
  band: number;
  /** The gain value of the equalizer band. */
  gain: number;
}
