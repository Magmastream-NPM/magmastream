import { Player } from "./Player";

export class Filters {
  public player: Player;
  public volume: number;
  public equalizer: Band[];
  public vibrato: vibratoOptions;
  public rotation: rotationOptions;
  public timescale: timescaleOptions;
  public karaoke: karaokeOptions;
  public distortion: distortionOptions;

  constructor(player: Player) {
    this.player = player;
    this.volume = 1.0;
    this.equalizer = [];
    this.vibrato = null;
    this.rotation = null;
    this.timescale = null;
    this.karaoke = null;
    this.distortion = null;
  }

  private updateFilters(): this {
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

  private applyFilter(
    filter: {
      property: keyof Filters;
      value: any;
    },
    updateFilters: boolean = true
  ): this {
    this[filter.property] = filter.value;
    if (updateFilters) {
      this.updateFilters();
    }
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
    return this.setRotation({ rotationHz: 0.2 });
  }

  /** Applies the bass boost effect. */
  public bassBoost(): this {
    return this.setEqualizer(bassBoostEqualizer);
  }

  /** Applies the nightcore effect. */
  public nightcore(): this {
    return this.setTimescale({
      speed: 1.1,
      pitch: 1.125,
      rate: 1.05,
    });
  }

  /** Applies the slow motion audio effect. */
  public slowmo(): this {
    return this.setTimescale({
      speed: 0.7,
      pitch: 1.0,
      rate: 0.8,
    });
  }

  /** Applies the soft audio effect. */
  public soft(): this {
    return this.setEqualizer(softEqualizer);
  }

  /** Applies the television audio effect. */
  public tv(): this {
    return this.setEqualizer(tvEqualizer);
  }

  /** Applies the treble bass effect. */
  public trebleBass(): this {
    return this.setEqualizer(trebleBassEqualizer);
  }

  /** Applies the vaporwave effect. */
  public vaporwave(): this {
    return this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 });
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
    });
  }

  /** Applies the karaoke options specified by the filter. */
  public setKaraoke(karaoke?: karaokeOptions): this {
    return this.applyFilter({ property: "karaoke", value: karaoke });
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

  /** Removes the audio effects. */
  public clearFilters(): this {
    this.player.filters = new Filters(this.player);
    this.updateFilters();
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

/** Represents an equalizer band. */
interface Band {
  /** The index of the equalizer band. */
  band: number;
  /** The gain value of the equalizer band. */
  gain: number;
}

const bassBoostEqualizer: Band[] = [
  { band: 0, gain: 0.2 },
  { band: 1, gain: 0.15 },
  { band: 2, gain: 0.1 },
  { band: 3, gain: 0.05 },
  { band: 4, gain: 0.0 },
  { band: 5, gain: -0.05 },
  { band: 6, gain: -0.1 },
  { band: 7, gain: -0.1 },
  { band: 8, gain: -0.1 },
  { band: 9, gain: -0.1 },
  { band: 10, gain: -0.1 },
  { band: 11, gain: -0.1 },
  { band: 12, gain: -0.1 },
  { band: 13, gain: -0.1 },
  { band: 14, gain: -0.1 },
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
