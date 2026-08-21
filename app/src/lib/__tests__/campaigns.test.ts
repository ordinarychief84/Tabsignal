/**
 * Campaigns: who gets one, who never does, and what we claim afterwards.
 *
 * The three properties worth pinning:
 *   - only consented contacts are ever eligible
 *   - the same guest can't be sent the same campaign twice
 *   - with no provider configured, nothing is marked as sent
 *
 * That last one matters as much as the others. A venue reading "Sent 240"
 * has to be able to believe 240 phones buzzed.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Recipient = { id: string; campaignId: string; guestContactId: string; status: string };

const state: {
  consented: string[];
  visits: { guestContactId: string; venueId: string; startedAt: Date }[];
  recipients: Recipient[];
  campaign: { id: string; venueId: string; audienceType: string; message: string } | null;
  campaignUpdates: Record<string, unknown>[];
  seq: number;
} = {
  consented: [],
  visits: [],
  recipients: [],
  campaign: null,
  campaignUpdates: [],
  seq: 0,
};

beforeEach(() => {
  state.consented = [];
  state.visits = [];
  state.recipients = [];
  state.campaignUpdates = [];
  state.seq = 0;
  state.campaign = { id: "c_1", venueId: "v_1", audienceType: "ALL_SUBSCRIBED", message: "Hi" };

  mock.module("@/lib/consent", () => ({
    marketableContactIds: async (venueId: string) =>
      venueId === "v_1" ? state.consented : [],
  }));

  mock.module("@/lib/db", () => ({
    db: {
      campaign: {
        findUnique: async () => state.campaign,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          state.campaignUpdates.push(data);
          return {};
        },
      },
      campaignRecipient: {
        createMany: async ({
          data,
          skipDuplicates,
        }: {
          data: { campaignId: string; guestContactId: string }[];
          skipDuplicates: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            const dup = state.recipients.some(
              r => r.campaignId === row.campaignId && r.guestContactId === row.guestContactId,
            );
            if (dup && skipDuplicates) continue;
            state.recipients.push({ ...row, id: `r_${++state.seq}`, status: "PENDING" });
            count++;
          }
          return { count };
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          state.recipients
            .filter(r => r.campaignId === where.campaignId && r.status === where.status)
            .map(r => ({ id: r.id, guestContact: { phone: `+1212555${r.guestContactId.slice(-4)}` } })),
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = state.recipients.find(r => r.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      },
      guestVisit: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          const ids = (where.guestContactId as { in: string[] }).in;
          const since = (where.startedAt as { gte: Date })?.gte;
          return state.visits
            .filter(v => v.venueId === where.venueId && ids.includes(v.guestContactId))
            .filter(v => !since || v.startedAt >= since)
            .map(v => ({ guestContactId: v.guestContactId }));
        },
        groupBy: async ({ where }: { where: Record<string, unknown> }) => {
          const ids = (where.guestContactId as { in: string[] }).in;
          const counts = new Map<string, number>();
          for (const v of state.visits) {
            if (v.venueId !== where.venueId || !ids.includes(v.guestContactId)) continue;
            counts.set(v.guestContactId, (counts.get(v.guestContactId) ?? 0) + 1);
          }
          return [...counts.entries()].map(([guestContactId, n]) => ({
            guestContactId,
            _count: { _all: n },
          }));
        },
      },
    },
  }));
});

afterEach(() => { mock.restore(); });

describe("audience resolution", () => {
  test("only consented contacts are ever eligible", async () => {
    state.consented = ["gc_1", "gc_2"];
    const { resolveAudience } = await import("../campaigns");
    expect((await resolveAudience("v_1", "ALL_SUBSCRIBED")).sort()).toEqual(["gc_1", "gc_2"]);
  });

  test("nobody consented means nobody is reachable, whatever the audience", async () => {
    state.consented = [];
    state.visits = [{ guestContactId: "gc_1", venueId: "v_1", startedAt: new Date() }];
    const { resolveAudience } = await import("../campaigns");
    for (const audience of ["ALL_SUBSCRIBED", "VISITED_LAST_30_DAYS", "RETURNING_GUESTS"] as const) {
      expect(await resolveAudience("v_1", audience)).toEqual([]);
    }
  });

  test("recent-visitors narrows within the consented set, never outside it", async () => {
    state.consented = ["gc_1"];
    state.visits = [
      { guestContactId: "gc_1", venueId: "v_1", startedAt: new Date() },
      // Consent is what gates this, not the visit.
      { guestContactId: "gc_never_consented", venueId: "v_1", startedAt: new Date() },
    ];
    const { resolveAudience } = await import("../campaigns");
    expect(await resolveAudience("v_1", "VISITED_LAST_30_DAYS")).toEqual(["gc_1"]);
  });

  test("returning guests means more than one visit", async () => {
    state.consented = ["gc_once", "gc_twice"];
    state.visits = [
      { guestContactId: "gc_once", venueId: "v_1", startedAt: new Date() },
      { guestContactId: "gc_twice", venueId: "v_1", startedAt: new Date() },
      { guestContactId: "gc_twice", venueId: "v_1", startedAt: new Date() },
    ];
    const { resolveAudience } = await import("../campaigns");
    expect(await resolveAudience("v_1", "RETURNING_GUESTS")).toEqual(["gc_twice"]);
  });

  test("another venue's campaign reaches nobody here", async () => {
    state.consented = ["gc_1"];
    const { resolveAudience } = await import("../campaigns");
    expect(await resolveAudience("v_2", "ALL_SUBSCRIBED")).toEqual([]);
  });
});

describe("no duplicate sends", () => {
  test("materialising twice does not add the same guest again", async () => {
    state.consented = ["gc_1", "gc_2"];
    const { materialiseRecipients } = await import("../campaigns");
    expect(await materialiseRecipients("c_1")).toBe(2);
    // Second run: audience unchanged, so nothing new.
    expect(await materialiseRecipients("c_1")).toBe(0);
    expect(state.recipients.length).toBe(2);
  });

  test("a retry only touches recipients still pending", async () => {
    state.consented = ["gc_1", "gc_2"];
    const { materialiseRecipients, dispatchCampaign } = await import("../campaigns");
    await materialiseRecipients("c_1");
    state.recipients[0]!.status = "DELIVERED";

    const sender = {
      name: "test",
      sent: [] as string[],
      async send({ to }: { to: string }) {
        this.sent.push(to);
        return { ok: true };
      },
    };
    const result = await dispatchCampaign("c_1", sender);
    expect(result.ok).toBe(true);
    // The already-delivered guest is not messaged a second time.
    expect(sender.sent.length).toBe(1);
  });
});

describe("no provider configured", () => {
  test("nothing is marked sent, and the reason is stated", async () => {
    state.consented = ["gc_1", "gc_2"];
    const { dispatchCampaign } = await import("../campaigns");
    const result = await dispatchCampaign("c_1", null);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("NO_PROVIDER");
    // The eligible count is real and worth showing.
    expect(result.ok === false && result.eligible).toBe(2);
    // Crucially: the campaign was NOT moved to SENT.
    expect(state.campaignUpdates).toEqual([]);
    expect(state.recipients.every(r => r.status === "PENDING")).toBe(true);
  });

  test("configuredSender is null until a provider is wired up", async () => {
    const { configuredSender, messagingConfigured } = await import("../campaigns");
    expect(configuredSender()).toBeNull();
    expect(messagingConfigured()).toBe(false);
  });
});
