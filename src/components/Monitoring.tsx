"use client";
import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { installErrorReporter } from "@/client/telemetry";

/** Vercel Web Analytics + Speed Insights, and the self-hosted error reporter (production only). */
export function Monitoring() {
  useEffect(() => (process.env.NODE_ENV === "production" ? installErrorReporter() : undefined), []);
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
