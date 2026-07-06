import type { Metadata } from "next";
import { PLANS } from "@/lib/plans";
import { FEATURES, type FeatureSlug } from "@/lib/features-data";

/**
 * Central SEO configuration: the keyword strategy, per-page metadata
 * builder, and JSON-LD structured-data builders.
 *
 * Strategy (2026-07): TabCall competes for restaurant-tech buyer
 * queries, not consumer queries. Three intent clusters:
 *
 *   1. Category head terms — "QR code ordering for restaurants",
 *      "pay at table", "QR code menu". High volume, competitive;
 *      landing + feature pages carry these.
 *   2. Problem terms — "reduce restaurant wait times", "servers can't
 *      keep up", "guests waiting for the check". How-it-works +
 *      feature detail pages.
 *   3. Comparison / integration terms — "QR ordering for Toast POS",
 *      "Square table ordering integration". POS feature page.
 *
 * Rules of engagement:
 *   - Titles ≤ 60 chars, primary keyword first, brand last.
 *   - Descriptions 140–160 chars, one keyword + one concrete number.
 *   - Every marketing page gets a canonical (prod domain — never a
 *     preview/LAN URL) + OG/Twitter cards.
 *   - JSON-LD only describes content visible on the page (Google's
 *     structured-data policy — no invisible FAQs).
 */

// Canonical origin for SEO artifacts. Deliberately NOT process.env.APP_URL:
// dev/preview deployments must still emit production canonicals, otherwise
// Google indexes preview URLs as duplicates.
export const SITE_URL = "https://www.tab-call.com";
export const SITE_NAME = "TabCall";

const DEFAULT_TITLE = "QR Ordering, Pay-at-Table & Waiter Calls for Restaurants | TabCall";
const DEFAULT_DESCRIPTION =
  "TabCall turns every table into a service point: QR code ordering, pay-at-table, waiter call button, live staff alerts and analytics — on top of your POS, live tonight.";

/** Site-wide keyword pool. Pages pick from + extend this. */
export const CORE_KEYWORDS = [
  "QR code ordering for restaurants",
  "pay at table",
  "QR code payment restaurant",
  "call waiter app",
  "waiter call button",
  "QR code menu",
  "contactless ordering system",
  "restaurant table service app",
  "restaurant guest experience platform",
  "table turn time",
  "hospitality operating system",
];

/** Per-feature search intents — the query each detail page should win. */
export const FEATURE_SEO: Record<
  FeatureSlug,
  { title: string; description: string; keywords: string[] }
