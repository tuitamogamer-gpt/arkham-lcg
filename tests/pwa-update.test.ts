import test from "node:test";
import assert from "node:assert/strict";
import { createPwaUpdateCoordinator } from "../src/game/pwaUpdate";

function fixture(activate: () => Promise<void> = async () => {}) {
  const events: string[] = [];
  const updates = createPwaUpdateCoordinator({
    activate: async () => {
      events.push("activate");
      await activate();
    },
    reload: () => events.push("reload"),
    announceUpdate: () => events.push("offer update"),
  });
  return { events, updates };
}
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

test("late worker activation saves the latest state immediately before reload", async () => {
  const { events, updates } = fixture();
  let currentRevision = 1;
  await updates.applyUpdate(async () => {
    events.push(`save ${currentRevision}`);
    return true;
  });
  assert.deepEqual(
    events,
    ["activate"],
    "waiting for a worker does not save or reload",
  );
  currentRevision = 2;
  updates.onNeedReload();
  await settled();
  assert.deepEqual(events, ["activate", "save 2", "reload"]);
});

test("rejected or failed saving cancels reload and permits an explicit retry", async () => {
  for (const fail of [
    async () => false,
    async () => {
      throw new Error("storage unavailable");
    },
  ]) {
    const { events, updates } = fixture();
    await updates.applyUpdate(fail);
    updates.onNeedReload();
    await settled();
    assert.deepEqual(events, ["activate", "offer update"]);
    updates.onNeedReload();
    await settled();
    assert.equal(
      events.includes("reload"),
      false,
      "another worker event cannot retry without the player",
    );
    await updates.applyUpdate(async () => {
      events.push("save retry");
      return true;
    });
    assert.deepEqual(events.slice(-2), ["save retry", "reload"]);
    assert.equal(events.filter((event) => event === "activate").length, 1);
  }
});

test("another tab activating a worker only offers an update; the later request still saves", async () => {
  const { events, updates } = fixture();
  updates.onNeedReload();
  await settled();
  assert.deepEqual(events, ["offer update"]);
  await updates.applyUpdate(async () => {
    events.push("save existing worker");
    return true;
  });
  assert.deepEqual(events, ["offer update", "save existing worker", "reload"]);
});

test("duplicate activation and update clicks share one pending save and reload", async () => {
  const { events, updates } = fixture();
  let finishSave!: (saved: boolean) => void;
  await updates.applyUpdate(() => {
    events.push("save");
    return new Promise<boolean>((resolve) => {
      finishSave = resolve;
    });
  });
  updates.onNeedReload();
  updates.onNeedReload();
  await settled();
  const duplicate = updates.applyUpdate(async () => {
    events.push("wrong save");
    return true;
  });
  assert.deepEqual(events, ["activate", "save"]);
  finishSave(true);
  await duplicate;
  assert.deepEqual(events, ["activate", "save", "reload"]);
});

test("an activation failure cancels its reload request and allows a later retry", async () => {
  let failed = true;
  const { events, updates } = fixture(async () => {
    if (failed) throw new Error("worker unavailable");
  });
  await assert.rejects(updates.applyUpdate(), /worker unavailable/);
  assert.deepEqual(events, ["activate", "offer update"]);
  updates.onNeedReload();
  await settled();
  assert.equal(events.includes("reload"), false);
  failed = false;
  await updates.applyUpdate(async () => {
    events.push("save retry");
    return true;
  });
  assert.deepEqual(events.slice(-2), ["save retry", "reload"]);
});
