import test from "node:test";
import assert from "node:assert/strict";
import { createCompanionSync } from "../src/game/companionSync";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture(
  overrides: {
    readGame?: () => Promise<string>;
    readStep?: () => Promise<{ step: number }>;
  } = {},
) {
  const games: string[] = [];
  const errors: unknown[] = [];
  const busy: boolean[] = [];
  const sync = createCompanionSync({
    readStep: async () => ({ step: 1 }),
    readGame: async () => "saved game",
    ...overrides,
    change: (game) => games.push(game),
    error: (cause) => errors.push(cause),
    busy: (value) => busy.push(value),
  });
  return { sync, games, errors, busy };
}

test("repeated poll ticks cannot starve a slow initial game read", async () => {
  const started = deferred<void>(),
    result = deferred<string>();
  let reads = 0;
  const f = fixture({
    readGame: () => {
      reads++;
      started.resolve();
      return result.promise;
    },
  });
  const opening = f.sync.refresh();
  await started.promise;
  const ticks = Array.from({ length: 5 }, () => f.sync.poll());
  const reconnect = f.sync.refresh();
  assert.equal(reads, 1);
  result.resolve("initial game");
  await Promise.all([opening, reconnect, ...ticks]);
  assert.deepEqual(f.games, ["initial game"]);
  await f.sync.poll();
  assert.equal(reads, 1, "An unchanged revision needs no full game reload.");
});

test("slow revision checks share one poll through the entire game reload", async () => {
  const checking = deferred<void>(),
    revision = deferred<{ step: number }>();
  let checks = 0,
    reads = 0;
  const f = fixture({
    readStep: () => {
      checks++;
      if (checks === 3) {
        checking.resolve();
        return revision.promise;
      }
      return Promise.resolve({ step: checks < 3 ? 1 : 2 });
    },
    readGame: async () => `game ${++reads}`,
  });
  await f.sync.refresh();
  const poll = f.sync.poll();
  await checking.promise;
  const ticks = Array.from({ length: 5 }, () => f.sync.poll());
  assert.equal(checks, 3);
  revision.resolve({ step: 2 });
  await Promise.all([poll, ...ticks]);
  assert.deepEqual(f.games, ["game 1", "game 2"]);
  assert.equal(checks, 5);
});

test("a choice publishes its authoritative reload while a stale read is still pending", async () => {
  const started = deferred<void>(),
    stale = deferred<string>();
  let reads = 0,
    choices = 0;
  const f = fixture({
    readGame: () => {
      if (++reads === 1) {
        started.resolve();
        return stale.promise;
      }
      return Promise.resolve("after choice");
    },
  });
  const background = f.sync.refresh();
  await started.promise;
  await f.sync.perform(async () => {
    choices++;
  });
  assert.deepEqual(f.games, ["after choice"]);
  stale.resolve("before choice");
  await background;
  assert.deepEqual(f.games, ["after choice"]);
  assert.deepEqual(f.busy, [true, false]);
  assert.equal(choices, 1);
});

test("an obsolete failure cannot overwrite a successful choice or release a newer read", async () => {
  const firstStarted = deferred<void>(),
    first = deferred<string>();
  const lastStarted = deferred<void>(),
    last = deferred<string>();
  let reads = 0;
  const f = fixture({
    readGame: () => {
      if (++reads === 1) {
        firstStarted.resolve();
        return first.promise;
      }
      if (reads === 2) return Promise.resolve("after choice");
      lastStarted.resolve();
      return last.promise;
    },
  });
  const old = f.sync.refresh();
  await firstStarted.promise;
  await f.sync.perform(async () => {});
  const newer = f.sync.refresh();
  await lastStarted.promise;
  first.reject(new Error("obsolete connection error"));
  await old;
  const tick = f.sync.poll();
  assert.equal(reads, 3);
  last.resolve("latest game");
  await Promise.all([newer, tick]);
  assert.deepEqual(f.games, ["after choice", "latest game"]);
  assert.deepEqual(f.errors, []);
});

