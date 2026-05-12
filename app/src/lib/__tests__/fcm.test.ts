/**
 * FCM helper unit tests.
 *
 * We mock the two firebase-admin entry points the helper dynamically
 * imports (`firebase-admin/app` and `firebase-admin/messaging`) so the
 * test doesn't need real Google credentials. mock.module() is reset
 * between cases via `_resetFcmForTest()`, which clears the module-level
 * init cache so each test gets a fresh getMessaging() call.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { _resetFcmForTest, sendPushToStaff } from "../fcm";

const ORIG_PROJECT = process.env.FIREBASE_PROJECT_ID;
const ORIG_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const ORIG_KEY = process.env.FIREBASE_PRIVATE_KEY;

function setCreds() {
  process.env.FIREBASE_PROJECT_ID = "demo-project";
  process.env.FIREBASE_CLIENT_EMAIL = "fcm@demo-project.iam.gserviceaccount.com";
  // Literal \n — exercises the newline-conversion code path.
  process.env.FIREBASE_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADAN\\n-----END PRIVATE KEY-----\\n";
}

function clearCreds() {
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
}

afterEach(() => {
  _resetFcmForTest();
  if (ORIG_PROJECT !== undefined) process.env.FIREBASE_PROJECT_ID = ORIG_PROJECT;
  else delete process.env.FIREBASE_PROJECT_ID;
  if (ORIG_EMAIL !== undefined) process.env.FIREBASE_CLIENT_EMAIL = ORIG_EMAIL;
  else delete process.env.FIREBASE_CLIENT_EMAIL;
  if (ORIG_KEY !== undefined) process.env.FIREBASE_PRIVATE_KEY = ORIG_KEY;
  else delete process.env.FIREBASE_PRIVATE_KEY;
});

describe("sendPushToStaff — credential gating", () => {
  beforeEach(() => {
    clearCreds();
    _resetFcmForTest();
  });

  test("returns { sent: 0, invalidTokens: [] } when creds absent (no throw)", async () => {
    const result = await sendPushToStaff(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], {
      title: "hi",
      body: "there",
    });
    expect(result).toEqual({ sent: 0, invalidTokens: [] });
  });

  test("empty token list short-circuits regardless of creds", async () => {
    setCreds();
    const result = await sendPushToStaff([], { title: "x", body: "y" });
    expect(result).toEqual({ sent: 0, invalidTokens: [] });
  });
});

describe("sendPushToStaff — multicast behaviour", () => {
  beforeEach(() => {
    setCreds();
    _resetFcmForTest();
  });

  test("populates invalidTokens on registration-token-not-registered", async () => {
    // Mock firebase-admin/app + /messaging so the dynamic import resolves
    // to our stubs. `mock.module` replaces the module across the whole
    // worker for this test file.
    mock.module("firebase-admin/app", () => ({
      getApps: () => [],
      initializeApp: () => ({}),
      cert: (input: unknown) => input,
    }));
    mock.module("firebase-admin/messaging", () => ({
      getMessaging: () => ({
        sendEachForMulticast: async (msg: { tokens: string[] }) => ({
          successCount: 1,
          failureCount: 1,
          responses: msg.tokens.map((_t, i) =>
            i === 1
              ? { success: false, error: { code: "messaging/registration-token-not-registered" } }
              : { success: true, messageId: `m-${i}` },
          ),
        }),
      }),
    }));

    const tokens = [
      "good-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "dead-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ];
    const result = await sendPushToStaff(tokens, { title: "t", body: "b" });
    expect(result.sent).toBe(1);
    expect(result.invalidTokens).toEqual(["dead-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
  });

  test("counts sent correctly for all-success batch", async () => {
    mock.module("firebase-admin/app", () => ({
      getApps: () => [{ name: "[DEFAULT]" }],
      initializeApp: () => ({}),
      cert: (input: unknown) => input,
    }));
    mock.module("firebase-admin/messaging", () => ({
      getMessaging: () => ({
        sendEachForMulticast: async (msg: { tokens: string[] }) => ({
          successCount: msg.tokens.length,
          failureCount: 0,
          responses: msg.tokens.map((_t, i) => ({ success: true, messageId: `m-${i}` })),
        }),
      }),
    }));

    const tokens = [
      "tok-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "tok-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "tok-ccccccccccccccccccccccccccccccccc",
    ];
    const result = await sendPushToStaff(tokens, { title: "t", body: "b" });
    expect(result.sent).toBe(3);
    expect(result.invalidTokens).toEqual([]);
  });

  test("dedupes tokens before sending", async () => {
    let capturedTokens: string[] = [];
    mock.module("firebase-admin/app", () => ({
      getApps: () => [{ name: "[DEFAULT]" }],
      initializeApp: () => ({}),
      cert: (input: unknown) => input,
    }));
    mock.module("firebase-admin/messaging", () => ({
      getMessaging: () => ({
        sendEachForMulticast: async (msg: { tokens: string[] }) => {
          capturedTokens = msg.tokens;
          return {
            successCount: msg.tokens.length,
            failureCount: 0,
            responses: msg.tokens.map((_t, i) => ({ success: true, messageId: `m-${i}` })),
          };
        },
      }),
    }));

    await sendPushToStaff(
      ["dup-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "dup-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      { title: "t", body: "b" },
    );
    expect(capturedTokens.length).toBe(1);
  });
});
