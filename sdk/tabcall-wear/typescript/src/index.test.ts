import { describe, expect, test } from "bun:test";
import { TabCallWear, TabCallWearError, type WearQueue } from "./index";

/** Programmable fetch stub recording every call. */
function stubFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    const out = handler(u, init ?? {});
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const PAIR_OK = {
  apiVersion: 1,
  token: "wear-token-abc",
  device: { id: "dev_1", name: "Maya's Watch", platform: "wearos" },
  staff: { id: "stf_1", name: "Maya" },
  venue: { name: "The Velvet Hour", slug: "velvet-hour" },
};

const QUEUE_OK: WearQueue = {
  serverTime: new Date().toISOString(),
  staff: { id: "stf_1", name: "Maya" },
  pollAfterMs: 5000,
  requests: [
    {
      id: "req_1",
      type: "DRINK",
      status: "PENDING",
      table: "Table 7",
      note: null,
      idCheck: false,
      ageSeconds: 12,
      assignedToMe: true,
      mine: false,
      ackedBy: null,
    },
  ],
};

describe("pair", () => {
  test("stores the token, fires onToken, sends code + device info", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 201, body: PAIR_OK }));
    let persisted: string | null = null;
    const sdk = new TabCallWear({
      baseUrl: "https://tab-call.test/",
      fetch: impl,
      onToken: t => { persisted = t; },
    });

    expect(sdk.isPaired).toBe(false);
    const result = await sdk.pair("123456", { name: "Maya's Watch", platform: "wearos" });

    expect(result.venue.slug).toBe("velvet-hour");
    expect(sdk.isPaired).toBe(true);
    // `persisted` is written inside the onToken callback, which TS can't
    // track — read it through a widened binding.
    expect(persisted as string | null).toBe("wear-token-abc");
    // trailing slash in baseUrl is normalized
    expect(calls[0]!.url).toBe("https://tab-call.test/api/wear/claim");
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toEqual({ code: "123456", name: "Maya's Watch", platform: "wearos" });
    // pairing is the unauthenticated call — no bearer header
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  test("invalid code surfaces as TabCallWearError with the server code", async () => {
    const { impl } = stubFetch(() => ({ status: 401, body: { error: "CODE_INVALID" } }));
    const sdk = new TabCallWear({ baseUrl: "https://x.test", fetch: impl });
    try {
      await sdk.pair("000000");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TabCallWearError);
      expect((e as TabCallWearError).code).toBe("CODE_INVALID");
      expect((e as TabCallWearError).needsRepair).toBe(true);
    }
  });
});

describe("authenticated calls", () => {
  test("queue/ack/resolve carry the bearer token and SDK tag", async () => {
    const { impl, calls } = stubFetch(url => {
      if (url.endsWith("/queue")) return { status: 200, body: QUEUE_OK };
      if (url.endsWith("/ack")) {
        return { status: 200, body: { id: "req_1", status: "ACKNOWLEDGED", mine: true, ackedBy: "Maya", alreadyAcked: false } };
      }
      return { status: 200, body: { id: "req_1", status: "RESOLVED", resolutionAction: "SERVED", alreadyResolved: false } };
    });
    const sdk = new TabCallWear({ baseUrl: "https://x.test", token: "tok", fetch: impl });

    const queue = await sdk.getQueue();
    expect(queue.requests[0]!.table).toBe("Table 7");

    const ack = await sdk.acknowledge("req_1");
    expect(ack.mine).toBe(true);

    const res = await sdk.resolve("req_1", "SERVED", "double olives");
    expect(res.resolutionAction).toBe("SERVED");

    for (const c of calls) {
      const h = c.init.headers as Record<string, string>;
      expect(h.authorization).toBe("Bearer tok");
      expect(h["x-tabcall-wear-sdk"]).toStartWith("ts/");
    }
    // resolve body carries action + note
    const resolveBody = JSON.parse(String(calls[2]!.init.body));
    expect(resolveBody).toEqual({ action: "SERVED", note: "double olives" });
  });

  test("calls without a token fail fast with NOT_PAIRED", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 200, body: {} }));
    const sdk = new TabCallWear({ baseUrl: "https://x.test", fetch: impl });
    try {
      await sdk.getQueue();
      expect.unreachable();
    } catch (e) {
      expect((e as TabCallWearError).code).toBe("NOT_PAIRED");
    }
    expect(calls.length).toBe(0); // never hit the network
  });

  test("network failure maps to status 0 / NETWORK, not needsRepair", async () => {
    const impl = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const sdk = new TabCallWear({ baseUrl: "https://x.test", token: "tok", fetch: impl });
    try {
      await sdk.getQueue();
      expect.unreachable();
    } catch (e) {
      const err = e as TabCallWearError;
      expect(err.code).toBe("NETWORK");
      expect(err.status).toBe(0);
      expect(err.needsRepair).toBe(false);
    }
  });
});

describe("startPolling", () => {
  test("delivers queues, honors pollAfterMs, and stop() halts the loop", async () => {
    let served = 0;
    const { impl } = stubFetch(() => {
      served += 1;
      return { status: 200, body: { ...QUEUE_OK, pollAfterMs: 1000 } };
    });
    const sdk = new TabCallWear({ baseUrl: "https://x.test", token: "tok", fetch: impl });

    const seen: number[] = [];
    const stop = sdk.startPolling(q => seen.push(q.requests.length));

    // First tick is immediate; the next is scheduled at max(1000, pollAfterMs).
    await new Promise(r => setTimeout(r, 80));
    expect(seen.length).toBe(1);
    stop();
    const after = served;
    await new Promise(r => setTimeout(r, 1200));
    expect(served).toBe(after); // nothing fired after stop()
  });

  test("dead token stops the loop and reports via onError", async () => {
    const { impl } = stubFetch(() => ({ status: 401, body: { error: "DEVICE_REVOKED" } }));
    const sdk = new TabCallWear({ baseUrl: "https://x.test", token: "tok", fetch: impl });

    const errors: unknown[] = [];
    sdk.startPolling(() => expect.unreachable(), { onError: e => errors.push(e) });
    await new Promise(r => setTimeout(r, 80));

    expect(errors.length).toBe(1);
    expect((errors[0] as TabCallWearError).needsRepair).toBe(true);
  });
});
