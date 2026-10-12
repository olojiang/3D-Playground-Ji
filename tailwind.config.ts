import type { Config } from "tailwindcss";
import { DURATION, EASE } from "./src/core/motion";

const v = (name: string) => `var(--${name})`;
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), bg2: v("bg-2"), surface: v("surface"), surface2: v("surface-2"), surface3: v("surface-3"), line: v("border"),
        fg: v("text"), muted: v("muted"), accent: v("accent"), accent2: v("accent-2"), "accent-fg": v("accent-fg"), "accent-soft": v("accent-soft"),
        short: v("short"), long: v("long"), track: v("track"), danger: v("danger"), success: v("success"), phase: v("ph"), phase2: v("ph2"),
      },
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "-apple-system", "BlinkMacSystemFont", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "'Noto Sans CJK SC'", "sans-serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        card: "0 1px 2px 0 color-mix(in srgb, var(--shadow) 5%, transparent), 0 12px 32px -16px color-mix(in srgb, var(--shadow) 16%, transparent)",
        pop: "0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent), 0 16px 48px -12px color-mix(in srgb, var(--shadow) 32%, transparent), 0 4px 12px -4px color-mix(in srgb, var(--shadow) 14%, transparent)",
      },
      // motion tokens — the same constants motion/react uses (src/core/motion.ts)
      transitionDuration: Object.fromEntries(Object.entries(DURATION).map(([k, ms]) => [k, `${ms}ms`])),
      transitionTimingFunction: Object.fromEntries(Object.entries(EASE).map(([k, e]) => [k, `cubic-bezier(${e.join(",")})`])),
      screens: { xs: "420px", "3xl": "1800px" },
    },
  },
  plugins: [],
} satisfies Config;
