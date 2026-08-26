/**
 * How long is too long, per venue.
 *
 * These numbers were hardcoded in eight files with six different values:
 * 60 seconds in two places, 90 in three, 180 in two, and a separate
 * 3-minute constant in the escalation cron. They drifted because nothing
 * held them together — the staff queue could call a request delayed at
 * 90 seconds while the manager floor still called it fine, and the cron
 * escalated on a schedule neither of them knew about.
 *
 * They are also not one number. A cocktail bar at midnight and a
 * fine-dining room at eight are different promises, and a venue that
 * knows its own service should be able to say so.
 *
 * THREE THRESHOLDS, IN ORDER:
 *
 *   warn       it has been a moment. A nudge, not an alarm.
 *   attention  nobody has picked this up and it is now late.
 *   escalate   a manager needs to know.
 *
 * Stored in the existing Venue.enabledFeatures JSON alongside
 * guestExperience and visitProgram — same tolerant-parse, same
 * preserve-other-keys merge, no migration.
 */

export type ServiceThresholds = {
  /** Seconds before a waiting request starts to look worth noticing. */
  warnSeconds: number;
  /** Seconds before an unclaimed request is flagged as needing attention. */
  attentionSeconds: number;
  /** Seconds before it escalates to a manager. */
  escalateSeconds: number;
};

/**
 * The values the product shipped with. Changing these changes behaviour
 * for every venue that has never opened the setting, so they stay as
 * they were rather than being "improved" here.
 */
export const SERVICE_THRESHOLD_DEFAULTS: ServiceThresholds = {
  warnSeconds: 60,
  attentionSeconds: 90,
  escalateSeconds: 180,
};

export const MIN_THRESHOLD_SECONDS = 15;
export const MAX_THRESHOLD_SECONDS = 1800;

/**
 * Read thresholds off a venue row.
 *
 * Tolerant, like its siblings: the column is free-form JSON that predates
 * this feature. Anything missing or malformed falls back to the shipped
 * default rather than to zero — a threshold of 0 would mark every request
 * overdue the instant it arrived.
 */
export function serviceThresholdsFrom(raw: unknown): ServiceThresholds {
  const out = { ...SERVICE_THRESHOLD_DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const source = (raw as Record<string, unknown>).serviceThresholds;
  if (!source || typeof source !== "object" || Array.isArray(source)) return out;
  const s = source as Record<string, unknown>;

  for (const key of ["warnSeconds", "attentionSeconds", "escalateSeconds"] as const) {
    const value = s[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = clamp(value);
    }
  }
  return order(out);
}

export function mergeServiceThresholds(
  raw: unknown,
  patch: Partial<ServiceThresholds>,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  const next = { ...serviceThresholdsFrom(raw) };
  for (const key of ["warnSeconds", "attentionSeconds", "escalateSeconds"] as const) {
    const value = patch[key];
    if (typeof value === "number" && Number.isFinite(value)) next[key] = clamp(value);
  }
  base.serviceThresholds = order(next);
  return base;
}

function clamp(value: number): number {
  return Math.min(MAX_THRESHOLD_SECONDS, Math.max(MIN_THRESHOLD_SECONDS, Math.round(value)));
}

/**
 * Keep the three in ascending order whatever an owner typed.
 *
 * A venue that sets escalate BELOW attention would otherwise get a
 * request that escalates to a manager before it is even flagged as
 * late — states arriving out of sequence, which reads as the product
 * being broken rather than as a configuration mistake. Nudging each
 * threshold to at least its predecessor keeps the ladder intact without
 * refusing the save and losing what they typed.
 */
function order(t: ServiceThresholds): ServiceThresholds {
  const attention = Math.max(t.attentionSeconds, t.warnSeconds);
  const escalate = Math.max(t.escalateSeconds, attention);
  return { warnSeconds: t.warnSeconds, attentionSeconds: attention, escalateSeconds: escalate };
}

/** Where a request sits against its venue's own promise. */
export type ServiceUrgency = "waiting" | "warn" | "attention" | "overdue";

export function urgencyFor(ageSeconds: number, t: ServiceThresholds): ServiceUrgency {
  if (ageSeconds >= t.escalateSeconds) return "overdue";
  if (ageSeconds >= t.attentionSeconds) return "attention";
  if (ageSeconds >= t.warnSeconds) return "warn";
  return "waiting";
}

/**
 * The word shown beside the timer.
 *
 * §21: urgency must never be carried by colour alone. Every state prints
 * its own label, so a card is readable in a dim room by someone who
 * can't tell saffron from rose clay.
 */
export const URGENCY_LABEL: Record<ServiceUrgency, string> = {
  waiting: "Waiting",
  warn: "Waiting",
  attention: "Needs attention",
  overdue: "Overdue",
};
