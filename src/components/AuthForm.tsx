"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, UserRound, ArrowRight } from "lucide-react";
import { useApp, authErrorKey } from "@/client/app-context";
import { Logo } from "./brand";
import { Button, Input } from "./ui";
import { HeroCanvas } from "./HeroCanvas";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t, login, register } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (mode === "register" && password.length < 8) { setErr(t("auth.err.weak")); return; }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password); else await register(email, password, name);
      router.push("/me");
    } catch (x) { setErr(t(authErrorKey(x))); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
        <HeroCanvas className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-10 text-white">
          <div className="max-w-md font-display text-[28px] font-semibold leading-tight tracking-tight">{t("home.title")}</div>
          <p className="mt-2 text-[14px] text-white/70">{t("app.tagline")}</p>
        </div>
      </div>
      <div className="backdrop-ambient flex items-center justify-center px-5 py-12">
        <form onSubmit={submit} className="w-full max-w-[400px] animate-fade-up">
          <Logo size={44} />
          <h1 className="mt-6 font-display text-[28px] font-semibold tracking-[-0.02em]">{mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{mode === "login" ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}</p>
          <div className="mt-8 space-y-4">
            {mode === "register" && (
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-[42px] h-4 w-4 text-faint" />
                <Input id="name" label={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" className="pl-10" />
              </div>
            )}
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-[42px] h-4 w-4 text-faint" />
              <Input id="email" type="email" required label={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="pl-10" />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-[42px] h-4 w-4 text-faint" />
              <Input id="password" type="password" required label={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} className="pl-10" />
            </div>
          </div>
          {err && <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-danger">{err}</div>}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-6 w-full">
            {mode === "login" ? t("auth.login") : t("auth.register")}{!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
          <p className="mt-6 text-center text-[13.5px] text-muted">
            {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
            <Link href={mode === "login" ? "/register" : "/login"} className="font-medium text-accent-text hover:underline">{mode === "login" ? t("auth.register") : t("auth.login")}</Link>
          </p>
          <p className="mt-3 text-center"><Link href="/" className="text-[12.5px] text-faint hover:text-fg">{t("auth.guest")}</Link></p>
        </form>
      </div>
    </div>
  );
}
