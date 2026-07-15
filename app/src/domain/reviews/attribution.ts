import { db } from "@/lib/db";

/**
 * domain/reviews/attribution — who served this session, and on which
 * shift. Stamped onto FeedbackReport at submit time (reviews suite R2)
 * so per-staff and per-shift rating reports read straight off columns
 * instead of re-deriving service history that staff churn would erode.
 */

export type ServiceAttribution = {
  staffId: string;
  staffName: string;
} | null;

/**
 * The staff member who most recently acknowledged a request on this
 * session — the person who was actually working the table. Sessions
 * with no acknowledged requests (guest paid without ever calling)
 * attribute to nobody rather than guessing.
 */
export async function attributionForSession(sessionId: string): Promise<ServiceAttribution> {
  const lastAcked = await db.request.findFirst({
    where: { sessionId, acknowledgedById: { not: null } },
    orderBy: { acknowledgedAt: "desc" },
    select: { acknowledgedBy: { select: { id: true, name: true } } },
  });
  if (!lastAcked?.acknowledgedBy) return null;
  return { staffId: lastAcked.acknowledgedBy.id, staffName: lastAcked.acknowledgedBy.name };
}

export type ShiftBucket = "morning" | "afternoon" | "evening" | "late";

/**
 * Bucket a moment into the venue's local shift window:
 *   morning 05:00–10:59 · afternoon 11:00–16:59 ·
 *   evening 17:00–22:59 · late 23:00–04:59
 * Invalid/missing timezone falls back to UTC rather than throwing —
 * attribution must never break a guest's feedback POST.
 */
export function shiftBucketFor(at: Date, timeZone: string): ShiftBucket {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(at),
    );
  } catch {
    hour = at.getUTCHours();
  }
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "late";
}
