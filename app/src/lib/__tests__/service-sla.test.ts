/**
 * Venue service thresholds.
 *
 * These numbers were hardcoded in eight files with six different values:
 * 60 seconds twice, 90 three times, 180 twice, and a separate 3-minute
 * constant in the escalation cron. Nothing held them together, so they
 * drifted — the staff queue could call a request delayed while the
 * manager floor beside it still called it fine, and the cron escalated
 * on a schedule neither of them knew about.
 *
 * The properties worth defending:
 *
 *   ONE SOURCE. Every surface reads the same three numbers.
 *   NEVER ZERO. A threshold of 0 marks every request overdue the instant
 *               it arrives, which is worse than any default.
 *   ALWAYS IN ORDER. A venue that sets escalate below attention would
 *               get a request escalating to a manager before it had even
 *               been flagged late — states out of sequence, which reads
 *               as the product being broken rather than as a typo.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  MAX_THRESHOLD_SECONDS,
  MIN_THRESHOLD_SECONDS,
  SERVICE_THRESHOLD_DEFAULTS,
  URGENCY_LABEL,
  mergeServiceThresholds,
  serviceThresholdsFrom,
  urgencyFor,
} from "@/lib/service-sla";

const T = SERVICE_THRESHOLD_DEFAULTS;

describe("defaults preserve shipped behaviour", () => {
  test("the defaults are the numbers the product already used", () => {
    // Changing these changes behaviour for every venue that has never
    // opened the setting, so they stay as they were rather than being
    // quietly "improved" here.
    expect(T).toEqual({ warnSeconds: 60, attentionSeconds: 90, escalateSeconds: 180 });
  });

  test("they are in ascending order", () => {
    expect(T.warnSeconds).toBeLessThan(T.attentionSeconds);
    expect(T.attentionSeconds).toBeLessThan(T.escalateSeconds);
  });
});

describe("urgencyFor", () => {
  test("walks the ladder in order", () => {
    expect(urgencyFor(0, T)).toBe("waiting");
    expect(urgencyFor(59, T)).toBe("waiting");
    expect(urgencyFor(60, T)).toBe("warn");
    expect(urgencyFor(89, T)).toBe("warn");
    expect(urgencyFor(90, T)).toBe("attention");
    expect(urgencyFor(179, T)).toBe("attention");
    expect(urgencyFor(180, T)).toBe("overdue");
    expect(urgencyFor(9999, T)).toBe("overdue");
  });

  test("every urgency has a word, because colour is not enough", () => {
    // §21. A card shaded coral means nothing to somebody who can't see
    // coral, and this gets read in a dim room at speed.
    for (const seconds of [0, 60, 90, 180]) {
      const label = URGENCY_LABEL[urgencyFor(seconds, T)];
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test("a custom ladder is honoured", () => {
    const tight = { warnSeconds: 20, attentionSeconds: 30, escalateSeconds: 45 };
    expect(urgencyFor(25, tight)).toBe("warn");
    expect(urgencyFor(35, tight)).toBe("attention");
    expect(urgencyFor(50, tight)).toBe("overdue");
    // The same age is merely waiting under the defaults.
    expect(urgencyFor(25, T)).toBe("waiting");
  });
});

describe("reading config off a venue", () => {
  test("an empty or malformed column gives the defaults", () => {
    for (const raw of [null, undefined, {}, [], "nope", 7, { serviceThresholds: "x" }]) {
      expect(serviceThresholdsFrom(raw)).toEqual(T);
    }
  });

  test("reads what a venue set", () => {
    const custom = { warnSeconds: 30, attentionSeconds: 45, escalateSeconds: 120 };
    expect(serviceThresholdsFrom({ serviceThresholds: custom })).toEqual(custom);
  });

  test("a partial config keeps the defaults for the rest", () => {
    const out = serviceThresholdsFrom({ serviceThresholds: { warnSeconds: 30 } });
    expect(out.warnSeconds).toBe(30);
    expect(out.attentionSeconds).toBe(T.attentionSeconds);
    expect(out.escalateSeconds).toBe(T.escalateSeconds);
  });

  test("values of the wrong type are ignored rather than throwing", () => {
    const out = serviceThresholdsFrom({
      serviceThresholds: { warnSeconds: "soon", attentionSeconds: null, escalateSeconds: {} },
    });
    expect(out).toEqual(T);
  });
});

describe("nothing can be set to a value that breaks service", () => {
  test("zero is clamped up, never stored", () => {
    // A threshold of 0 marks every request overdue the instant it
    // arrives — every card coral, every request escalated, the signal
    // destroyed.
    const out = serviceThresholdsFrom({
      serviceThresholds: { warnSeconds: 0, attentionSeconds: 0, escalateSeconds: 0 },
    });
    expect(out.warnSeconds).toBe(MIN_THRESHOLD_SECONDS);
    expect(out.attentionSeconds).toBeGreaterThanOrEqual(MIN_THRESHOLD_SECONDS);
    expect(out.escalateSeconds).toBeGreaterThanOrEqual(MIN_THRESHOLD_SECONDS);
  });

  test("negatives and absurd values are clamped", () => {
    const low = serviceThresholdsFrom({ serviceThresholds: { warnSeconds: -500 } });
    expect(low.warnSeconds).toBe(MIN_THRESHOLD_SECONDS);
    const high = serviceThresholdsFrom({ serviceThresholds: { escalateSeconds: 99999 } });
    expect(high.escalateSeconds).toBe(MAX_THRESHOLD_SECONDS);
  });

  test("an out-of-order ladder is repaired, not stored as typed", () => {
    // Escalating before flagging late produces states arriving out of
    // sequence, which reads as the product being broken.
    const out = serviceThresholdsFrom({
      serviceThresholds: { warnSeconds: 200, attentionSeconds: 100, escalateSeconds: 50 },
    });
    expect(out.warnSeconds).toBeLessThanOrEqual(out.attentionSeconds);
    expect(out.attentionSeconds).toBeLessThanOrEqual(out.escalateSeconds);
  });

  test("NO input produces an out-of-order ladder", () => {
    const values = [-1, 0, 15, 60, 90, 180, 600, 99999];
    for (const w of values) {
      for (const a of values) {
        for (const e of values) {
          const out = serviceThresholdsFrom({
            serviceThresholds: { warnSeconds: w, attentionSeconds: a, escalateSeconds: e },
          });
          expect(out.warnSeconds).toBeLessThanOrEqual(out.attentionSeconds);
          expect(out.attentionSeconds).toBeLessThanOrEqual(out.escalateSeconds);
          expect(out.warnSeconds).toBeGreaterThanOrEqual(MIN_THRESHOLD_SECONDS);
        }
      }
    }
  });
});

describe("merging preserves the neighbours", () => {
  test("keys other features own survive", () => {
    // The column also holds guestExperience and visitProgram.
    const existing = {
      guestExperience: { feedback: false },
      visitProgram: { enabled: true },
      somethingElse: 1,
    };
    const merged = mergeServiceThresholds(existing, { warnSeconds: 30 });
    expect(merged.guestExperience).toEqual({ feedback: false });
    expect(merged.visitProgram).toEqual({ enabled: true });
    expect(merged.somethingElse).toBe(1);
  });

  test("only what was sent changes", () => {
    const merged = mergeServiceThresholds(
      { serviceThresholds: { warnSeconds: 30, attentionSeconds: 45, escalateSeconds: 120 } },
      { attentionSeconds: 60 },
    );
    const next = merged.serviceThresholds as typeof T;
    expect(next.warnSeconds).toBe(30);
    expect(next.attentionSeconds).toBe(60);
    expect(next.escalateSeconds).toBe(120);
  });
});

describe("the constants really are gone from the surfaces", () => {
  const files = [
    "../../app/staff/queue.tsx",
    "../../app/admin/v/[slug]/manager-floor.tsx",
    "../waiter-console.ts",
    "../../app/api/cron/escalate/route.ts",
    "../../app/api/venue/[venueId]/requests/live/route.ts",
  ];

  test("no surface still carries its own hardcoded threshold", () => {
    // The whole point. If one of these keeps a private number, the
    // drift this module exists to end starts again.
    for (const f of files) {
      const src = readFileSync(join(import.meta.dir, f), "utf8")
        .split("\n")
        .filter(l => {
          const t = l.trim();
          return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
        })
        .join("\n");
      expect(src).not.toContain("DELAYED_THRESHOLD_MS");
      expect(src).not.toContain("ESCALATION_AGE_MS");
      expect(src).not.toContain("SLA_ATTENTION_SECONDS");
      expect(src).not.toMatch(/seconds\s*>\s*180/);
      expect(src).not.toMatch(/seconds\s*>\s*60\b/);
    }
  });

  test("each of them reads the shared module instead", () => {
    for (const f of files) {
      const src = readFileSync(join(import.meta.dir, f), "utf8");
      expect(src).toContain("service-sla");
    }
  });
});
