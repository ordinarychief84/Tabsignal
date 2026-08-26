/**
 * Shared marketing feature data. Used by:
 *   - /              (landing page feature grid + spotlights)
 *   - /features      (feature list)
 *   - /features/[slug] (feature detail)
 *   - Features dropdown in the navbar
 *
 * Keep this file small and language-only — no React imports. Detail pages
 * compose their own visuals so each can have a bespoke layout.
 */

export type FeatureTone = "butter" | "sage";

export type FeatureSlug =
  | "qr-orders"
  | "digital-menu"
  | "wishlist"
  | "promotions"
  | "pos-integration"
  | "call-waiter"
  | "reviews"
  | "analytics";

export type FeatureCard = {
  slug: FeatureSlug;
  title: string;
  tagline: string;
  body: string;
  tone: FeatureTone;
  /** Short bullets shown on the detail page. */
  highlights: string[];
  /** Lead paragraph for the detail page hero. */
  detailLead: string;
  /** "How it shows up on the floor" — a few operator-facing outcomes. */
  outcomes: string[];
};

export const FEATURES: FeatureCard[] = [
  {
    slug: "qr-orders",
    title: "Ready to Order",
    tagline: "Guests decide at their own pace, then call you when they're ready.",
    body:
      "Guests browse, shortlist what they like, and signal when they want you \u2014 no hovering, no flagging anyone down.",
    tone: "sage",
    highlights: [
      "Categorised menu with photos, tags and descriptions",
      "Featured items surface first, so what you want to move gets seen",
      "My Picks: a shortlist the guest shows you when you arrive",
      "\u201cReady to order\u201d lands in the live queue with the table and how long they\u2019ve waited",
    ],
    detailLead:
      "TabCall does not take the order \u2014 your POS does, the way it always has. What it changes is the ten minutes before that: guests read the menu properly, save what they want, and tell you when they\u2019re ready instead of trying to catch your eye. You arrive at a table that already knows what it wants.",
    outcomes: [
      "Servers stop circling tables guessing who\u2019s ready",
      "Guests order from a shortlist instead of re-reading the menu at the table",
      "Every request carries the table and the wait, so nothing sits unnoticed",
    ],
  },
  {
    slug: "digital-menu",
    title: "Digital Menu",
    tagline: "Beautiful, customisable, on-brand.",
    body:
      "Beautiful. Customisable. On-brand. Built to increase your sales.",
    tone: "butter",
    highlights: [
      "Drag-and-drop section ordering",
      "Photo upload per item, image cropper built in",
      "Brand colours, logo, banner, custom welcome message",
      "Highlight chef specials, new dishes, limited-time items",
    ],
    detailLead:
      "Your menu is the most visited screen in your business. TabCall gives you a digital menu that matches your brand: your colours, your photos, your tone of voice. Update prices, mark items 86'd, and feature seasonal dishes without touching a printer.",
    outcomes: [
      "Photo-led menus raise average check size by 10 to 15%",
      "Featured items get 3x the orders of unfeatured ones",
      "Last-minute 86s update across every table instantly",
    ],
  },
  {
    slug: "wishlist",
    title: "My Picks",
    tagline: "Guests save and share favourites with the waiter.",
    body:
      "Guests can save their favourite dishes and share with the waiter in one tap.",
    tone: "sage",
    highlights: [
      "Save items to a wishlist while browsing the menu",
      "Share to the server with one tap — sends to the live queue",
      "Convert to an order with a single confirmation",
      "Servers see wishlist intent before the order, prep ahead",
    ],
    detailLead:
      "Wishlist is the soft version of an order. A guest browsing the menu can stack favourites without committing. Tap share and the server gets a courteous nudge: this guest is leaning toward X, Y, Z. Turn it into an order with one tap when they're ready.",
    outcomes: [
      "Servers know what a table is interested in before the order lands",
      "Indecisive parties convert from browse to order 40% faster",
      "Wishlist becomes a soft suggestive-sell tool for the floor",
    ],
  },
  {
    slug: "promotions",
    title: "Promotions & Banners",
    tagline: "Happy hours, lunch deals, new items — front and centre.",
    body:
      "Highlight happy hours, lunch deals, and new items to boost sales.",
    tone: "butter",
    highlights: [
      "Happy hour windows by day-of-week and time-of-day",
      "Banner image at the top of the guest menu",
      "Business lunch promo cards with time gating",
      "Limited-time, new-item, and discount-highlight templates",
    ],
    detailLead:
      "Promotions live where guests will actually see them — at the top of the menu, the second they scan the QR. Time-gated by hour so happy hour ends at 7pm without manual intervention. Lunch promos disappear at 3pm. New-dish badges expire on the date you set.",
    outcomes: [
      "Cocktails promoted in a banner see 2 to 3x order volume that hour",
      "Lunch-window promos pull in walk-in office crowds",
      "Servers stop having to recite the happy hour list",
    ],
  },
  {
    slug: "pos-integration",
    title: "Works Alongside Your POS",
    tagline: "Nothing to rip out. Nothing to double-key.",
    body:
      "Your POS keeps taking the order, holding the bill and settling the payment. TabCall handles everything around it.",
    tone: "sage",
    highlights: [
      "No migration \u2014 your POS, printers, prep stations and reports are untouched",
      "TabCall never processes a payment, so your card rates stay exactly as they are",
      "Menu lives in TabCall for guests; pricing on the bill stays with your POS",
      "Direct Toast, Square and Clover connectors are in development \u2014 not available yet",
    ],
    detailLead:
      "TabCall deliberately stops where your POS starts. It is the layer between a guest sitting down and a server arriving \u2014 how they call for help, what they discover, and how they tell you it went. The order, the bill and the money never leave the system you already run.",
    outcomes: [
      "No rip-and-replace, and no second system for your staff to reconcile",
      "Nothing changes about how you take money or close out a night",
      "Rolling out takes an afternoon, not a quarter",
    ],
  },
  // The next three are referenced from the navbar dropdown but currently
  // share the simpler card treatment on the landing page.
  {
    slug: "call-waiter",
    title: "Call Waiter",
    tagline: "One tap. Closest server's phone buzzes.",
    body:
      "One tap to call a waiter. Reduce wait times and improve guest satisfaction.",
    tone: "butter",
    highlights: [
      "Four request types: call waiter, request bill, ask for refill, ask for help",
      "Sub-second delivery to the staff PWA",
      "Auto-escalation: requests waiting 3 minutes turn coral and re-route",
      "Hand-off to another server with one tap",
    ],
    detailLead:
      "The original TabCall feature. Guest taps a button at the table. The closest server's phone buzzes within a second. If nobody acknowledges in three minutes, the request turns coral and re-routes to a manager. No more guests trying to make eye contact across the floor.",
    outcomes: [
      "Median acknowledge time under 30 seconds across active venues",
      "Request escalation surfaces stuck tables before the guest complains",
      "Servers stop walking laps just to be visible",
    ],
  },
  {
    slug: "reviews",
    title: "Reviews & Feedback",
    tagline: "Catch the 1-star before Google does.",
    body:
      "Collect more reviews and feedback from happy guests to grow your reputation.",
    tone: "butter",
    highlights: [
      "Every guest is asked to rate at the end of their visit",
      "4 and 5 stars get nudged to your Google profile",
      "1 to 3 stars route to the manager with an AI-classified category",
      "Categories: service speed, drink quality, staff attitude, wait time, food, noise",
    ],
    detailLead:
      "After every payment, TabCall asks the guest for a star rating. High ratings get a soft prompt to leave a Google review. Low ratings route privately to the manager with an AI-classified reason. The manager gets the email at 10:14pm so they can fix it before the 10:42pm Google review.",
    outcomes: [
      "3x fewer 1-star reviews landing on Google",
      "Manager gets bad ratings in real time, with the table and the server name",
      "AI categorisation means trends are visible after a few weeks",
    ],
  },
  {
    slug: "analytics",
    title: "Analytics & Insights",
    tagline: "Response times, turnover, staff productivity — in real time.",
    body:
      "Track performance, response times, table turnover, and staff productivity in real time.",
    tone: "sage",
    highlights: [
      "Median acknowledge and completion time per server",
      "Table turnover by hour, day, and week",
      "Peak-hour heatmaps",
      "Cross-venue benchmarks when you operate multiple locations",
    ],
    detailLead:
      "Every request, order, and payment lands in the analytics dashboard. Slice by server, by table, by hour. See which sections are running hot. Spot the server who's quietly the fastest. Catch the table that always escalates so you can re-route the section.",
    outcomes: [
      "Managers stop guessing which server is the bottleneck",
      "Section assignments get rebalanced from data, not feel",
      "Multi-venue operators can benchmark Houston vs Austin on real numbers",
    ],
  },
];

export function getFeature(slug: string): FeatureCard | undefined {
  return FEATURES.find((f) => f.slug === slug);
}

/** Just the six "primary" features shown in the landing spotlight grid. */
export const PRIMARY_FEATURE_SLUGS: FeatureSlug[] = [
  "qr-orders",
  "digital-menu",
  "wishlist",
  "promotions",
  "pos-integration",
];
