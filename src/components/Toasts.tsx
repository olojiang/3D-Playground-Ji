"use client";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useApp } from "@/client/app-context";
import { SPRING } from "@/core/motion";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.button key={x.id} layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }} transition={SPRING.snappy}
            onClick={() => dismissToast(x.id)}
            className="glass pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line px-4 py-2.5 text-[13.5px] font-medium shadow-pop">
            {x.tone === "success" ? <CheckCircle2 className="h-4 w-4 text-success" /> : x.tone === "error" ? <AlertCircle className="h-4 w-4 text-danger" /> : <Info className="h-4 w-4 text-accent-text" />}
            {x.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
