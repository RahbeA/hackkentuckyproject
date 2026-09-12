/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand dark (near-black) surfaces + main text
        navy: "#0B1120",
        ink: "#111827",
        // Primary blue
        route: "#2563EB",
        azure: "#2563EB",
        accent: {
          DEFAULT: "#2563EB",
          soft: "#EFF6FF",
        },
        sky: "#3B82F6",
        // Neutrals
        canvas: "#F8FAFC",
        paper: "#FFFFFF",
        line: "#E2E8F0",
        slate: {
          DEFAULT: "#64748B",
          light: "#E2E8F0",
          soft: "#F1F5F9",
        },
        muted: "#94A3B8",
        // Operational statuses
        good: "#059669",
        warn: "#D97706",
        bad: "#DC2626",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.06)",
        float: "0 8px 24px rgba(16,24,40,0.10), 0 2px 6px rgba(16,24,40,0.06)",
        nav: "1px 0 0 rgba(226,232,240,1)",
        focus: "0 0 0 4px rgba(37,99,235,0.15)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        pulseSoft: "pulseSoft 2s ease-in-out infinite",
        dartPing: "dartPing 2s ease-out infinite",
        "wordmark-wipe": "wordmarkWipe 2.8s cubic-bezier(.22,1,.36,1) infinite",
        "wordmark-wipe-once": "wordmarkWipeOnce 2.2s cubic-bezier(.22,1,.36,1) forwards",
        "wordmark-edge": "wordmarkEdge 2.8s cubic-bezier(.22,1,.36,1) infinite",
        "wordmark-edge-once": "wordmarkEdgeOnce 2.2s cubic-bezier(.22,1,.36,1) forwards",
        "lockup-lift": "lockupLift 3.2s cubic-bezier(.3,0,.2,1) infinite",
        "lockup-lift-once": "lockupLiftOnce 1.4s cubic-bezier(.3,0,.2,1) forwards",
        "lockup-tag": "lockupTag 3.2s ease-out infinite",
        "lockup-tag-once": "lockupTagOnce 1.4s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.06)" },
        },
        dartPing: {
          "0%": { opacity: ".55", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(2.4)" },
        },
        wordmarkWipe: {
          "0%": { clipPath: "inset(0 100% 0 0)", opacity: "1" },
          "46%": { clipPath: "inset(0 0 0 0)" },
          "88%": { clipPath: "inset(0 0 0 0)", opacity: "1" },
          "100%": { clipPath: "inset(0 0 0 0)", opacity: "0" },
        },
        wordmarkWipeOnce: {
          "0%": { clipPath: "inset(0 100% 0 0)", opacity: "1" },
          "100%": { clipPath: "inset(0 0 0 0)", opacity: "1" },
        },
        wordmarkEdge: {
          "0%": { transform: "translateX(0)", opacity: "0" },
          "7%": { opacity: "1" },
          "46%": { transform: "translateX(var(--wipe-travel, 260px))", opacity: "1" },
          "60%": { transform: "translateX(var(--wipe-travel, 260px))", opacity: "0" },
          "100%": { transform: "translateX(var(--wipe-travel, 260px))", opacity: "0" },
        },
        wordmarkEdgeOnce: {
          "0%": { transform: "translateX(0)", opacity: "0" },
          "8%": { opacity: "1" },
          "92%": { transform: "translateX(var(--wipe-travel, 260px))", opacity: "1" },
          "100%": { transform: "translateX(var(--wipe-travel, 260px))", opacity: "0" },
        },
        lockupLift: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "40%": { opacity: "1", transform: "translateY(0)" },
          "86%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(-6px)" },
        },
        lockupLiftOnce: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        lockupTag: {
          "0%, 38%": { opacity: "0", letterSpacing: "0.04em" },
          "62%": { opacity: "1", letterSpacing: "0.14em" },
          "86%": { opacity: "1", letterSpacing: "0.14em" },
          "100%": { opacity: "0", letterSpacing: "0.14em" },
        },
        lockupTagOnce: {
          "0%": { opacity: "0", letterSpacing: "0.04em" },
          "100%": { opacity: "1", letterSpacing: "0.14em" },
        },
      },
    },
  },
  plugins: [],
};
