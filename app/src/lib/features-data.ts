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
  | "qr-payments"
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
    slug: "qr-payments",
    title: "QR Payments at the Table",
    tagline: "Pay from the table. No app. No wait.",
    body:
      "Guests can pay securely from their phone in seconds. No app. No hassle.",
    tone: "butter",
    highlights: [
      "Apple Pay, Google Pay, all major cards and wallets",
      "Split by item or by share, two guests can pay different items",
      "Add tips with three taps — 15 / 20 / 25 or custom",
      "Stripe-secured, PCI compliant, no card data stored on TabCall",
    ],
    detailLead:
      "TabCall takes the last 8 minutes off your service cycle. Guests scan the table QR, see their bill, split if they want, tip, and pay. Your server never walks the check back — they just close the tab in the live queue.",
    outcomes: [
      "1m 32s average bill close, down from 8 minutes on a paper tab",
      "Server time saved goes to running food and turning tables faster",
      "Digital tips average 1.3 percentage points higher than paper",
    ],
  },
  {
    slug: "qr-orders",
    title: "QR Orders from the Table",
    tagline: "Browse the menu, order without flagging a server.",
    body:
      "Let guests browse the digital menu and place orders directly from their table.",
    tone: "sage",
    highlights: [
      "Categorised menu (Starters, Mains, Drinks, Desserts) with photos",
      "Featured items at the top so the kitchen-favourable items move",
      "Add-ons, modifiers, allergen flags",
      "Pre-order from QR before the guest is seated — pickup code on confirm",
    ],
    detailLead:
      "Guests open the menu, pick what they want, send the order straight to the kitchen. Servers stay out of the order loop and run the floor instead. The order appears in the live queue with a 3-minute escalation timer so nothing stalls.",
    outcomes: [
      "Average order entry time drops from 4 minutes to under 60 seconds",
      "Bar covers per server increase because servers stop transcribing",
      "Pre-orders let a 7pm reservation walk in to drinks already on the way",
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
    title: "Wishlist",
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
    title: "Seamless POS Integration",
    tagline: "Orders sync in real time. No double entry.",
    body:
      "All orders sync in real-time with your POS. No double entry. No missed orders.",
    tone: "sage",
    highlights: [
      "Toast, Square, and Clover providers (preview)",
      "Two-way sync: TabCall orders land in your POS, POS price changes land in TabCall",
      "Menu price updates flow automatically — change in one place, both update",
      "No POS? Run TabCall standalone, no integration needed",
    ],
    detailLead:
      "TabCall sits on top of your existing POS, not next to it. Orders go in the POS the way they always did, so your kitchen printer, your prep stations, your tax setup, and your closing reports keep working. We never touch your menu hierarchy or your tax setup.",
    outcomes: [
      "Servers stop double-keying orders into the POS after the guest pays",
      "Closing-day reports stay accurate because every order lands in one place",
      "Menu drift between POS and TabCall is eliminated",
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
      "Every guest is asked to rate after paying",
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
  "qr-payments",
  "qr-orders",
  "digital-menu",
  "wishlist",
  "promotions",
  "pos-integration",
];
