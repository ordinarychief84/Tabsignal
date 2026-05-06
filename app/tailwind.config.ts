import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TabCall brand palette (use ONLY these)
        slate:       { DEFAULT: "#2B2539", light: "#3A3346" }, // dark surfaces
        oat:         "#EBE9E4",                                 // light surfaces
        chartreuse:  "#EEEFC8",                                 // primary action / active signals
        coral:       "#EFC8C8",                                 // alerts / delays
        sea:         "#BED3CC",                                 // secondary accents / icons
        umber:       "#7B6767",                                 // section accent
        // Legacy alias — older pages use bg-brand / text-brand / ring-brand-accent.
        brand:       { DEFAULT: "#2B2539", accent: "#EEEFC8" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
