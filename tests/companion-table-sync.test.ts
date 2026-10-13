import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompanionTableSync,
  type CompanionConnectionStatus,
} from "../src/game/companionTableSync";

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
  const statuses: CompanionConnectionStatus[] = [];
  const games: string[] = [];
  const errors: unknown[] = [];
  const sync = createCompanionTableSync({
    readStep: async () => ({ step: 1 }),
    readGame: async () => "latest table",
    ...overrides,
    change: (game) => games.push(game),
    status: (status) => statuses.push(status),
    error: (cause) => errors.push(cause),
  });
  return { sync, statuses, games, errors };
}

test("an initial connection failure never confirms a table or permits an action", async () => {
  const failure = new Error("companion unavailable");
  const f = fixture({
    readGame: async () => {
      throw failure;
    },
  });
  assert.equal(f.sync.status, "connecting");
  await f.sync.refresh();
  assert.deepEqual(f.statuses, ["disconnected"]);
  assert.deepEqual(f.games, []);
  assert.deepEqual(f.errors, [failure]);
  await assert.rejects(
    f.sync.perform(async () => assert.fail("Sent a choice without a table.")),
    /latest table to be confirmed/,
  );
});

test("a sent action remains unconfirmed until its full reload finishes", async () => {
  const action = deferred<void>(),
    reading = deferred<void>(),
    result = deferred<string>();
  let reads = 0;
  const f = fixture({
    readGame: async () => {
      if (++reads === 1) return "before action";
      reading.resolve();
      return result.promise;
    },
  });
  await f.sync.refresh();
  const pending = f.sync.perform(() => action.promise);
  assert.equal(f.sync.status, "updating");
  action.resolve();
  await reading.promise;
  assert.equal(f.sync.status, "confirming");
  await assert.rejects(
    f.sync.perform(async () =>
      assert.fail("Repeated an action during reload."),
    ),
    /latest table to be confirmed/,
  );
  result.resolve("after action");
  await pending;
  assert.deepEqual(f.statuses, [
    "confirmed",
    "updating",
    "confirming",
    "confirmed",
  ]);
  assert.deepEqual(f.games, ["before action", "after action"]);
});

test("a lost action response blocks duplicate submission and recovery only reads", async () => {
  let table = "before action",
    reads = 0,
    actions = 0;
  const f = fixture({
    // The revision endpoint can remain unchanged while recovering. A full
    // snapshot is required even in that case; a step-only poll cannot unlock.
    readGame: async () => {
      reads++;
      return table;
    },
  });
  await f.sync.refresh();
  const submit = async () => {
    actions++;
    table = "accepted by the companion";
    throw new Error("response lost");
  };
  await assert.rejects(f.sync.perform(submit), /response lost/);
  assert.equal(f.sync.status, "unconfirmed");
  await assert.rejects(f.sync.perform(submit), /latest table to be confirmed/);
  assert.equal(actions, 1);
  assert.equal(reads, 1);
  await f.sync.poll();
  assert.equal(actions, 1, "Recovery must not resubmit an uncertain action.");
  assert.equal(reads, 2);
  assert.equal(f.sync.status, "confirmed");
  assert.deepEqual(f.games, ["before action", "accepted by the companion"]);
});

test("a successful action with a failed reload stays unconfirmed through further errors", async () => {
  let reads = 0;
  const f = fixture({
    readGame: async () => {
      if (++reads === 1) return "before action";
      if (reads < 4) throw new Error("read unavailable");
      return "after action";
    },
  });
  await f.sync.refresh();
  await assert.rejects(
    f.sync.perform(async () => {}),
    /read unavailable/,
  );
  assert.equal(f.sync.status, "unconfirmed");
  await f.sync.poll();
  assert.equal(f.sync.status, "unconfirmed");
  assert.deepEqual(f.games, ["before action"]);
  await f.sync.refresh();
  assert.equal(f.sync.status, "confirmed");
  assert.deepEqual(f.games, ["before action", "after action"]);
});

test("a failed background poll locks stale choices and recovery reloads an unchanged step", async () => {
  let available = true,
    reads = 0;
  const f = fixture({
    readStep: async () => {
      if (!available) throw new Error("connection interrupted");
      return { step: 1 };
    },
    readGame: async () => `table ${++reads}`,
  });
  await f.sync.refresh();
  available = false;
  await f.sync.poll();
  assert.equal(f.sync.status, "disconnected");
  await assert.rejects(
    f.sync.perform(async () =>
      assert.fail("Sent a stale choice while disconnected."),
    ),
    /latest table to be confirmed/,
  );
  available = true;
  await f.sync.poll();
  assert.equal(f.sync.status, "confirmed");
  assert.deepEqual(f.games, ["table 1", "table 2"]);
});

test("leaving a table prevents a late action response from confirming the next session", async () => {
  const action = deferred<void>();
  const f = fixture();
  await f.sync.refresh();
  const pending = f.sync.perform(() => action.promise);
  f.sync.dispose();
  action.resolve();
  await pending;
  assert.deepEqual(f.statuses, ["confirmed", "updating"]);
  assert.deepEqual(f.games, ["latest table"]);
});
