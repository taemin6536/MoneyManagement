import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        mm: {
          bg: "var(--mm-bg)",
          "bg-sub": "var(--mm-bg-sub)",
          surface: "var(--mm-surface)",
          "surface-2": "var(--mm-surface-2)",
          border: "var(--mm-border)",
          "border-soft": "var(--mm-border-soft)",
          text: "var(--mm-text)",
          "text-dim": "var(--mm-text-dim)",
          "text-mute": "var(--mm-text-mute)",
          green: "var(--mm-green)",
          red: "var(--mm-red)",
          amber: "var(--mm-amber)",
          violet: "var(--mm-violet)",
          accent: "var(--mm-accent)",
          "accent-dim": "var(--mm-accent-dim)",
          up: "var(--mm-up)",
          down: "var(--mm-down)",
        },
      },
      fontFamily: {
        sans: ['"Outfit"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        "tight-numeric": "-0.2px",
        "hero-numeric": "-1px",
      },
      borderRadius: {
        card: "8px",
        pill: "999px",
        chip: "4px",
        btn: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