test("a revision check started before a choice cannot launch a later stale reload", async () => {
  const started = deferred<void>(),
    stale = deferred<{ step: number }>();
  let checks = 0,
    reads = 0;
  const f = fixture({
    readStep: () => {
      if (++checks === 1) {
        started.resolve();
        return stale.promise;
      }
      return Promise.resolve({ step: 2 });
    },
    readGame: async () => {
      reads++;
      return "after choice";
    },
  });
  const poll = f.sync.poll();
  await started.promise;
  await f.sync.perform(async () => {});
  stale.resolve({ step: 1 });
  await poll;
  assert.equal(reads, 1);
  assert.deepEqual(f.games, ["after choice"]);
});

test("polls, reconnects and duplicate choices wait until the authoritative reload settles", async () => {
  const choice = deferred<void>(),
    loaded = deferred<void>(),
    game = deferred<string>();
  let choices = 0,
    reads = 0;
  const f = fixture({
    readGame: () => {
      reads++;
      loaded.resolve();
      return game.promise;
    },
  });
  const action = f.sync.perform(() => {
    choices++;
    return choice.promise;
  });
  await Promise.all([
    f.sync.poll(),
    f.sync.refresh(),
    f.sync.perform(async () => {
      choices++;
    }),
  ]);
  assert.equal(reads, 0);
  choice.resolve();
  await loaded.promise;
  await f.sync.poll();
  assert.equal(reads, 1);
  assert.deepEqual(f.busy, [true]);
  game.resolve("after choice");
  await action;
  assert.equal(choices, 1);
  assert.deepEqual(f.busy, [true, false]);
});

test("changing seats disposes old reads, errors and post-choice reloads", async () => {
  for (const failure of [false, true]) {
    const started = deferred<void>(),
      oldGame = deferred<string>();
    const old = fixture({
      readGame: () => {
        started.resolve();
        return oldGame.promise;
      },
    });
    const background = old.sync.refresh();
    await started.promise;
    old.sync.dispose();
    const next = fixture();
    await next.sync.refresh();
    if (failure) oldGame.reject(new Error("departed seat"));
    else oldGame.resolve("departed seat");
    await background;
    await old.sync.refresh();
    await old.sync.perform(async () => {
      assert.fail("Disposed seat submitted a choice.");
    });
    assert.deepEqual(old.games, []);
    assert.deepEqual(old.errors, []);
    assert.deepEqual(next.games, ["saved game"]);
  }
  const choice = deferred<void>();
  let reads = 0;
  const f = fixture({
    readGame: async () => {
      reads++;
      return "departed seat";
    },
  });
  const action = f.sync.perform(() => choice.promise);
  f.sync.dispose();
  choice.resolve();
  await action;
  assert.equal(reads, 0);
  assert.deepEqual(
    f.busy,
    [true],
    "Disposed work must not clear the new seat's busy state.",
  );
});

test("a changing final read retains the earlier revision for the next poll", async () => {
  const revisions = [1, 2, 2, 3, 3, 4, 4, 4, 4];
  let reads = 0;
  const f = fixture({
    readStep: async () => ({ step: revisions.shift()! }),
    readGame: async () => `game ${++reads}`,
  });
  await f.sync.refresh();
  assert.deepEqual(f.games, ["game 3"]);
  await f.sync.poll();
  assert.deepEqual(f.games, ["game 3", "game 4"]);
  assert.equal(revisions.length, 0);
});

test("failed reads and choices release their locks for recovery", async () => {
  let reads = 0;
  const failure = new Error("Connection interrupted");
  const f = fixture({
    readGame: async () => {
      if (++reads === 1) throw failure;
      return "reconnected";
    },
  });
  await f.sync.refresh();
  assert.deepEqual(f.errors, [failure]);
  await assert.rejects(
    f.sync.perform(async () => {
      throw failure;
    }),
    failure,
  );
  assert.deepEqual(f.busy, [true, false]);
  await f.sync.poll();
  assert.deepEqual(f.games, ["reconnected"]);
});
