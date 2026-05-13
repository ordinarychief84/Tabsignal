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

        // ----- Landing redesign palette (Material 3 token names) -----
        // Adopted from the design mockup. Layered on top of the legacy
        // tokens so admin / staff / operator pages keep working untouched.
        // Used by the landing page and the marketing chrome.
        "brand-lime":            "#D9E392", // primary accent, replacing Warm Butter on the landing
        "primary-deep":          "#0d0b19", // very dark navy used by the landing nav/primary buttons
        "primary-container":     "#232130", // dark surface for the "How it works" block on landing
        "on-primary-container":  "#8b889a", // muted lavender — secondary copy on dark
        "on-primary-fixed":      "#1c1a28",
        "on-primary-fixed-variant": "#474555",
        "primary-fixed":         "#e5e0f5",
        "secondary-container-warm": "#eee3b3", // warm beige — metrics strip bg
        "on-secondary-container":   "#6c653e",
        "on-secondary-fixed-variant": "#4e4724",
        "surface-warm":          "#fff8f6", // very light cream surface
        "surface-container-low": "#fff1eb",
        "surface-container":     "#ffeae0",
        "surface-container-high":    "#fae4da",
        "surface-container-highest": "#f5ded4",
        "surface-variant":       "#f5ded4",
        "tertiary-sage":         "#d7e6df", // soft sage — "request resolved" tile
        "deep-wood":             "#7B5C46",
        "on-surface-variant":    "#48464c",
        "outline-variant":       "#c9c5cc",
        "alert-accent":          "#E8B8B8",
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
