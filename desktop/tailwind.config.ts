import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "sans-serif"],
        ui: ["DM Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        ubongo: {
          accent: "#6366f1",
          violet: "#8b5cf6",
          lite: "#818cf8",
          power: "#a855f7",
          pro: "#3b82f6",
        },
        glass: {
          bg: "rgba(10, 10, 18, 0.88)",
          surface: "rgba(255, 255, 255, 0.04)",
          border: "rgba(255, 255, 255, 0.07)",
          "border-2": "rgba(255, 255, 255, 0.12)",
          hover: "rgba(255, 255, 255, 0.08)",
          input: "rgba(255, 255, 255, 0.05)",
        },
      },
      borderRadius: {
        glass: "20px",
        "glass-sm": "12px",
        "glass-xs": "8px",
      },
      keyframes: {
        "spin-border": {
          to: { "--angle": "360deg" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.85)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "glass-reflect": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "spin-border": "spin-border 5s linear infinite",
        shimmer: "shimmer 1.3s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        "slide-up": "slide-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "glass-reflect": "glass-reflect 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
