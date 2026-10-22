import test from "node:test";
import assert from "node:assert/strict";
import { MilestonePlayback, MILESTONE_AUDIO } from "../src/milestoneAudio";
import { readAudioPreference, readAudioVolume } from "../src/audio";
import {
  coreMilestonePlaybackReset,
  companionMilestonePlaybackReset,
} from "../src/game/milestones";
import { createGame, reduceGame } from "./helpers";
import { companionSnapshot } from "../src/game/companionProtocol";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness() {
  const sources: {
    buffer: string | null;
    onended: (() => void) | null;
    starts: number;
    stops: number;
    disconnects: number;
    connect(destination: string): void;
    disconnect(): void;
    start(): void;
    stop(): void;
  }[] = [];
  const loads: {
    url: string;
    signal: AbortSignal;
    result: ReturnType<typeof deferred<ArrayBuffer>>;
  }[] = [];
  const decodes: ReturnType<typeof deferred<string>>[] = [];
  let enabled = true;
  const context = {
    state: "running",
    decodeAudioData(_bytes: ArrayBuffer) {
      const result = deferred<string>();
      decodes.push(result);
      return result.promise;
    },
    createBufferSource() {
      const source = {
        buffer: null as string | null,
        onended: null as (() => void) | null,
        starts: 0,
        stops: 0,
        disconnects: 0,
        connect(destination: string) {
          assert.equal(destination, "effects-master");
        },
        disconnect() {
          this.disconnects++;
        },
        start() {
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(source);
      return source;
    },
  };
  const player = new MilestonePlayback<string, string>(
    () => (enabled ? { context, destination: "effects-master" } : null),
    (url, signal) => {
      const result = deferred<ArrayBuffer>();
      loads.push({ url, signal, result });
      return result.promise;
    },
  );
  return {
    player,
    context,
    sources,
    loads,
    decodes,
    enable(value: boolean) {
      enabled = value;
    },
    async loaded(index: number, value = "decoded-voice") {
      loads[index].result.resolve(new ArrayBuffer(4));
      await Promise.resolve();
      decodes.at(-1)!.resolve(value);
      await Promise.resolve();
    },
  };
}

test("muted, disabled and autoplay-suspended milestones neither fetch nor queue a later voice", async () => {
  const h = harness();
  h.enable(false);
  await h.player.play("act");
  h.enable(true);
  h.context.state = "suspended";
  await h.player.play("agenda");
  h.context.state = "running";
  assert.equal(h.loads.length, 0);
  assert.equal(h.sources.length, 0);
});

test("one real local voice plays through the effects bus and subsequent endings reuse its decoded buffer", async () => {
  const h = harness();
  const play = h.player.play("victory");
  assert.equal(h.loads[0].url, "/audio/fish-ending.mp3");
  await h.loaded(0);
  await play;
  assert.equal(h.sources[0].starts, 1);
  assert.equal(h.sources[0].buffer, "decoded-voice");
  await h.player.play("ended");
  assert.equal(h.sources[0].stops, 1);
  assert.equal(h.sources[0].disconnects, 1);
  assert.equal(h.loads.length, 1);
  assert.equal(h.sources[1].starts, 1);
  assert.equal(MILESTONE_AUDIO.defeat, MILESTONE_AUDIO.ended);
});

test("leaving or muting during fetch aborts it and a transport ignoring abort cannot start or decode", async () => {
  const h = harness();
  const play = h.player.play("act");
  h.player.cancel();
  assert.equal(h.loads[0].signal.aborted, true);
  h.loads[0].result.resolve(new ArrayBuffer(4));
  await play;
  assert.equal(h.decodes.length, 0);
  assert.equal(h.sources.length, 0);
});

test("canceling during unabortable decoding suppresses late audio even after effects are enabled again", async () => {
  const h = harness();
  const play = h.player.play("agenda");
  h.loads[0].result.resolve(new ArrayBuffer(4));
  await Promise.resolve();
  h.enable(false);
  h.player.cancel();
  h.enable(true);
  h.decodes[0].resolve("late-voice");
  await play;
  assert.equal(h.sources.length, 0);
});

test("a superseding milestone wins when two decode operations finish out of order", async () => {
  const h = harness();
  const act = h.player.play("act");
  h.loads[0].result.resolve(new ArrayBuffer(4));
  await Promise.resolve();
  const agenda = h.player.play("agenda");
  await h.loaded(1, "agenda");
  await agenda;
  h.decodes[0].resolve("old-act");
  await act;
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].buffer, "agenda");
  h.player.cancel();
  assert.equal(h.sources[0].stops, 1);
  assert.equal(h.sources[0].disconnects, 1);
});

