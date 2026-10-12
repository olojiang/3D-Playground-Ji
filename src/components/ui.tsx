"use client";
/** Design-system primitives. Every screen is built from these so spacing, radii, shadows and motion stay consistent. */
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X, Loader2 } from "lucide-react";
import { SPRING } from "@/core/motion";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary: "text-accent-fg bg-accent shadow-glow hover:brightness-110 active:brightness-95 [background-image:linear-gradient(180deg,color-mix(in_srgb,white_14%,transparent),transparent)]",
  secondary: "bg-surface text-fg shadow-card border border-line hover:border-line-strong hover:bg-surface2",
  ghost: "text-muted hover:text-fg hover:bg-surface2",
  subtle: "bg-surface2 text-fg border border-line hover:bg-surface3",
  danger: "bg-danger text-white hover:brightness-110",
};
const SIZES = { sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg", md: "h-10 px-4 text-sm gap-2 rounded-xl", lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...p }, ref) {
  return (
    <button ref={ref} disabled={disabled || loading} className={cx("ring-focus inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-fast ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50", VARIANTS[variant], SIZES[size], className)} {...p}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: "sm" | "md" }>(
  function IconButton({ label, active, size = "md", className, children, ...p }, ref) {
    return (
      <button ref={ref} aria-label={label} title={label} aria-pressed={active}
        className={cx("ring-focus inline-flex shrink-0 items-center justify-center rounded-lg transition-all duration-fast ease-out active:scale-95 disabled:opacity-40",
          size === "sm" ? "h-7 w-7" : "h-9 w-9", active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface2 hover:text-fg", className)} {...p}>
        {children}
      </button>
    );
  });

export function Card({ className, children, interactive, ...p }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cx("rounded-2xl border border-line bg-surface shadow-card", interactive && "transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-lift", className)} {...p}>{children}</div>;
}

export function Chip({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "accent" | "success" | "warning" | "danger"; className?: string }) {
  const tones = {
    default: "bg-surface2 text-muted border-line",
    accent: "bg-accent-soft text-accent-text border-transparent",
    success: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success border-transparent",
    warning: "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning border-transparent",
    danger: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger border-transparent",
  };
  return <span className={cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11.5px] font-medium", tones[tone], className)}>{children}</span>;
}

export function Kbd({ keys }: { keys: string[][] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((step, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="mx-0.5 text-[10px] text-faint">→</span>}
          {step.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}
        </span>
      ))}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }>(function Input({ label, error, className, id, ...p }, ref) {
  const field = (
    <input ref={ref} id={id} className={cx("ring-focus h-11 w-full rounded-xl border bg-surface2 px-3.5 text-sm text-fg placeholder:text-faint transition-colors duration-fast",
      error ? "border-danger" : "border-line hover:border-line-strong focus:border-accent", className)} {...p} />
  );
  if (!label) return field;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {field}
      {error && <span className="mt-1.5 block text-xs text-danger">{error}</span>}
    </label>
  );
});

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("ring-focus relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-base", checked ? "border-transparent bg-accent" : "border-line bg-surface3")}>
      <span className={cx("absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-md transition-transform duration-base ease-out", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl border border-line bg-surface2 p-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("ring-focus relative rounded-[10px] font-medium transition-colors duration-fast", size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]", value === o.value ? "text-fg" : "text-muted hover:text-fg")}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} transition={SPRING.snappy} className="absolute inset-0 rounded-[10px] bg-surface shadow-card" />}
          <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, children, className, label, top }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; label: string; top?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("input,button,[tabindex]")?.focus());
    return () => { window.removeEventListener("keydown", k, true); prev?.focus?.(); };
  }, [open, onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cx("fixed inset-0 z-[80] flex justify-center p-4", top ? "items-start pt-[12vh]" : "items-center")}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div ref={panel} role="dialog" aria-modal="true" aria-label={label}
            initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={SPRING.sheet}
            className={cx("relative w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-pop", className)}>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ModalHeader({ title, onClose, closeLabel }: { title: ReactNode; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <IconButton label={closeLabel} onClick={onClose} size="sm"><X className="h-4 w-4" /></IconButton>
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions, icon }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        {icon && <div className="mt-1 hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-accent-text shadow-card sm:flex">{icon}</div>}
        <div>
          {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">{eyebrow}</div>}
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-surface3", className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-slower ease-out" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface2 text-faint">{icon}</div>
      <p className="max-w-sm text-sm text-muted">{children}</p>
    </div>
  );
}
