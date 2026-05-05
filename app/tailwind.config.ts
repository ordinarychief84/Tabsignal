import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0F172A",
          accent: "#F59E0B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
