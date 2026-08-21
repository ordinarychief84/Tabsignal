/**
 * The four-face rating, and what it means.
 *
 * Deliberately NOT server-only: the guest's feedback screen is a client
 * component and needs the same choices, vocabularies and mapping the API
 * validates against. One definition, both sides — a second copy for the
 * client is how the two drift and a tag starts getting silently dropped.
 * Nothing here touches the database or reads a secret.
 *
 * The guest taps a face; the database keeps the 1-5 integer it always
 * kept. That matters because averages, the reviews page, employee
 * attribution and the ≥4 Google-review threshold all already read
 * FeedbackReport.rating — changing the scale would silently reinterpret
 * every historical row.
 *
 * The gap between "Okay" (2) and "Good" (4) is deliberate: there is no 3.
 * A middling experience is a problem to fix, not a neutral outcome, and
 * leaving 3 unused keeps "Okay" firmly on the negative side of the
 * existing threshold rather than straddling it.
 */

export const RATING_CHOICES = [
  { value: 1, face: "😞", label: "Not great", sentiment: "NEGATIVE" },
  { value: 2, face: "😐", label: "Okay", sentiment: "NEGATIVE" },
  { value: 4, face: "🙂", label: "Good", sentiment: "POSITIVE" },
  { value: 5, face: "😍", label: "Amazing", sentiment: "POSITIVE" },
] as const;

export type Sentiment = "NEGATIVE" | "NEUTRAL" | "POSITIVE";

/** Stored alongside the rating so queries never re-derive it and drift. */
export function sentimentFor(rating: number): Sentiment {
  if (rating >= 4) return "POSITIVE";
  if (rating === 3) return "NEUTRAL";
  return "NEGATIVE";
}

export function isPositive(rating: number): boolean {
  return sentimentFor(rating) === "POSITIVE";
}

/**
 * Tag vocabularies. Fixed server-side lists, not free text, so the
 * analytics that count them stay countable — and so a guest can't inject
 * arbitrary strings into a manager's dashboard.
 *
 * SERVER_TAG is a placeholder the UI swaps for the actual server's display
 * name ("Sarah was amazing"). It is stored in its placeholder form so the
 * tag stays aggregatable across every server at the venue.
 */
export const SERVER_TAG = "server";

export const POSITIVE_TAGS = [
  { id: "service", label: "Great service" },
  { id: "food", label: "Food" },
  { id: "drinks", label: "Drinks" },
  { id: "atmosphere", label: "Atmosphere" },
  { id: SERVER_TAG, label: "Our server was amazing" },
] as const;

export const NEGATIVE_TAGS = [
  { id: "wait_time", label: "Wait time" },
  { id: "service", label: "Service" },
  { id: "food", label: "Food" },
  { id: "drinks", label: "Drinks" },
  { id: "cleanliness", label: "Cleanliness" },
  { id: "other", label: "Something else" },
] as const;

const POSITIVE_IDS = new Set(POSITIVE_TAGS.map(t => t.id as string));
const NEGATIVE_IDS = new Set(NEGATIVE_TAGS.map(t => t.id as string));

/**
 * Keep only tags that belong to the vocabulary for this rating. Anything
 * else — a typo, a stale client, or someone POSTing by hand — is dropped
 * rather than rejected, because a guest who has already given a rating
 * shouldn't lose it over a malformed tag.
 */
export function sanitizeTags(rating: number, tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const allowed = isPositive(rating) ? POSITIVE_IDS : NEGATIVE_IDS;
  const clean = tags
    .filter((t): t is string => typeof t === "string")
    .map(t => t.trim().toLowerCase())
    .filter(t => allowed.has(t));
  return [...new Set(clean)].slice(0, 8);
}

/** Label for a tag, with the server placeholder resolved for display. */
export function tagLabel(tag: string, serverName?: string | null): string {
  if (tag === SERVER_TAG) {
    return serverName ? `${serverName} was amazing` : "Our server was amazing";
  }
  const found =
    POSITIVE_TAGS.find(t => t.id === tag) ?? NEGATIVE_TAGS.find(t => t.id === tag);
  return found?.label ?? tag;
}
