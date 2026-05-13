import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TabCall hospitality palette. Tokens preserved from legacy "Last Call"
        // build so existing utility classes (bg-slate, text-coral, etc.) keep
        // working — the underlying hex values are remapped to the brighter
        // hospitality-SaaS direction (Toast / Resy / SevenRooms feel).
        //
        // Usage rule: 70% light surfaces, 20% warm neutrals, 10% dark accents.
        // Dark surfaces (slate) are reserved for navbar, footer, dashboard
        // sidebar, and small accents. Cards and main backgrounds use oat.
        slate: {
          DEFAULT: "#232130", // Deep Ink — sparingly: nav, footer, sidebar
          light:   "#2F2D3E", // one shade up for layered dark surfaces
        },
        oat:   "#F7F5F2",     // Soft Linen — dominant page/card background
        linen: "#FBFAF7",     // even lighter surface for inset cards on oat

        // Warm Butter — primary CTA. Pair with text-slate for AA contrast.
        // `deep` is the readable accent text for use on light surfaces.
        chartreuse: {
          DEFAULT: "#F2E7B7", // Warm Butter
          deep:    "#8A6F2E", // Honey — readable on oat/white
        },

        // Coral — alerts, delayed states. `DEFAULT` is the readable text /
        // solid badge tone. `soft` is the Soft Coral wash for backgrounds.
        coral: {
          DEFAULT: "#C8634F", // Terracotta — text + solid alert pills
          soft:    "#E8B8B8", // Soft Coral — surface wash for warnings
        },

        // Sage — secondary highlights, informational states.
        sea: {
          DEFAULT: "#6F9586", // Deep Sage — readable accent text
          soft:    "#C7D6CF", // Sage — surface, icon background
        },

        // Clay — supporting UI, dividers, eyebrow labels.
        umber: {
          DEFAULT: "#7A6B61", // Deep Clay — readable label text
          soft:    "#B7A39A", // Clay — dividers, soft borders
        },

        // Legacy alias — older pages still reference bg-brand / text-brand.
        brand: { DEFAULT: "#232130", accent: "#F2E7B7" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "Arial", "sans-serif"],
      },
      boxShadow: {
        // Hospitality-soft elevation set. Replaces shadow-xl/2xl heavy lifts.
        card:  "0 1px 2px rgba(35, 33, 48, 0.04), 0 1px 3px rgba(35, 33, 48, 0.06)",
        soft:  "0 4px 16px rgba(35, 33, 48, 0.06)",
        lift:  "0 12px 32px rgba(35, 33, 48, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