> = {
  "qr-payments": {
    title: "QR Code Payment at the Table — Split, Tip & Pay in Seconds",
    description:
      "Guests scan, split by item, tip and pay from their phone — average bill close 1m 32s instead of 8 minutes. Apple Pay, Google Pay, Stripe-secured. No app to install.",
    keywords: [
      "pay at table",
      "QR code payment restaurant",
      "split the bill by item",
      "contactless payment restaurant",
      "Apple Pay restaurant table",
    ],
  },
  "qr-orders": {
    title: "QR Code Ordering System — Guests Order From the Table",
    description:
      "Self-ordering by QR: guests browse, customize and order without flagging a server. Orders land in the live queue and your POS. Setup in minutes, no hardware.",
    keywords: [
      "QR code ordering system",
      "order from table QR code",
      "self ordering system restaurant",
      "QR table ordering",
    ],
  },
  "digital-menu": {
    title: "QR Code Menu for Restaurants — Live, Branded, No Reprints",
    description:
      "A digital menu guests open by scanning the table QR. Update prices and 86'd items live, feature specials, no PDF and no reprints. Works on any phone browser.",
    keywords: [
      "QR code menu for restaurants",
      "digital menu QR",
      "contactless menu",
      "restaurant menu QR code generator",
    ],
  },
  wishlist: {
    title: "Guest Wishlist — Pre-Selected Orders Before the Server Arrives",
    description:
      "Guests build a wishlist from the menu while they decide, then convert it to an order in one tap. Faster first rounds, bigger tickets, fewer menu re-visits.",
    keywords: ["restaurant pre-order", "guest wishlist app", "faster first round"],
  },
  promotions: {
    title: "Restaurant Promotions on Every Table QR — Happy Hour & Specials",
    description:
      "Push happy hour, limited-time items and banners to every table QR the moment guests scan. Time-windowed, no printing, measurable from the analytics dashboard.",
    keywords: [
      "restaurant promotions app",
      "happy hour promotion tool",
      "restaurant specials marketing",
    ],
  },
  "pos-integration": {
    title: "POS Integration — QR Ordering for Toast, Square & Clover",
    description:
      "TabCall sits on top of your POS: orders and payments sync to Toast, Square or Clover automatically. No rip-and-replace, no double entry, live tonight.",
    keywords: [
      "QR ordering Toast POS",
      "Square QR ordering integration",
      "Clover table ordering",
      "POS QR code integration",
    ],
  },
  "call-waiter": {
    title: "Call Waiter Button — Guests Signal, Staff Phones & Watches Buzz",
    description:
      "A waiter call system on every table QR: drink, bill, help or refill. Staff get pinged on phone or smartwatch, first tap claims it, unanswered calls escalate.",
    keywords: [
      "call waiter button",
      "waiter call system",
      "restaurant paging system",
      "table service call button",
      "guest call system for bars",
    ],
  },
  reviews: {
    title: "Review Intercept — Catch Bad Restaurant Reviews Before Google",
    description:
      "Every paid tab invites a rating. Unhappy guests are routed to the manager with an AI-drafted recovery — before the 1-star hits Google. Happy guests go public.",
    keywords: [
      "restaurant review management",
      "intercept negative reviews",
      "restaurant reputation management",
      "guest feedback software",
    ],
  },
  analytics: {
    title: "Restaurant Analytics — Response Times, Table Turns & Tips",
    description:
      "See response time per request, table turn time, tip rates and staff performance for today, 7 and 30 days. Run the floor on data instead of vibes.",
    keywords: [
      "restaurant analytics dashboard",
      "table turn time analytics",
      "restaurant service metrics",
      "staff performance restaurant",
    ],
  },
};

type PageMeta = {
  title: string;
  description: string;
  /** Route path beginning with "/" — becomes the canonical. */
  path: string;
  keywords?: string[];
  /** Set false on utility pages that shouldn't rank (login, terms). */
  index?: boolean;
};

/** Build a complete Metadata object for a marketing page. */
export function pageMetadata({ title, description, path, keywords, index = true }: PageMeta): Metadata {
  const canonical = `${SITE_URL}${path === "/" ? "" : path}` || SITE_URL;
  return {
    title,
    description,
    keywords: keywords ? [...new Set([...keywords, ...CORE_KEYWORDS])] : CORE_KEYWORDS,
    alternates: { canonical },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: CORE_KEYWORDS,
  applicationName: SITE_NAME,
  category: "Restaurant technology",
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

/* ------------------------------ JSON-LD ------------------------------- */

// Serialized with JSON.stringify into a <script type="application/ld+json">.
// Builders return plain objects so pages can compose several into one @graph.

export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    email: "hello@tab-call.com",
    description:
      "TabCall is a hospitality platform for restaurants, bars and cafés: QR ordering, pay-at-table, waiter calls, reviews and analytics on top of any POS.",
  };
}

export function webSiteLd() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/** SoftwareApplication with live plan pricing from lib/plans. */
export function softwareApplicationLd() {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    offers: PLANS.map(p => ({
      "@type": "Offer",
      name: `${p.name} plan`,
      price: (p.monthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      description: p.tagline,
    })),
    featureList: FEATURES.map(f => f.title).join(", "),
  };
}

export type FaqEntry = { question: string; answer: string };

/** Only pass FAQs that are VISIBLE on the page (Google policy). */
export function faqPageLd(faqs: FaqEntry[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map(f => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/** Compose builders into a single @graph payload for one <script> tag. */
export function ldGraph(...nodes: object[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes });
}
