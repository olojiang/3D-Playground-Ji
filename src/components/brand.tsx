"use client";
/** Brand mark and per-track icons (hand-drawn SVG, theme-aware via currentColor and CSS vars). */
import { Box, Sparkles, Cpu, type LucideIcon } from "lucide-react";
import type { Category } from "@/core/examples";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent-2)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient>
        <linearGradient id="lg-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".95" /><stop offset="1" stopColor="var(--accent)" stopOpacity=".55" /></linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="var(--surface-2)" stroke="var(--border-strong)" />
      {/* isometric cube */}
      <path d="M16 6.5 25 11.5 16 16.5 7 11.5Z" fill="url(#lg-a)" />
      <path d="M7 11.5 16 16.5V26L7 21Z" fill="url(#lg-b)" />
      <path d="M25 11.5 16 16.5V26L25 21Z" fill="var(--accent)" fillOpacity=".32" />
      <path d="M16 6.5 25 11.5V21L16 26 7 21V11.5Z" fill="none" stroke="color-mix(in srgb, white 35%, transparent)" strokeWidth=".6" />
    </svg>
  );
}

export const CATEGORY_ICON: Record<Category, LucideIcon> = { three: Box, webgl: Sparkles, gpu: Cpu };

/** A decorative gradient tile behind each track's icon. */
export function TrackGlyph({ category, size = 44 }: { category: Category; size?: number }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <div className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface2 text-accent-text shadow-card" style={{ width: size, height: size }}>
      <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%)" }} />
      <Icon className="relative" style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.6} />
    </div>
  );
}
