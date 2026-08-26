import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* =================================================================
         * TabCall brand, 2026 refresh.
         *
         * Warm, human, hospitality-focused. Predominantly light: Warm Ivory
         * canvas, white cards, Deep Plum for authority, Saffron for action.
         *
         * TWO LAYERS, on purpose:
         *
         *  1. Named brand + semantic tokens (below). New and refactored code
         *     uses these — `bg-ivory`, `text-plum`, `bg-surface`, `border-line`.
         *
         *  2. Legacy aliases (further down) remapped onto the same hexes.
         *     138 files reference `bg-oat`, `text-slate`, `bg-chartreuse` and
         *     friends. Renaming those classes would be a thousand-line diff
         *     across working business logic for zero visual difference —
         *     remapping the VALUES migrates every one of them safely, then
         *     the screens that matter get hand-tuned on top.
         * ================================================================= */

        /* ---------- brand ---------- */
        plum: {
          DEFAULT: "#34263F", // Deep Plum — anchor: wordmark, headings, sidebar
          soft:    "#4A3856", // one step up, for layered dark surfaces
        },
        saffron: {
          DEFAULT: "#F4C95D", // signature interaction colour
          deep:    "#8A6A17", // readable Saffron-family text on light surfaces
          soft:    "#FDF2D8", // wash for pending/selected backgrounds
        },
        mint: {
          DEFAULT: "#CFE3D8", // Fresh Mint — positive, completed, acknowledged
          deep:    "#3F6B54", // readable mint-family text
        },
        apricot: {
          DEFAULT: "#F2B38F", // discovery, specials, merchandising
          deep:    "#8C4A26", // readable apricot-family text
        },
        clay: {
          DEFAULT: "#D97878", // Rose Clay — attention, recovery. Sparingly.
          deep:    "#8E3B3B", // readable clay-family text
          soft:    "#F7E4E4", // soft wash so problems don't read as alarms
        },
        ivory:     "#FBF8F2",  // Warm Ivory — the dominant background
        graphite:  "#403A43",  // secondary typography
        sandstone: "#E8E0D7",  // borders and structural separation

        /* ---------- semantic ----------
         * What a colour MEANS, so components stop naming hues. */
        background:  "#FBF8F2",
        surface:     "#FFFFFF",
        "surface-muted": "#F4EFE7", // inset panels, table stripes
        "surface-hover": "#F7F2EA",
        line:        "#E8E0D7",
        "line-strong": "#D6CABB",
        "text-primary":   "#34263F",
        "text-secondary": "#403A43",
        "text-muted":     "#7A7280",
        "text-on-dark":   "#FBF8F2",
        disabled:    "#B7AFA5",
        focus:       "#34263F",

        /* Service lifecycle. Named by STATE, not by hue, so a status can be
         * restyled without hunting for every card that renders it. */
        "service-pending":      "#FDF2D8",
        "service-acknowledged": "#CFE3D8",
        "service-completed":    "#E4EFE8",
        "service-overdue":      "#F7E4E4",
        warning:     "#F4C95D",
        success:     "#CFE3D8",
        promotion:   "#F2B38F",
        danger:      "#D97878",

        /* ---------- legacy aliases, remapped ----------
         * Same class names the app already uses, new brand values. */
        slate: {
          DEFAULT: "#34263F", // was Deep Ink → Deep Plum
          light:   "#4A3856",
        },
        oat:   "#FBF8F2",     // was Soft Linen → Warm Ivory
        linen: "#FFFFFF",     // inset surfaces are now plain white
        chartreuse: {
          DEFAULT: "#F4C95D", // was Warm Butter → Saffron
          deep:    "#8A6A17",
        },
        coral: {
          DEFAULT: "#D97878", // was Terracotta → Rose Clay
          soft:    "#F7E4E4",
        },
        sea: {
          DEFAULT: "#3F6B54", // was Deep Sage → readable mint
          soft:    "#CFE3D8", // was Sage → Fresh Mint
        },
        umber: {
          DEFAULT: "#7A7280", // was Deep Clay → muted graphite
          soft:    "#E8D9C8", // was Clay → warm sandstone tint for dividers
        },
        brand: { DEFAULT: "#34263F", accent: "#F4C95D" },

        /* Landing/marketing tokens, remapped off the old lime direction. */
        "brand-lime":            "#F4C95D",
        "primary-deep":          "#34263F",
        "primary-container":     "#34263F",
        "on-primary-container":  "#B3A9BC",
        "on-primary-fixed":      "#2A1E33",
        "on-primary-fixed-variant": "#5A4A66",
        "primary-fixed":         "#EDE6F0",
        "secondary-container-warm": "#FDF2D8",
        "on-secondary-container":   "#8A6A17",
        "on-secondary-fixed-variant": "#6B520F",
        "surface-warm":          "#FBF8F2",
        "surface-container-low": "#F7F2EA",
        "surface-container":     "#F4EFE7",
        "surface-container-high":    "#EFE8DD",
        "surface-container-highest": "#E8E0D7",
        "surface-variant":       "#E8E0D7",
        "tertiary-sage":         "#CFE3D8",
        "deep-wood":             "#8C4A26",
        "on-surface-variant":    "#403A43",
        "outline-variant":       "#E8E0D7",
        "alert-accent":          "#F7E4E4",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "Arial", "sans-serif"],
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
