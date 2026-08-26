/**
 * Getting a server's attention, exactly once.
 *
 * The premise of the whole product is that a server is NOT looking at
 * the screen — they are carrying plates, taking an order at another
 * table, or facing the wrong way. So a request that only changes some
 * pixels has not really arrived.
 *
 * But the failure mode on the other side is worse than silence. §54:
 * a waiter alerted twice for the same request learns to distrust the
 * alert, and a waiter alerted for every request already on screen when
 * they open the app turns the sound off permanently within one shift.
 * Both are easy to cause — the socket and the 30-second poll deliver the
 * same request, and a reconnect replays it — so deduplication is the
 * property this module is really about.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * jsdom-free stubs. The module reaches for localStorage, navigator and
 * AudioContext, none of which exist in the bun test runtime, and the
 * point of the tests is the dedupe logic rather than the browser APIs.
 */
const vibrations: number[][] = [];
const chimes: number[] = [];
let store: Record<string, string> = {};

beforeEach(() => {
  vibrations.length = 0;
  chimes.length = 0;
  store = {};

  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
    // No AudioContext: playRequestChime bails early and we count calls
    // through the spy below instead.
    AudioContext: undefined,
  };
  (globalThis as Record<string, unknown>).navigator = {
    vibrate: (pattern: number[]) => {
      vibrations.push(pattern);
      return true;
    },
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).navigator;
  mock.restore();
});

async function load() {
  const mod = await import("@/lib/staff/alert");
  mod.__resetAnnounced();
  return mod;
}

describe("a new request gets noticed", () => {
  test("the first alert for a request fires", async () => {
    const { alertForRequest } = await load();
    expect(alertForRequest("r1")).toBe(true);
    expect(vibrations.length).toBe(1);
  });

  test("it vibrates even with sound off", async () => {
    // Off is the default, and a silent-but-buzzing alert is the whole
    // point of the default being safe rather than useless.
    const { alertForRequest, soundEnabled } = await load();
    expect(soundEnabled()).toBe(false);
    alertForRequest("r1");
    expect(vibrations.length).toBe(1);
  });

  test("a double pulse, not a single buzz", async () => {
    // Distinguishable from a system notification on the same device.
    const { alertForRequest } = await load();
    alertForRequest("r1");
    expect(vibrations[0]!.length).toBeGreaterThan(1);
  });
});

describe("never twice for the same request", () => {
  test("a repeat call does nothing", async () => {
    const { alertForRequest } = await load();
    expect(alertForRequest("r1")).toBe(true);
    expect(alertForRequest("r1")).toBe(false);
    expect(alertForRequest("r1")).toBe(false);
    expect(vibrations.length).toBe(1);
  });

  test("the socket and the poll can both report the same request", async () => {
    // This is the real-world case: the socket delivers it, then the
    // 30-second poll returns it again in the item list.
    const { alertForRequest } = await load();
    alertForRequest("r1"); // socket
    alertForRequest("r1"); // poll
    alertForRequest("r1"); // reconnect replay
    expect(vibrations.length).toBe(1);
  });

  test("different requests each get their own alert", async () => {
    const { alertForRequest } = await load();
    alertForRequest("r1");
    alertForRequest("r2");
    expect(vibrations.length).toBe(2);
  });

  test("an empty id is ignored rather than alerting", async () => {
    const { alertForRequest } = await load();
    expect(alertForRequest("")).toBe(false);
    expect(vibrations.length).toBe(0);
  });
});

describe("opening the app to a busy floor is silent", () => {
  test("seeded requests never alert", async () => {
    // Otherwise the app buzzes once per request that was already
    // sitting there, which is useless and the fastest way to get a
    // server to turn the sound off for good.
    const { alertForRequest, seedAnnounced } = await load();
    seedAnnounced(["r1", "r2", "r3"]);
    for (const id of ["r1", "r2", "r3"]) alertForRequest(id);
    expect(vibrations.length).toBe(0);
  });

  test("a request arriving AFTER the seed still alerts", async () => {
    const { alertForRequest, seedAnnounced } = await load();
    seedAnnounced(["r1", "r2"]);
    expect(alertForRequest("r3")).toBe(true);
    expect(vibrations.length).toBe(1);
  });

  test("seeding an empty list is harmless", async () => {
    const { alertForRequest, seedAnnounced } = await load();
    seedAnnounced([]);
    expect(alertForRequest("r1")).toBe(true);
  });
});

describe("memory doesn't grow across a long shift", () => {
  test("the remembered set is capped", async () => {
    const { alertForRequest } = await load();
    for (let i = 0; i < 500; i++) alertForRequest(`r${i}`);
    expect(vibrations.length).toBe(500);
    // The most recent are still deduped — which is what matters, since a
    // request from hundreds ago is not about to arrive again.
    expect(alertForRequest("r499")).toBe(false);
    expect(alertForRequest("r498")).toBe(false);
  });
});

describe("the sound setting", () => {
  test("defaults to off", async () => {
    // A service tool that starts making noise the first time somebody
    // opens it in a quiet dining room has made a decision that wasn't
    // its to make.
    const { soundEnabled } = await load();
    expect(soundEnabled()).toBe(false);
  });

  test("persists both ways", async () => {
    const { soundEnabled, setSoundEnabled } = await load();
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
  });

  test("an explicit override beats the stored setting", async () => {
    // The toggle previews the sound on the same tap that enables it,
    // before the read-back would see the new value.
    const { alertForRequest } = await load();
    expect(alertForRequest("r1", { sound: true })).toBe(true);
  });

  test("storage being unavailable is silence, not a crash", async () => {
    // Private mode, or a locked-down device.
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    };
    const { soundEnabled, setSoundEnabled } = await load();
    expect(soundEnabled()).toBe(false);
    expect(() => setSoundEnabled(true)).not.toThrow();
  });
});

describe("nothing here can break the queue", () => {
  test("a device with no vibration support doesn't throw", async () => {
    (globalThis as Record<string, unknown>).navigator = {};
    const { alertForRequest } = await load();
    expect(() => alertForRequest("r1")).not.toThrow();
  });

  test("a device with no audio support doesn't throw", async () => {
    const { playRequestChime } = await load();
    expect(() => playRequestChime()).not.toThrow();
  });

  test("running server-side is a no-op, not a crash", async () => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).navigator;
    const { soundEnabled, playRequestChime, vibrate } = await load();
    expect(soundEnabled()).toBe(false);
    expect(() => playRequestChime()).not.toThrow();
    expect(() => vibrate()).not.toThrow();
  });
});
