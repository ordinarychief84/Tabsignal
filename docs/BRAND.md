# TabCall — Brand & Visual System ("Last Call")

This is the source of truth for TabCall's brand. If a hex value, font, or
voice-line in the product disagrees with this doc, this doc wins. Update
the doc when you change the system, not after.

## Identity

**Name:** TabCall.
**One-line:** *AI service intelligence for bars.*
**Audience:** Owner/manager of a 1–3 location bar or lounge. 25–40, runs
ops from a phone behind the bar at midnight.
**Voice:** Direct, operator-to-operator. Speed, money, accountability.
Not wellness. Not corporate SaaS. Never lifestyle.

## Palette — "Last Call"

The palette is named for the last hour at a bar — neon signs against a
dark room, warm light, decisions made fast. Tokens are defined once in
`app/tailwind.config.ts` and consumed everywhere as Tailwind classes.

| Token         | Hex       | Name           | Where it goes                                            |
| ------------- | --------- | -------------- | -------------------------------------------------------- |
| `slate`       | `#0E0F1A` | Inkwell        | Dark surfaces — navbar, hero, footer, dark cards         |
| `slate.light` | `#1A1C2C` | Midnight       | Elevated cards on Inkwell                                |
| `oat`         | `#F8F6F1` | Bone           | Light surfaces — body, marketing trust strip, light cards |
| `chartreuse`  | `#C9F61C` | Electric Lime  | **Primary action.** CTAs, active/live signals, "now"     |
| `coral`       | `#F25C42` | Hot Coral      | Alerts, delays, 1★ warnings — anything that demands attention |
| `sea`         | `#5BD0B3` | Sea Glass      | Secondary accents, icon backgrounds, soft confirmations  |
| `umber`       | `#8B6F4E` | Whiskey        | Section accent — CTA band, warm emphasis blocks          |

### Rationale (why this palette, not another)

- **Inkwell over washed plum:** the previous `#2B2539` read "office furniture purple." `#0E0F1A` reads "after-hours bar."
- **Electric Lime over cream-yellow:** the old `#EEEFC8` chartreuse was so pale it disappeared against the light background and read as "almost gray" against the dark one. `#C9F61C` is a confident action color in the same family — same intent, executed.
- **Hot Coral over dusty pink:** when a 1★ review is brewing or a request is delayed, the alert needs to *demand* attention. Dusty pink reads as decorative; hot coral reads as urgent.
- **Sea Glass over pale sage:** same intent (secondary calm accent), but saturated enough to actually appear on the page.
- **Whiskey over dusty brown:** the CTA band is the page's emotional turn. Bar-flavored warmth, not airport-lounge brown.
- **Bone over washed beige:** `#F8F6F1` drops the yellow cast and reads as premium menu paper.

### Section rules

1. **One accent per section.** A section uses Inkwell or Bone as base, plus *at most one* accent (Lime, Coral, Sea Glass, or Whiskey). Stacking accents reads as a fruit salad and undermines hierarchy.
2. **No gradients.** Flat color only. Gradients soften the brand and add visual weight without communication.
3. **Lime is for action and life.** Reserve Electric Lime for CTAs, "live" indicators (active session, payment confirmed pulse), and the navbar logomark stroke. Don't use it for body text or large background fills.
4. **Coral is for warning, not decoration.** If a thing isn't actually demanding attention, don't make it coral. Use Sea Glass for "neutral confirmation" or Whiskey for "emphasis without alarm."
5. **Whiskey is rare.** It's the CTA band and similar warm-emphasis blocks. Not a default accent.

## Typography

- **Family:** Inter (loaded as `var(--font-inter)`), system fallback.
- **Scale:** Tailwind defaults. No custom modular scale.
- **Headlines:** `font-semibold` or `font-bold`, generous line-height. The product is operator-readable, not poster.
- **Microcopy:** `text-sm` with `text-oat/70` on dark or `text-slate/70` on light.

## Logo

Inline SVG. The mark is a wave-and-dot — 24×24, two arcs over a filled
circle. Stroke and fill use `chartreuse` (Electric Lime) on Inkwell, or
the dark `slate` on Bone. Component implementation:
[app/src/app/page.tsx (logo SVG)](../app/src/app/page.tsx).

There is no external logo file (PNG/SVG asset). When that changes, list
it here and in `app/public/`.

## Themeing notes

- Single light-mode design. No `next-themes`, no system preference toggle. The product is mostly used on bartender phones in dim rooms — Inkwell *is* the dark surface; we don't need to invert it.
- Browser theme color is set in `app/src/app/layout.tsx` as `themeColor: "#0E0F1A"` so the iOS PWA chrome matches the navbar.

## Don'ts

- Don't introduce new hex values without adding them here.
- Don't use Tailwind's default colors (`bg-blue-500`, `text-red-600`) — they conflict with the palette and look generic.
- Don't add a fifth accent. If you need one, replace one of the existing four.
- Don't gradient. Don't shadow-blur into the page. Don't drop-shadow the logomark.
- Don't make the CTA pale or "subtle." It is the call to act.
