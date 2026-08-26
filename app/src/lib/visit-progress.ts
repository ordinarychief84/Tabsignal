/**
 * "Come back three times and we'll look after you."
 *
 * The mockup for this product showed a points economy — a balance, a
 * ladder of tiers, "$20 off your next visit". This is deliberately not
 * that, for two reasons.
 *
 * TABCALL CANNOT INVENT FINANCIAL VALUE. It doesn't process payments and
 * can't see a bill, so a promise of "$20 off" would be a promise the
 * venue never made, shown to a guest in the venue's name, redeemable at
 * a till that has never heard of it. The venue writes the reward in its
 * own words or there is no reward.
 *
 * A POINTS ECONOMY IS A DIFFERENT PRODUCT. Balances, accrual rates,
 * expiry, redemption, reconciliation with the POS — that is loyalty
 * software, and TabCall is a service product. There IS an older
 * points-per-dollar path in lib/loyalty (awarded when staff close a tab),
 * and this deliberately does not become a second one. What a returning
 * guest sees here is a count of visits, which is a fact rather than a
 * currency.
 *
 * So the whole mechanic is: how many times have you been here, how many
 * does this venue ask for, and what did they say they'd do about it.
 *
 * Deliberately NOT server-only. It holds no secret and touches no
 * database, and the settings form needs the same bounds and the same
 * "is this runnable" rule the guest surface uses — duplicating them in a
 * client file is how the two ends drift apart.
 */

export type VisitProgramConfig = {
  enabled: boolean;
  /** Visits the venue wants before the reward. */
  visitsRequired: number;
  /**
   * What the venue promises, in the venue's own words. Empty means the
   * program cannot run — see `isRunnable`. There is no default, because
   * a default here would be TabCall inventing the offer.
   */
  rewardLabel: string;
  /** Optional name for the scheme, e.g. "Luna Insider". */
  programName: string;
};

export const VISIT_PROGRAM_DEFAULTS: VisitProgramConfig = {
  // Off until a venue deliberately turns it on and says what the reward
  // is. Everything else in the guest experience defaults ON; this one
  // makes a promise on the venue's behalf, so it can't.
  enabled: false,
  visitsRequired: 3,
  rewardLabel: "",
  programName: "",
};

export const MIN_VISITS = 2;
export const MAX_VISITS = 20;
export const MAX_LABEL = 80;

/**
 * Read the program off a venue row.
 *
 * Same tolerance as guestExperienceFrom: the column is free-form JSON
 * that predates this feature and may hold anything.
 */
export function visitProgramFrom(raw: unknown): VisitProgramConfig {
  const out = { ...VISIT_PROGRAM_DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const source = (raw as Record<string, unknown>).visitProgram;
  if (!source || typeof source !== "object" || Array.isArray(source)) return out;
  const s = source as Record<string, unknown>;

  if (typeof s.enabled === "boolean") out.enabled = s.enabled;
  if (typeof s.visitsRequired === "number" && Number.isFinite(s.visitsRequired)) {
    out.visitsRequired = clampVisits(s.visitsRequired);
  }
  if (typeof s.rewardLabel === "string") out.rewardLabel = s.rewardLabel.trim().slice(0, MAX_LABEL);
  if (typeof s.programName === "string") out.programName = s.programName.trim().slice(0, MAX_LABEL);
  return out;
}

export function mergeVisitProgram(
  raw: unknown,
  patch: Partial<VisitProgramConfig>,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  const next = { ...visitProgramFrom(raw) };
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (typeof patch.visitsRequired === "number" && Number.isFinite(patch.visitsRequired)) {
    next.visitsRequired = clampVisits(patch.visitsRequired);
  }
  if (typeof patch.rewardLabel === "string") {
    next.rewardLabel = patch.rewardLabel.trim().slice(0, MAX_LABEL);
  }
  if (typeof patch.programName === "string") {
    next.programName = patch.programName.trim().slice(0, MAX_LABEL);
  }
  base.visitProgram = next;
  return base;
}

function clampVisits(value: number): number {
  return Math.min(MAX_VISITS, Math.max(MIN_VISITS, Math.round(value)));
}

/**
 * Whether the program may actually be shown.
 *
 * `enabled` alone is not enough. A venue that switched it on and never
 * wrote a reward would otherwise show a guest a progress bar leading to
 * nothing — worse than showing nothing at all, because it implies a
 * promise the venue hasn't made.
 */
export function isRunnable(config: VisitProgramConfig): boolean {
  return config.enabled && config.rewardLabel.trim().length > 0;
}

export type VisitProgress = {
  visits: number;
  required: number;
  remaining: number;
  /** True once they've met the count. The venue honours it, not TabCall. */
  earned: boolean;
  rewardLabel: string;
  programName: string;
  /** 0–1, for a bar. Clamped so an over-achiever doesn't overflow it. */
  fraction: number;
};

/**
 * Where this guest stands.
 *
 * `visits` is a count of times this identified guest has scanned at this
 * venue — a fact, not a balance. Returns null when the program isn't
 * runnable or the guest hasn't been here before, so callers render
 * nothing rather than an empty card.
 */
export function progressFor({
  visits,
  config,
}: {
  visits: number;
  config: VisitProgramConfig;
}): VisitProgress | null {
  if (!isRunnable(config)) return null;
  if (visits <= 0) return null;

  const required = config.visitsRequired;
  return {
    visits,
    required,
    remaining: Math.max(0, required - visits),
    earned: visits >= required,
    rewardLabel: config.rewardLabel,
    programName: config.programName,
    fraction: Math.min(1, visits / required),
  };
}

/**
 * The line a guest reads above the reward.
 *
 * Says only how far along they are. What they GET is `rewardLabel`, in
 * the venue's own words, rendered separately — this function must never
 * describe the reward, because the moment it says something like "on the
 * house" it has invented an offer the venue didn't make.
 */
export function progressHeadline(progress: VisitProgress): string {
  if (progress.earned) return "You're there";
  if (progress.remaining === 1) return "One more visit";
  return `${progress.remaining} more visits`;
}

/**
 * What to do about it, once earned.
 *
 * "Mention it" rather than anything automatic: TabCall cannot apply
 * something to a bill it can't see, and a guest who believes the app has
 * handled it is a guest disappointed at the till — in front of the staff
 * member who also didn't know.
 */
export function redeemHint(progress: VisitProgress, venueName: string): string {
  return progress.earned
    ? `Mention it to your server and ${venueName} will sort you out.`
    : `${venueName} is keeping count — nothing to show, just come back.`;
}
