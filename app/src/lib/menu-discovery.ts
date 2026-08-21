/**
 * "What are you in the mood for?"
 *
 * Deterministic, not generative. Each prompt maps to menu tags the venue
 * set on its own items, so the answer to "something light" is whatever
 * that kitchen decided is light — not a model's guess at what a dish is
 * from its name. That also means it works offline, costs nothing per
 * scan, and can be explained to an owner in one sentence.
 *
 * A prompt with no matching items is hidden rather than shown empty, so a
 * venue that never tags anything simply doesn't get the discovery row.
 */

export type MoodPrompt = {
  id: string;
  label: string;
  emoji: string;
  /** Any item carrying one of these tags matches. */
  tags: string[];
};

export const MOOD_PROMPTS: MoodPrompt[] = [
  { id: "drinks", label: "Drinks", emoji: "🍸", tags: ["drink", "drinks", "cocktail", "wine", "beer"] },
  { id: "filling", label: "Something filling", emoji: "🍝", tags: ["filling", "hearty", "main", "mains"] },
  { id: "bold", label: "Something bold", emoji: "🌶️", tags: ["bold", "spicy", "rich"] },
  { id: "light", label: "Something light", emoji: "🥗", tags: ["light", "fresh", "salad", "starter"] },
  { id: "sweet", label: "Something sweet", emoji: "🍰", tags: ["sweet", "dessert", "pudding"] },
  // Not a tag match — deliberately a shuffle across everything available.
  { id: "surprise", label: "Surprise me", emoji: "✨", tags: [] },
];

export function promptById(id: string): MoodPrompt | null {
  return MOOD_PROMPTS.find(p => p.id === id) ?? null;
}

type TaggedItem = { id: string; tags: string[]; isFeatured?: boolean };

/**
 * Items matching a prompt.
 *
 * "Surprise me" returns a rotation across the whole available menu rather
 * than a random sample: `seed` is the guest's session id, so the same
 * guest gets a stable answer if they tap back into it, and two tables get
 * different answers. Random per render would make the feature feel broken.
 */
export function itemsForPrompt<T extends TaggedItem>(
  prompt: MoodPrompt,
  items: T[],
  seed = "",
): T[] {
  if (prompt.tags.length === 0) {
    if (items.length === 0) return [];
    const offset = Math.abs(hash(seed)) % items.length;
    const rotated = [...items.slice(offset), ...items.slice(0, offset)];
    // Featured first — a "surprise" should still be something the venue
    // is proud of.
    return rotated.sort((a, b) => Number(!!b.isFeatured) - Number(!!a.isFeatured)).slice(0, 6);
  }
  const wanted = new Set(prompt.tags);
  return items.filter(i => i.tags.some(t => wanted.has(t.toLowerCase())));
}

/** Prompts worth showing, given what this venue has actually tagged. */
export function availablePrompts<T extends TaggedItem>(items: T[]): MoodPrompt[] {
  if (items.length === 0) return [];
  return MOOD_PROMPTS.filter(p => itemsForPrompt(p, items).length > 0);
}

/** Small, stable, non-cryptographic — this only picks a rotation offset. */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return h;
}
