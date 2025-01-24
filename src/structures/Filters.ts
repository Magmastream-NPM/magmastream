import { Band, bassBoostEqualizer, softEqualizer, trebleBassEqualizer, vaporwaveEqualizer } from "../utils/filtersEqualizers";
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
            clear: false,
            eightD: false,
            soft: false,
            speed: false,
            karaoke: false,
            nightcore: false,
            pop: false,
            vaporwave: false,
            bass: false,
            party: false,
            earrape: false,
            equalizer: false,
            electronic: false,
            radio: false,
            tremolo: false,
            treblebass: false,
            vibrato: false,
            china: false,
            chipmunk: false,
            darthvader: false,
            daycore: false,
            doubletime: false,
            pitch: false,
            rate: false,
            slow: false,
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

    // Implement Filters
    public clear(): this {
        return this.resetFilters().setFilterStatus("clear", true);
    }

    public eightD(): this {
        return this.setRotation({ rotationHz: 0.2 }).setFilterStatus("eightD", true);
    }

    public setTimescale(timescale?: timescaleOptions): this {
		return this.applyFilter({ property: "timescale", value: timescale });
	}
    
    public soft(): this {
        return this.setEqualizer(softEqualizer).setFilterStatus("soft", true);
    }

    public speed(): this {
        return this.setTimescale({ speed: 1.5 }).setFilterStatus("speed", true);
    }

    public karaoke(): this {
        return this.setKaraoke({ level: 1.0, filterBand: 220, filterWidth: 100 }).setFilterStatus("karaoke", true);
    }

    public nightcore(): this {
        return this.setTimescale({ speed: 1.1, pitch: 1.125 }).setFilterStatus("nightcore", true);
    }

    public pop(): this {
        return this.setEqualizer([{ band: 0, gain: 0.6 }, { band: 1, gain: 0.5 }]).setFilterStatus("pop", true);
    }

    public vaporwave(): this {
        return this.setEqualizer(vaporwaveEqualizer).setTimescale({ pitch: 0.55 }).setFilterStatus("vaporwave", true);
    }

    public bass(): this {
        return this.setEqualizer(bassBoostEqualizer).setFilterStatus("bass", true);
    }

    public party(): this {
        return this.setTimescale({ speed: 1.2 }).setFilterStatus("party", true);
    }

    public earrape(): this {
        return this.setVolume(5.0).setFilterStatus("earrape", true);
    }

    public equalizer(): this {
        return this.setEqualizer([{ band: 0, gain: 0.5 }, { band: 1, gain: 0.3 }]).setFilterStatus("equalizer", true);
    }

    public electronic(): this {
        return this.setEqualizer([{ band: 0, gain: 0.8 }, { band: 1, gain: 0.5 }]).setFilterStatus("electronic", true);
    }

    public radio(): this {
        return this.setEqualizer([{ band: 0, gain: -0.5 }, { band: 1, gain: 0.2 }]).setFilterStatus("radio", true);
    }

    public tremolo(): this {
        return this.setVibrato({ frequency: 10, depth: 0.5 }).setFilterStatus("tremolo", true);
    }

    public treblebass(): this {
        return this.setEqualizer(trebleBassEqualizer).setFilterStatus("treblebass", true);
    }

    public vibrato(): this {
        return this.setVibrato({ frequency: 5, depth: 0.2 }).setFilterStatus("vibrato", true);
    }

    public china(): this {
        return this.setTimescale({ pitch: 1.4 }).setFilterStatus("china", true);
    }

    public chipmunk(): this {
        return this.setTimescale({ pitch: 2.0 }).setFilterStatus("chipmunk", true);
    }

    public darthvader(): this {
        return this.setTimescale({ pitch: 0.5 }).setFilterStatus("darthvader", true);
    }

    public daycore(): this {
        return this.setTimescale({ pitch: 0.9, speed: 0.9 }).setFilterStatus("daycore", true);
    }

    public doubletime(): this {
        return this.setTimescale({ speed: 2.0 }).setFilterStatus("doubletime", true);
    }

    public pitch(value: number): this {
        return this.setTimescale({ pitch: value }).setFilterStatus("pitch", true);
    }

    public rate(value: number): this {
        return this.setTimescale({ rate: value }).setFilterStatus("rate", true);
    }

    public slow(): this {
        return this.setTimescale({ speed: 0.7 }).setFilterStatus("slow", true);
    }

    // Resets filters
    private resetFilters(): this {
        this.filterStatus = {
            clear: false,
            eightD: false,
            soft: false,
            speed: false,
            karaoke: false,
            nightcore: false,
            pop: false,
            vaporwave: false,
            bass: false,
            party: false,
            earrape: false,
            equalizer: false,
            electronic: false,
            radio: false,
            tremolo: false,
            treblebass: false,
            vibrato: false,
            china: false,
            chipmunk: false,
            darthvader: false,
            daycore: false,
            doubletime: false,
            pitch: false,
            rate: false,
            slow: false,
        };

        this.equalizer = [];
        this.distortion = null;
        this.karaoke = null;
        this.rotation = null;
        this.timescale = null;
        this.vibrato = null;
        this.volume = 1.0;

        return this;
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
    clear: boolean;
    eightD: boolean;
    soft: boolean;
    speed: boolean;
    karaoke: boolean;
    nightcore: boolean;
    pop: boolean;
    vaporwave: boolean;
    bass: boolean;
    party: boolean;
    earrape: boolean;
    equalizer: boolean;
    electronic: boolean;
    radio: boolean;
    tremolo: boolean;
    treblebass: boolean;
    vibrato: boolean;
    china: boolean;
    chipmunk: boolean;
    darthvader: boolean;
    daycore: boolean;
    doubletime: boolean;
    pitch: boolean;
    rate: boolean;
    slow: boolean;
}
