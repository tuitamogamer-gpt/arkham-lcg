import type { MotionKind } from "./game/motion";
import type { MilestoneKind } from "./game/milestones";
import { MilestonePlayback } from "./milestoneAudio";

// Ambience and ordinary effects are synthesized. Significant-event voices are
// finite, local Fish Audio clips. Sound never influences the rules and stays
// off until the player enables it.
export type SfxKind =
  | "card"
  | "token"
  | "attack"
  | "damage"
  | "horror"
  | "heal"
  | "fire"
  | "story"
  | "success"
  | "failure"
  | "clue"
  | "coin"
  | "reveal"
  | "defeat";
const KEYS = {
  ambience: "arkham-chronicle:ambience",
  effects: "arkham-chronicle:effects",
  muted: "arkham-chronicle:muted",
} as const;
const VOLUME_KEY = "arkham-chronicle:volume";
export function readAudioVolume() {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored === null || stored.trim() === "") return 0.75;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.75;
  } catch {
    return 0.75;
  }
}
export function readAudioPreference(kind: keyof typeof KEYS) {
  try {
    return localStorage.getItem(KEYS[kind]) === "on";
  } catch {
    return false;
  }
}
function persist(kind: keyof typeof KEYS, on: boolean) {
  try {
    localStorage.setItem(KEYS[kind], on ? "on" : "off");
  } catch {
    /* Optional preference. */
  }
}
const PRIORITY: Partial<Record<MotionKind, [SfxKind, number]>> = {
  story: ["story", 10],
  resign: ["story", 9],
  defeat: ["defeat", 9],
  attack: ["attack", 8],
  fire: ["fire", 7],
  damage: ["damage", 6],
  horror: ["horror", 6],
  reveal: ["reveal", 5],
  engage: ["reveal", 4],
  heal: ["heal", 4],
  investigate: ["clue", 4],
  gain: ["coin", 3],
  boost: ["coin", 2],
  draw: ["card", 2],
  play: ["card", 2],
  discard: ["card", 2],
  commit: ["card", 2],
  evade: ["card", 2],
  move: ["card", 1],
  extinguish: ["card", 1],
};

