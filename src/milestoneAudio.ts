import type { MilestoneKind } from "./game/milestones";

export const MILESTONE_AUDIO = {
  act: "/audio/fish-act.mp3",
  agenda: "/audio/fish-agenda.mp3",
  victory: "/audio/fish-ending.mp3",
  defeat: "/audio/fish-ending.mp3",
  ended: "/audio/fish-ending.mp3",
} satisfies Record<MilestoneKind, string>;

interface VoiceSource<Buffer, Destination> {
  buffer: Buffer | null;
  onended: ((...args: any[]) => void) | null;
  connect(destination: Destination): unknown;
  disconnect(): void;
  start(): void;
  stop(): void;
}

export interface VoiceOutput<Buffer, Destination> {
  context: {
    state: string;
    decodeAudioData(bytes: ArrayBuffer): Promise<Buffer>;
    createBufferSource(): VoiceSource<Buffer, Destination>;
  };
  destination: Destination;
}

/** One finite decorative voice, never a queue. The output callback checks the
 * current opt-in, mute, volume, visibility and autoplay state at both ends of
 * every asynchronous load. Canceled loads may finish decoding but cannot play.
 */
export class MilestonePlayback<Buffer = AudioBuffer, Destination = AudioNode> {
  private serial = 0;
  private pending: AbortController | null = null;
  private source: VoiceSource<Buffer, Destination> | null = null;
  private cache = new Map<string, Buffer>();

  constructor(
    private output: () => VoiceOutput<Buffer, Destination> | null,
    private load: (
      url: string,
      signal: AbortSignal,
    ) => Promise<ArrayBuffer> = async (url, signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("Optional sound unavailable.");
      return response.arrayBuffer();
    },
  ) {}

  cancel() {
    this.serial++;
    this.pending?.abort();
    this.pending = null;
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // It may already have ended between the visibility event and cleanup.
      }
      try {
        source.disconnect();
      } catch {}
    }
  }

  async play(kind: MilestoneKind): Promise<void> {
    this.cancel();
    const initial = this.output();
    if (!initial || initial.context.state !== "running") return;
    const serial = this.serial;
    const url = MILESTONE_AUDIO[kind];
    const pending = new AbortController();
    this.pending = pending;
    try {
      let buffer = this.cache.get(url);
      if (!buffer) {
        const bytes = await this.load(url, pending.signal);
        if (serial !== this.serial || pending.signal.aborted) return;
        buffer = await initial.context.decodeAudioData(bytes);
        if (serial !== this.serial || pending.signal.aborted) return;
        this.cache.set(url, buffer);
      }
      const current = this.output();
      if (
        serial !== this.serial ||
        pending.signal.aborted ||
        !current ||
        current.context !== initial.context ||
        current.context.state !== "running"
      )
        return;
      const source = current.context.createBufferSource();
      source.buffer = buffer;
      source.connect(current.destination);
      source.onended = () => {
        if (this.source === source) this.source = null;
        try {
          source.disconnect();
        } catch {}
      };
      this.source = source;
      source.start();
    } catch {
      // Missing audio, failed decoding and autoplay errors are decorative only.
      if (serial === this.serial) this.cancel();
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }
}
