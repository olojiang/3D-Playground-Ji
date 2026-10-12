"use client";
import { createContext, useContext, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { AppProvider } from "@/client/app-context";
import type { ExampleSummary } from "@/core/examples";
import type { Lang } from "@/core/userdata";
import { Shell } from "./Shell";

const CatalogCtx = createContext<ExampleSummary[]>([]);
/** Lightweight list of every lesson (no article text, no code) for navigation, search and progress. */
export const useCatalog = () => useContext(CatalogCtx);

export function Providers({ children, initialLang, catalog }: { children: ReactNode; initialLang: Lang; catalog: ExampleSummary[] }) {
  return (
    <CatalogCtx.Provider value={catalog}>
      <AppProvider initialLang={initialLang}>
        <MotionConfig reducedMotion="user">
          <Shell>{children}</Shell>
        </MotionConfig>
      </AppProvider>
    </CatalogCtx.Provider>
  );
}