export class ArkhamAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effectBus: GainNode | null = null;
  private ambienceStop: (() => void) | null = null;
  private effects = false;
  private muted = readAudioPreference("muted");
  private volume = readAudioVolume();
  private lastPlayed = new Map<SfxKind, number>();
  private voices = new MilestonePlayback<AudioBuffer, AudioNode>(() =>
    this.effects &&
    !this.muted &&
    this.volume > 0 &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    this.ctx &&
    this.effectBus
      ? { context: this.ctx, destination: this.effectBus }
      : null,
  );
  private resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {});
  }
  constructor() {
    if (typeof document === "undefined") return;
    // Browsers only start audio after a gesture; resume quietly on any input.
    const resume = () => {
      this.resume();
    };
    document.addEventListener("pointerdown", resume, true);
    document.addEventListener("keydown", resume, true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") this.stopMilestone();
    });
    window.addEventListener("pagehide", () => this.stopMilestone());
  }
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Context =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Context();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * 0.9;
      this.master.connect(this.ctx.destination);
      this.effectBus = this.ctx.createGain();
      this.effectBus.gain.value = this.effects ? 1 : 0;
      this.effectBus.connect(this.master);
      return this.ctx;
    } catch {
      return null;
    }
  }
  private noise(ctx: AudioContext, seconds: number, brown = false) {
    const buffer = ctx.createBuffer(
      1,
      Math.max(1, Math.floor(ctx.sampleRate * seconds)),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else data[i] = white;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }
  private tone(
    ctx: AudioContext,
    dest: AudioNode,
    options: {
      freq: number;
      end?: number;
      type?: OscillatorType;
      duration: number;
      gain: number;
      at?: number;
    },
  ) {
    const at = ctx.currentTime + (options.at || 0);
    const osc = ctx.createOscillator();
    osc.type = options.type || "sine";
    osc.frequency.setValueAtTime(options.freq, at);
    if (options.end)
      osc.frequency.exponentialRampToValueAtTime(
        options.end,
        at + options.duration,
      );
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.gain, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.duration);
    osc.connect(gain).connect(dest);
    osc.start(at);
    osc.stop(at + options.duration + 0.05);
  }
  private burst(
    ctx: AudioContext,
    dest: AudioNode,
    options: {
      duration: number;
      type: BiquadFilterType;
      freq: number;
      q?: number;
      gain: number;
      at?: number;
    },
  ) {
    const at = ctx.currentTime + (options.at || 0);
    const source = this.noise(ctx, options.duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.value = options.freq;
    filter.Q.value = options.q ?? 1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.gain, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.duration);
    source.connect(filter).connect(gain).connect(dest);
    source.start(at);
    source.stop(at + options.duration + 0.05);
  }
  /** Returns false when the browser cannot start audio at all. */
  setAmbience(on: boolean): boolean {
    persist("ambience", on);
    if (!on) {
      this.ambienceStop?.();
      this.ambienceStop = null;
      return true;
    }
    const ctx = this.ensure();
    if (!ctx) return false;
    this.resume();
    if (this.ambienceStop) return true;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 3);
    out.connect(this.master!);
    // Wind: slow brown noise through a low-pass filter, breathing with an LFO.
    const wind = this.noise(ctx, 4, true);
    wind.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 230;
    lowpass.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.3;
    lfo.connect(lfoDepth).connect(windGain.gain);
    wind.connect(lowpass).connect(windGain).connect(out);
    // A very low drone and its fifth, barely audible.
    const drone = ctx.createOscillator();
    drone.frequency.value = 52;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.11;
    drone.connect(droneGain).connect(out);
    const fifth = ctx.createOscillator();
    fifth.type = "triangle";
    fifth.frequency.value = 78;
    const fifthGain = ctx.createGain();
    fifthGain.gain.value = 0.035;
    fifth.connect(fifthGain).connect(out);
    // Distant embers.
    const embers = window.setInterval(() => {
      if (Math.random() < 0.55)
        this.burst(ctx, out, {
          duration: 0.05 + Math.random() * 0.05,
          type: "bandpass",
          freq: 1800 + Math.random() * 1600,
          q: 2.5,
          gain: 0.05 + Math.random() * 0.05,
        });
    }, 380);
    wind.start();
    lfo.start();
    drone.start();
    fifth.start();
    this.ambienceStop = () => {
      window.clearInterval(embers);
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35);
      window.setTimeout(() => {
        for (const node of [wind, lfo, drone, fifth]) node.stop();
        out.disconnect();
      }, 1600);
    };
    return true;
  }
  setEffects(on: boolean) {
    this.effects = on;
    persist("effects", on);
    if (on) this.ensure();
    if (this.effectBus) this.effectBus.gain.value = on ? 1 : 0;
    if (on) this.resume();
    else this.stopMilestone();
  }
  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {}
    if (this.master)
      this.master.gain.value = this.muted ? 0 : this.volume * 0.9;
    if (this.volume === 0) this.stopMilestone();
  }
  setMuted(on: boolean) {
    this.muted = on;
    persist("muted", on);
    if (this.master) this.master.gain.value = on ? 0 : this.volume * 0.9;
    if (on) this.stopMilestone();
  }
  playMilestone(kind: MilestoneKind) {
    void this.voices.play(kind);
  }
  stopMilestone() {
    this.voices.cancel();
  }
  play(kind: SfxKind) {
    if (!this.effects || this.muted || this.volume === 0) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running" || !this.effectBus) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(kind) || 0) < 120) return;
    this.lastPlayed.set(kind, now);
    const out = this.effectBus;
    switch (kind) {
      case "card":
        this.burst(ctx, out, {
          duration: 0.14,
          type: "bandpass",
          freq: 900,
          q: 0.8,
          gain: 0.16,
        });
        break;
      case "coin":
        this.tone(ctx, out, { freq: 2200, duration: 0.09, gain: 0.07 });
        this.tone(ctx, out, {
          freq: 3300,
          duration: 0.12,
          gain: 0.05,
          at: 0.03,
        });
        break;
      case "clue":
        this.tone(ctx, out, { freq: 1568, duration: 0.25, gain: 0.08 });
        this.tone(ctx, out, {
          freq: 2093,
          duration: 0.3,
          gain: 0.05,
          at: 0.07,
        });
        break;
      case "token":
        this.burst(ctx, out, {
          duration: 0.04,
          type: "highpass",
          freq: 3000,
          gain: 0.1,
        });
        this.tone(ctx, out, {
          freq: 1320,
          duration: 0.55,
          gain: 0.12,
          at: 0.02,
        });
        this.tone(ctx, out, {
          freq: 1980,
          duration: 0.35,
          gain: 0.05,
          at: 0.02,
        });
        break;
      case "reveal":
        this.burst(ctx, out, {
          duration: 0.22,
          type: "bandpass",
          freq: 480,
          q: 0.9,
          gain: 0.14,
        });
        this.tone(ctx, out, { freq: 80, end: 55, duration: 0.4, gain: 0.12 });
        break;
      case "attack":
        this.tone(ctx, out, { freq: 120, end: 42, duration: 0.2, gain: 0.3 });
        this.burst(ctx, out, {
          duration: 0.09,
          type: "lowpass",
          freq: 320,
          gain: 0.25,
        });
        break;
      case "damage":
        this.tone(ctx, out, { freq: 100, end: 40, duration: 0.18, gain: 0.22 });
        this.burst(ctx, out, {
          duration: 0.07,
          type: "lowpass",
          freq: 260,
          gain: 0.18,
        });
        break;
      case "horror":
        this.tone(ctx, out, {
          freq: 196,
          duration: 0.7,
          gain: 0.07,
          type: "sawtooth",
        });
        this.tone(ctx, out, {
          freq: 207,
          duration: 0.7,
          gain: 0.07,
          type: "sawtooth",
        });
        this.tone(ctx, out, { freq: 98, end: 70, duration: 0.7, gain: 0.08 });
        break;
      case "heal":
        this.tone(ctx, out, {
          freq: 660,
          duration: 0.22,
          gain: 0.08,
          type: "triangle",
        });
        this.tone(ctx, out, {
          freq: 880,
          duration: 0.3,
          gain: 0.07,
          type: "triangle",
          at: 0.16,
        });
        break;
      case "fire":
        for (let i = 0; i < 7; i++)
          this.burst(ctx, out, {
            duration: 0.05,
            type: "bandpass",
            freq: 2200 + Math.random() * 1500,
            q: 2,
            gain: 0.09,
            at: i * 0.07 + Math.random() * 0.03,
          });
        this.tone(ctx, out, {
          freq: 70,
          duration: 0.6,
          gain: 0.06,
          type: "triangle",
        });
        break;
      case "story":
        this.tone(ctx, out, {
          freq: 659,
          duration: 0.9,
          gain: 0.08,
          type: "triangle",
        });
        this.tone(ctx, out, {
          freq: 988,
          duration: 1.1,
          gain: 0.06,
          type: "triangle",
          at: 0.22,
        });
        break;
      case "success":
        this.tone(ctx, out, {
          freq: 523,
          duration: 0.18,
          gain: 0.08,
          type: "triangle",
        });
        this.tone(ctx, out, {
          freq: 784,
          duration: 0.35,
          gain: 0.08,
          type: "triangle",
          at: 0.14,
        });
        break;
      case "failure":
        this.tone(ctx, out, {
          freq: 392,
          duration: 0.2,
          gain: 0.08,
          type: "triangle",
        });
        this.tone(ctx, out, {
          freq: 262,
          duration: 0.45,
          gain: 0.08,
          type: "triangle",
          at: 0.16,
        });
        break;
      case "defeat":
        this.tone(ctx, out, {
          freq: 220,
          end: 55,
          duration: 1.2,
          gain: 0.12,
          type: "sawtooth",
        });
        this.burst(ctx, out, {
          duration: 0.5,
          type: "lowpass",
          freq: 200,
          gain: 0.12,
        });
        break;
    }
  }
  /** Plays at most two distinct effects for one batch of table changes. */
  cues(kinds: MotionKind[]) {
    if (!this.effects) return;
    const chosen = new Map<SfxKind, number>();
    for (const kind of kinds) {
      const entry = PRIORITY[kind];
      if (entry && (chosen.get(entry[0]) || 0) < entry[1])
        chosen.set(entry[0], entry[1]);
    }
    [...chosen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .forEach(([kind], i) =>
        i ? window.setTimeout(() => this.play(kind), 90) : this.play(kind),
      );
  }
}
export const audio = new ArkhamAudio();
