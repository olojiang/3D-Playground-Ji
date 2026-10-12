"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Settings as SettingsIcon, Palette, Code2, Keyboard, UserRound, Database, AlertTriangle, Check, Download, Upload, RotateCcw } from "lucide-react";
import { useApp } from "@/client/app-context";
import { api } from "@/client/source";
import { THEME_IDS, type ThemePref } from "@/core/themes";
import { resolveBindings, formatBinding, findConflicts, normalizeBinding, SHORTCUTS, type KeyLike } from "@/core/shortcuts";
import { FONT_MIN, FONT_MAX, LANG_NAME } from "@/core/userdata";
import type { MessageKey } from "@/core/i18n";
import { PageHeader, Card, Segmented, Switch, Button, Input, Kbd, cx } from "./ui";
import { GROUP_ORDER } from "./ShortcutHelp";

function Section({ icon, title, children, id }: { icon: ReactNode; title: string; children: ReactNode; id: string }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-faint">{icon}{title}</h2>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="text-[14px] font-medium">{label}</div>{hint && <div className="mt-0.5 text-[12.5px] text-muted">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Convert a keydown into binding text: "mod+shift+k", or null for bare modifiers. */
function eventToBinding(e: KeyLike, mac: boolean): string | null {
  const k = e.key.toLowerCase();
  if (["shift", "meta", "control", "alt"].includes(k)) return null;
  const mod = mac ? e.metaKey : e.ctrlKey;
  const key = e.altKey && e.code?.startsWith("Digit") ? e.code.slice(5) : e.altKey && e.code?.startsWith("Key") ? e.code.slice(3).toLowerCase() : k === " " ? "space" : k;
  const symbol = key.length === 1 && /[^a-z0-9]/.test(key);
  return [mod && "mod", e.altKey && "alt", e.shiftKey && !symbol && "shift", symbol && e.shiftKey ? `shift+${key}` : key].filter(Boolean).join("+");
}

function ShortcutEditor() {
  const { t, settings, updateSettings, mac } = useApp();
  const [recording, setRecording] = useState<string | null>(null);
  const defs = useMemo(() => resolveBindings(settings.shortcuts), [settings.shortcuts]);
  const conflicts = useMemo(() => findConflicts(defs), [defs]);
  const conflictOf = (id: string) => { const c = conflicts.find((p) => p.includes(id)); return c ? (c[0] === id ? c[1] : c[0]) : null; };

  const record = (id: string) => {
    setRecording(id);
    document.body.dataset.recordingShortcut = "1";
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const done = () => { window.removeEventListener("keydown", onKey, true); setRecording(null); delete document.body.dataset.recordingShortcut; };
      if (e.key === "Escape") return done();
      if (e.key === "Backspace") { const next = { ...settings.shortcuts }; delete next[id]; updateSettings({ shortcuts: next }); return done(); }
      const b = eventToBinding(e, mac);
      if (!b) return;
      const def = SHORTCUTS.find((d) => d.id === id)!;
      const next = { ...settings.shortcuts };
      if (normalizeBinding(b) === normalizeBinding(def.keys)) delete next[id]; else next[id] = b;
      updateSettings({ shortcuts: next });
      done();
    };
    window.addEventListener("keydown", onKey, true);
  };

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">{t("settings.shortcuts.hint")}</p>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => updateSettings({ shortcuts: {} })} disabled={!Object.keys(settings.shortcuts).length}>{t("settings.shortcuts.reset")}</Button>
      </div>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {GROUP_ORDER.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t(`sc.group.${g}` as MessageKey)}</div>
            <ul className="space-y-0.5">
              {defs.filter((d) => d.group === g).map((d) => {
                const other = conflictOf(d.id);
                const custom = d.id in settings.shortcuts;
                return (
                  <li key={d.id}>
                    <button onClick={() => record(d.id)} className={cx("ring-focus flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors hover:bg-surface2", recording === d.id && "bg-accent-soft")}>
                      <span className="min-w-0">
                        <span className={cx(custom ? "text-fg" : "text-muted")}>{t(`sc.${d.id}` as MessageKey)}</span>
                        {other && <span className="ml-2 text-[11.5px] text-warning">{t("settings.shortcuts.conflict", { other: t(`sc.${other}` as MessageKey) })}</span>}
                      </span>
                      {recording === d.id ? <span className="animate-pulse text-[12px] font-medium text-accent-text">{t("settings.shortcuts.press")}</span> : <Kbd keys={formatBinding(d.keys, mac)} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsView() {
  const { t, settings, updateSettings, user, setUser, toast, logout } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [delPw, setDelPw] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const saveName = async () => {
    try { const r = await api<{ user: typeof user }>("/api/account", { method: "PUT", body: JSON.stringify({ name }) }); setUser(r.user); toast(t("settings.saved"), "success"); }
    catch { toast(t("common.error"), "error"); }
  };
  const changePw = async () => {
    try { await api("/api/account/password", { method: "PUT", body: JSON.stringify(pw) }); setPw({ current: "", next: "" }); toast(t("settings.passwordChanged"), "success"); }
    catch (e) { toast((e as { code?: string }).code === "weak" ? t("auth.err.weak") : t("auth.err.invalid"), "error"); }
  };
  const exportData = () => { window.location.href = "/api/export"; };
  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const r = await api<{ imported: { snippets: number; favorites: number; progress: number } }>("/api/import", { method: "POST", body: JSON.stringify(data) });
      toast(t("settings.imported", r.imported), "success");
      setTimeout(() => window.location.reload(), 900);
    } catch { toast(t("common.error"), "error"); }
  };
  const deleteAccount = async () => {
    try { await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: delPw }) }); await logout(); window.location.href = "/"; }
    catch { toast(t("auth.err.invalid"), "error"); }
  };

  const themeOptions: ThemePref[] = ["system", ...THEME_IDS];
  return (
    <div className="backdrop-ambient min-h-dvh">
      <div className="mx-auto max-w-[1100px] space-y-10 px-5 py-10 sm:px-8 lg:py-14">
        <PageHeader icon={<SettingsIcon className="h-6 w-6" />} title={t("settings.title")} subtitle={!user ? t("settings.guest") : undefined} />

        <Section id="appearance" icon={<Palette className="h-4 w-4" />} title={t("settings.appearance")}>
          <div className="px-5 py-5">
            <div className="mb-3 text-[14px] font-medium">{t("settings.theme")}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {themeOptions.map((id) => {
                const active = settings.theme === id;
                return (
                  <button key={id} onClick={() => updateSettings({ theme: id })} aria-pressed={active}
                    className={cx("ring-focus group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all duration-base hover:-translate-y-0.5", active ? "border-accent shadow-glow" : "border-line hover:border-line-strong hover:shadow-card")}>
                    {id === "system" ? (
                      <span className="flex h-16 overflow-hidden rounded-lg border border-line"><span className="w-1/2 bg-[#f6f6f8]" /><span className="w-1/2 bg-[#08080b]" /></span>
                    ) : (
                      <ThemePreview id={id} />
                    )}
                    <span className="mt-2 flex items-center justify-between text-[12.5px] font-medium">
                      {id === "system" ? t("settings.theme.system") : t(`theme.${id}` as MessageKey)}
                      {active && <Check className="h-3.5 w-3.5 text-accent-text" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <Row label={t("settings.language")}>
            <Segmented value={settings.lang} onChange={(v) => updateSettings({ lang: v })} options={[{ value: "zh", label: LANG_NAME.zh.full }, { value: "en", label: LANG_NAME.en.full }]} />
          </Row>
          <Row label={t("settings.motion")}>
            <Segmented value={settings.motion} onChange={(v) => updateSettings({ motion: v })} options={[{ value: "system", label: t("settings.motion.system") }, { value: "full", label: t("settings.motion.full") }, { value: "reduced", label: t("settings.motion.reduced") }]} />
          </Row>
        </Section>

        <Section id="editor" icon={<Code2 className="h-4 w-4" />} title={t("settings.editor")}>
          <Row label={t("settings.fontSize")}>
            <div className="flex items-center gap-3">
              <input type="range" min={FONT_MIN} max={FONT_MAX} value={settings.editorFontSize} onChange={(e) => updateSettings({ editorFontSize: Number(e.target.value) })} className="w-40 accent-[var(--accent)]" aria-label={t("settings.fontSize")} />
              <span className="w-10 text-right font-mono text-[13px] tabular-nums text-muted">{settings.editorFontSize}px</span>
            </div>
          </Row>
          <Row label={t("settings.layout")}>
            <Segmented value={settings.layout} onChange={(v) => updateSettings({ layout: v })} options={[{ value: "split", label: t("settings.layout.split") }, { value: "stacked", label: t("settings.layout.stacked") }]} />
          </Row>
          <Row label={t("settings.autoRun")}><Switch checked={settings.autoRun} onChange={(v) => updateSettings({ autoRun: v })} label={t("settings.autoRun")} /></Row>
        </Section>

        <Section id="shortcuts" icon={<Keyboard className="h-4 w-4" />} title={t("settings.shortcuts")}><ShortcutEditor /></Section>

        {user ? (
          <>
            <Section id="account" icon={<UserRound className="h-4 w-4" />} title={t("settings.account")}>
              <Row label={t("settings.email")}><span className="text-[14px] text-muted">{user.email}</span></Row>
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end">
                <div className="flex-1"><Input id="nm" label={t("settings.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></div>
                <Button onClick={saveName}>{t("settings.saveName")}</Button>
              </div>
              <div className="px-5 py-4">
                <div className="mb-3 text-[14px] font-medium">{t("settings.password")}</div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Input id="cp" type="password" label={t("settings.currentPassword")} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
                  <Input id="np" type="password" label={t("settings.newPassword")} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
                  <Button onClick={changePw} disabled={!pw.current || pw.next.length < 8}>{t("settings.changePassword")}</Button>
                </div>
              </div>
            </Section>
            <Section id="data" icon={<Database className="h-4 w-4" />} title={t("settings.data")}>
              <div className="flex flex-wrap gap-3 px-5 py-4">
                <Button icon={<Download className="h-4 w-4" />} onClick={exportData}>{t("settings.export")}</Button>
                <Button icon={<Upload className="h-4 w-4" />} onClick={() => file.current?.click()}>{t("settings.import")}</Button>
                <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
              </div>
            </Section>
            <Section id="danger" icon={<AlertTriangle className="h-4 w-4" />} title={t("settings.danger")}>
              <div className="px-5 py-4">
                <div className="text-[14px] font-medium">{t("settings.deleteAccount")}</div>
                <p className="mt-1 text-[12.5px] text-muted">{t("settings.deleteAccountHint")}</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <Input id="dp" type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder={t("auth.password")} aria-label={t("auth.password")} className="sm:max-w-xs" />
                  <Button variant="danger" disabled={!delPw} onClick={deleteAccount}>{t("settings.deleteAccount")}</Button>
                </div>
              </div>
            </Section>
          </>
        ) : (
          <div className="flex justify-center gap-3"><Link href="/login"><Button variant="primary">{t("auth.login")}</Button></Link><Link href="/register"><Button>{t("auth.register")}</Button></Link></div>
        )}
      </div>
    </div>
  );
}

/** Miniature of the app in a given theme, drawn with that theme's own variables. */
function ThemePreview({ id }: { id: string }) {
  return (
    <span data-theme={id} className="flex h-16 gap-1.5 overflow-hidden rounded-lg border p-1.5" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
      <span className="w-4 rounded" style={{ background: "var(--bg-2)", boxShadow: "inset -1px 0 0 var(--border)" }} />
      <span className="flex flex-1 flex-col gap-1 rounded p-1.5" style={{ background: "var(--surface)", boxShadow: "0 0 0 1px var(--border)" }}>
        <span className="h-1.5 w-2/3 rounded-full" style={{ background: "var(--text)", opacity: 0.85 }} />
        <span className="h-1 w-1/2 rounded-full" style={{ background: "var(--muted)" }} />
        <span className="mt-auto h-2.5 w-8 rounded" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
      </span>
    </span>
  );
}
