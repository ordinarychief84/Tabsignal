/**
 * domain/reviews/links — the public Google review deep link.
 *
 * HONEST REVIEW LINKS (reviews suite R2): every guest gets the SAME
 * link regardless of their rating. Google's review policy prohibits
 * "review gating" — selectively soliciting positive reviews or
 * discouraging negative ones. The old flow only returned this URL for
 * 4–5★ ratings; that selective solicitation is exactly the pattern
 * Google can penalize listings for. The private note + manager
 * intercept remain as ADDITIONAL support for unhappy guests — support,
 * not a filter in front of the public link.
 */
export function googleReviewUrl(googlePlaceId: string | null | undefined): string | null {
  if (!googlePlaceId) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(googlePlaceId)}`;
}