test("visibility, volume or autoplay changes during decoding prevent a start without queuing replay", async () => {
  const h = harness();
  const play = h.player.play("act");
  h.loads[0].result.resolve(new ArrayBuffer(4));
  await Promise.resolve();
  h.enable(false);
  h.decodes[0].resolve("finished-while-hidden");
  await play;
  h.enable(true);
  assert.equal(h.sources.length, 0);
  // A separate new event may use the decoded local buffer.
  await h.player.play("act");
  assert.equal(h.loads.length, 1);
  assert.equal(h.sources[0].starts, 1);
});

test("missing files and corrupt audio resolve harmlessly and a later new event can retry", async () => {
  const h = harness();
  const missing = h.player.play("act");
  h.loads[0].result.reject(new Error("offline or 404"));
  await missing;
  const corrupt = h.player.play("act");
  h.loads[1].result.resolve(new ArrayBuffer(4));
  await Promise.resolve();
  h.decodes[0].reject(new Error("decode failed"));
  await corrupt;
  const next = h.player.play("act");
  await h.loaded(2);
  await next;
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].starts, 1);
});

test("a naturally ended voice disconnects once and later cancellation does not stop the ended source", async () => {
  const h = harness();
  const play = h.player.play("agenda");
  await h.loaded(0);
  await play;
  h.sources[0].onended!();
  h.player.cancel();
  assert.equal(h.sources[0].disconnects, 1);
  assert.equal(h.sources[0].stops, 0);
});

test("an actual Core undo invalidates a pending voice; ordinary forward updates retain it", async () => {
  const opening = createGame("easy", 712);
  const before = reduceGame(opening, { type: "mulligan", ids: [] });
  const after = reduceGame(before, { type: "act", kind: "resource" });
  assert.equal(coreMilestonePlaybackReset(before, after), false);
  assert.equal(coreMilestonePlaybackReset(after, before), true);
  assert.equal(
    coreMilestonePlaybackReset(after, structuredClone(after)),
    false,
  );
  const h = harness();
  const play = h.player.play("act");
  h.loads[0].result.resolve(new ArrayBuffer(4));
  await Promise.resolve();
  if (coreMilestonePlaybackReset(after, before)) h.player.cancel();
  h.decodes[0].resolve("obsolete-act");
  await play;
  assert.equal(h.sources.length, 0);
});

test("native rewind and public scenario/seat changes cancel an active voice, while equal polls do not", async () => {
  const before = companionSnapshot({
    playerId: "own-player",
    game: {
      id: "native-game",
      scenarioSteps: 50,
      mode: { That: { id: "c:barkham:022", started: true } },
    },
  });
  assert.equal(
    companionMilestonePlaybackReset(before, structuredClone(before)),
    false,
  );
  const forward = structuredClone(before);
  forward.step++;
  assert.equal(companionMilestonePlaybackReset(before, forward), false);
  const rewind = structuredClone(before);
  rewind.step--;
  const scenario = structuredClone(forward);
  scenario.game = {
    ...scenario.game,
    mode: { That: { id: "70001", started: true } },
  };
  const seat = structuredClone(forward);
  seat.playerId = "another-player";
  for (const reset of [rewind, scenario, seat]) {
    assert.equal(companionMilestonePlaybackReset(before, reset), true);
    const h = harness();
    const play = h.player.play("act");
    await h.loaded(0);
    await play;
    if (companionMilestonePlaybackReset(before, reset)) h.player.cancel();
    assert.equal(h.sources[0].stops, 1);
  }
});

test("saved volume is finite and bounded; absent or inaccessible preferences keep sound opt-in", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
    },
  });
  try {
    assert.equal(readAudioPreference("effects"), false);
    assert.equal(readAudioVolume(), 0.75);
    for (const [raw, expected] of [
      ["0", 0],
      ["0.3", 0.3],
      ["2", 1],
      ["-1", 0],
      ["NaN", 0.75],
      ["", 0.75],
    ] as const) {
      stored.set("arkham-chronicle:volume", raw);
      assert.equal(readAudioVolume(), expected);
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    assert.equal(readAudioVolume(), 0.75);
    assert.equal(readAudioPreference("effects"), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
