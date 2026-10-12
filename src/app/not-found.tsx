"use client";
import Link from "next/link";
import { useApp } from "@/client/app-context";
import { Button } from "@/components/ui";
import { Logo } from "@/components/brand";

export default function NotFound() {
  const { t } = useApp();
  return (
    <div className="backdrop-ambient flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo size={56} />
      <div className="font-display text-[64px] font-semibold leading-none tracking-tight text-gradient">404</div>
      <p className="text-muted">{t("common.notFound")}</p>
      <Link href="/"><Button variant="primary">{t("common.goHome")}</Button></Link>
    </div>
  );
}
