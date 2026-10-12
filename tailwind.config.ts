import type { Config } from "tailwindcss";
import { DURATION, EASE } from "./src/core/motion";

const v = (name: string) => `var(--${name})`;
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), bg2: v("bg-2"), surface: v("surface"), surface2: v("surface-2"), surface3: v("surface-3"),
        line: v("border"), "line-strong": v("border-strong"),
        fg: v("text"), muted: v("muted"), faint: v("faint"),
        accent: v("accent"), accent2: v("accent-2"), "accent-fg": v("accent-fg"), "accent-text": v("accent-text"), "accent-soft": v("accent-soft"),
        danger: v("danger"), success: v("success"), warning: v("warning"), code: v("code-bg"),
      },
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "-apple-system", "BlinkMacSystemFont", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "'Noto Sans CJK SC'", "sans-serif"],
        mono: ["'JetBrains Mono Variable'", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        display: ["var(--font-display)"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem", "3xl": "1.5rem" },
      boxShadow: {
        hair: "0 0 0 1px var(--border)",
        card: "0 1px 0 0 color-mix(in srgb, white 4%, transparent) inset, 0 1px 2px 0 color-mix(in srgb, var(--shadow) 6%, transparent), 0 12px 32px -18px color-mix(in srgb, var(--shadow) 22%, transparent)",
        lift: "0 1px 0 0 color-mix(in srgb, white 5%, transparent) inset, 0 2px 4px -1px color-mix(in srgb, var(--shadow) 8%, transparent), 0 24px 48px -20px color-mix(in srgb, var(--shadow) 34%, transparent), 0 0 0 1px color-mix(in srgb, var(--glow) 18%, var(--border))",
        pop: "0 0 0 1px color-mix(in srgb, var(--border-strong) 80%, transparent), 0 24px 64px -16px color-mix(in srgb, var(--shadow) 45%, transparent), 0 6px 16px -6px color-mix(in srgb, var(--shadow) 18%, transparent)",
        glow: "0 0 0 1px color-mix(in srgb, var(--glow) 40%, transparent), 0 8px 28px -6px color-mix(in srgb, var(--glow) 55%, transparent)",
      },
      transitionDuration: Object.fromEntries(Object.entries(DURATION).map(([k, ms]) => [k, `${ms}ms`])),
      transitionTimingFunction: Object.fromEntries(Object.entries(EASE).map(([k, e]) => [k, `cubic-bezier(${e.join(",")})`])),
      screens: { xs: "420px", "3xl": "1800px" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        "fade-up": "fade-up 420ms cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.4s linear infinite",
        "spin-slow": "spin-slow 18s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
