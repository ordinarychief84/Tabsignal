import "server-only";

/**
 * Which parts of the guest experience a venue has switched on.
 *
 * Stored in the existing Venue.enabledFeatures JSON column rather than a
 * dozen new boolean columns: these are read together, on one page, once
 * per scan, and they will keep changing shape as the product does.
 *
 * Everything defaults to ON. A venue that has never opened the settings
 * page gets the full experience — the flags exist so an owner can turn
 * something OFF deliberately, not so they have to opt in to their own
 * product.
 */

export type GuestExperienceConfig = {
  welcome: boolean;
  serverPhoto: boolean;
  menuDiscovery: boolean;
  specials: boolean;
  myPicks: boolean;
  tablePicks: boolean;
  feedback: boolean;
  phoneCapture: boolean;
  marketingConsent: boolean;
  serviceRecovery: boolean;
  /** Post-visit thank-you message. Off by default — it sends something. */
  thankYouMessage: boolean;
};

export const GUEST_EXPERIENCE_DEFAULTS: GuestExperienceConfig = {
  welcome: true,
  serverPhoto: true,
  menuDiscovery: true,
  specials: true,
  myPicks: true,
  tablePicks: true,
  feedback: true,
  phoneCapture: true,
  marketingConsent: true,
  serviceRecovery: true,
  // The only default-off flag: everything else changes what a guest sees,
  // this one causes an outbound message.
  thankYouMessage: false,
};

export const GUEST_EXPERIENCE_KEYS = Object.keys(
  GUEST_EXPERIENCE_DEFAULTS,
) as (keyof GuestExperienceConfig)[];

/**
 * Read the config off a venue row.
 *
 * Tolerant on purpose: the column is free-form JSON that predates this
 * feature and may hold anything. Unknown keys are ignored, non-boolean
 * values fall back to the default, and a null column is a venue with
 * everything on.
 */
export function guestExperienceFrom(raw: unknown): GuestExperienceConfig {
  const out = { ...GUEST_EXPERIENCE_DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const source = (raw as Record<string, unknown>).guestExperience ?? raw;
  if (!source || typeof source !== "object") return out;
  for (const key of GUEST_EXPERIENCE_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/**
 * Merge a partial update back into the existing JSON, preserving any
 * unrelated keys the column already holds. The settings form sends only
 * what changed.
 */
export function mergeGuestExperience(
  raw: unknown,
  patch: Partial<GuestExperienceConfig>,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  const current = guestExperienceFrom(raw);
  const next = { ...current };
  for (const key of GUEST_EXPERIENCE_KEYS) {
    const value = patch[key];
    if (typeof value === "boolean") next[key] = value;
  }
  base.guestExperience = next;
  return base;
}
