import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TabCall brand palette — "Last Call" (use ONLY these — see docs/BRAND.md)
        slate:       { DEFAULT: "#0E0F1A", light: "#1A1C2C" }, // inkwell / midnight — dark surfaces
        oat:         "#F8F6F1",                                 // bone — light surfaces
        chartreuse:  "#C9F61C",                                 // electric lime — primary action / live signals
        coral:       "#F25C42",                                 // hot coral — alerts / delays
        sea:         "#5BD0B3",                                 // sea glass — secondary accents
        umber:       "#8B6F4E",                                 // whiskey — section accent (CTA band)
        // Legacy alias — older pages use bg-brand / text-brand / ring-brand-accent.
        brand:       { DEFAULT: "#0E0F1A", accent: "#C9F61C" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
