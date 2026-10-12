/**
 * The motion system — one place for every duration, easing and spring.
 * CSS reads them as custom properties (motionCssVars → <style> in the root layout, Tailwind `duration-*` / `ease-*`),
 * JS (motion/react) reads the same constants. Pure, no DOM.
 */

export const DURATION = {
  instant: 90, // press feedback, colour flips
  fast: 160, // hovers, small fades
  base: 240, // popovers, list items, toggles
  slow: 420, // sheets, dialogs, page enter
  slower: 640, // charts growing in, celebration
  morph: 800, // theme cross-fade
} as const;
export type DurationToken = keyof typeof DURATION;

export const EASE = {
  /** Default UI curve — fast start, long gentle settle (expo-ish out). */
  out: [0.16, 1, 0.3, 1],
  /** Symmetric, for things that move and come back (breathing, morphs). */
  inOut: [0.65, 0, 0.35, 1],
  /** Exits: accelerate away. */
  in: [0.55, 0, 1, 0.45],
  /** Standard material-ish curve for colour / opacity. */
  standard: [0.2, 0, 0, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type EaseToken = keyof typeof EASE;

/** Springs for motion/react. All close to critical damping: settle, never wobble. */
export const SPRING = {
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 1 },
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
  sheet: { type: "spring", stiffness: 380, damping: 40, mass: 1 },
} as const;

export const ease = (t: EaseToken) => `cubic-bezier(${EASE[t].join(",")})`;
/** Seconds for motion/react; zero when motion is reduced. */
export const dur = (t: DurationToken, reduced = false) => (reduced ? 0 : DURATION[t] / 1000);
