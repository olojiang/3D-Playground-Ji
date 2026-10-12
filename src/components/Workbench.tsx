"use client";
/**
 * The editor + live preview + console workbench shared by lesson pages and the playground.
 * The preview is a sandboxed iframe (public/sandbox.html); re-running = remounting it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Play, Pause, RotateCcw, Maximize2, Minimize2, Save, TerminalSquare, Code2, Columns2, Rows2, Copy, Download, AArrowUp, AArrowDown, Trash2, AlertTriangle, type LucideIcon } from "lucide-react";
import { useApp } from "@/client/app-context";
import { useShortcutHandlers } from "@/client/shortcuts";
import { appendLog, countErrors, isSandboxMessage, type LogEntry } from "@/core/console";
import { FONT_MAX, FONT_MIN } from "@/core/userdata";
import { SPRING } from "@/core/motion";
import type { MessageKey } from "@/core/i18n";
import { CodeEditor } from "./CodeEditor";
import { cx, IconButton } from "./ui";

export interface WorkbenchTab { id: string; label: string; icon: LucideIcon; content: ReactNode }

type Status = "running" | "error" | "paused" | "idle";

function Preview({ code, runKey, paused, onMessage }: { code: string; runKey: number; paused: boolean; onMessage: (m: ReturnType<typeof Object>) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isSandboxMessage(e.data)) return;
      if (e.data.type === "ready") frame.current?.contentWindow?.postMessage({ target: "pg-sandbox", type: "run", code: codeRef.current }, "*");
      onMessage(e.data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onMessage]);
  useEffect(() => { frame.current?.contentWindow?.postMessage({ target: "pg-sandbox", type: paused ? "pause" : "resume" }, "*"); }, [paused]);
  return (
    <iframe key={runKey} ref={frame} src="/sandbox.html" title="preview" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen; gamepad; xr-spatial-tracking"
      className="absolute inset-0 h-full w-full border-0 bg-[#07070a]" />
  );
}

export function Workbench({ code, setCode, originalCode, tabsBefore = [], onSave, header, storageKey }: {
  code: string; setCode: (c: string) => void; originalCode?: string; tabsBefore?: WorkbenchTab[]; onSave: () => void; header?: ReactNode; storageKey: string;
}) {
  const { t, settings, updateSettings } = useApp();
  const tabs = useMemo<WorkbenchTab[]>(() => tabsBefore, [tabsBefore]);
  const [tab, setTab] = useState<string>(tabs[0]?.id ?? "code");
  const [runKey, setRunKey] = useState(0);
  const [ranCode, setRanCode] = useState(code);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [fps, setFps] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [full, setFull] = useState(false);
  const [split, setSplit] = useState(44);
  const previewBox = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<number | undefined>(undefined);
  const stacked = settings.layout === "stacked";

  useEffect(() => { const v = Number(localStorage.getItem("tp-split")); if (v >= 25 && v <= 75) setSplit(v); }, []);

  const run = useCallback((c?: string) => {
    setLogs([]);
    setRanCode(c ?? code);
    setPaused(false);
    setStatus("running");
    setRunKey((k) => k + 1);
  }, [code]);

  // run once on mount / when the lesson changes
  useEffect(() => { run(code); }, [storageKey]);

  const onMessage = useCallback((m: { type: string; level?: LogEntry["level"]; text?: string; fps?: number }) => {
    if (m.type === "console") setLogs((l) => appendLog(l, m.level!, m.text!));
    if (m.type === "error") { setLogs((l) => appendLog(l, "error", m.text!)); setStatus("error"); }
    if (m.type === "fps") setFps(m.fps!);
  }, []);

  const change = (c: string) => {
    setCode(c);
    if (settings.autoRun) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = window.setTimeout(() => run(c), 1000);
    }
  };
  useEffect(() => () => window.clearTimeout(autoTimer.current), []);

  const errors = countErrors(logs);
  useEffect(() => { if (errors > 0 && status === "running") setStatus("error"); }, [errors]);

  const toggleFull = () => {
    if (!document.fullscreenElement) previewBox.current?.requestFullscreen?.().catch(() => setFull((f) => !f));
    else document.exitFullscreen();
  };
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const reset = () => {
    if (originalCode === undefined || code === originalCode) return;
    if (!window.confirm(t("run.resetConfirm"))) return;
    setCode(originalCode);
    run(originalCode);
  };
  const font = (d: number) => updateSettings({ editorFontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, settings.editorFontSize + d)) });
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    a.download = `${storageKey.replace(/[^a-z0-9-]+/gi, "-")}.js`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const allTabs = [...tabs, { id: "code", label: t("lesson.code"), icon: Code2 }, { id: "console", label: t("lesson.console"), icon: TerminalSquare }];
  useShortcutHandlers({
    run: () => run(),
    save: onSave,
    reset,
    pause: () => setPaused((p) => !p),
    fullscreen: toggleFull,
    "layout.toggle": () => updateSettings({ layout: stacked ? "split" : "stacked" }),
    "font.bigger": () => font(1),
    "font.smaller": () => font(-1),
    "tab.concepts": () => setTab(allTabs[0].id),
    "tab.code": () => setTab("code"),
    "tab.console": () => setTab("console"),
    escape: () => { if (document.fullscreenElement) document.exitFullscreen(); },
  }, [code, originalCode, stacked, settings.editorFontSize, onSave, allTabs.length]);

  // drag to resize the split
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = container.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const pct = stacked ? ((ev.clientY - box.top) / box.height) * 100 : ((ev.clientX - box.left) / box.width) * 100;
      const v = Math.min(75, Math.max(25, stacked ? 100 - pct : pct));
      setSplit(v);
      localStorage.setItem("tp-split", String(Math.round(v)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = stacked ? "row-resize" : "col-resize";
  };

  const modified = originalCode !== undefined && code !== originalCode;
  const stale = code !== ranCode;
  const statusKey: Record<Status, MessageKey> = { running: "run.running", error: "run.error", paused: "run.paused", idle: "run.running" };
  const shownStatus: Status = paused ? "paused" : status;

  const leftPane = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        <div role="tablist" className="flex items-center gap-0.5">
          {allTabs.map((x) => {
            const Icon = x.icon;
            const active = tab === x.id;
            return (
              <button key={x.id} role="tab" aria-selected={active} onClick={() => setTab(x.id)}
                className={cx("ring-focus relative flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors", active ? "text-fg" : "text-muted hover:text-fg")}>
                {active && <motion.span layoutId={`wb-tab-${storageKey}`} transition={SPRING.snappy} className="absolute inset-0 rounded-lg bg-surface2 shadow-hair" />}
                <Icon className={cx("relative h-4 w-4", active && "text-accent-text")} />
                <span className="relative">{x.label}</span>
                {x.id === "console" && errors > 0 && <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{errors}</span>}
                {x.id === "code" && modified && <span className="relative h-1.5 w-1.5 rounded-full bg-accent" title={t("lesson.modified")} />}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {tab === "code" && (
            <>
              <IconButton size="sm" label={t("run.fontSmaller")} onClick={() => font(-1)}><AArrowDown className="h-4 w-4" /></IconButton>
              <IconButton size="sm" label={t("run.fontBigger")} onClick={() => font(1)}><AArrowUp className="h-4 w-4" /></IconButton>
              <IconButton size="sm" label={t("run.copy")} onClick={() => navigator.clipboard?.writeText(code)}><Copy className="h-4 w-4" /></IconButton>
              <IconButton size="sm" label={t("run.download")} onClick={download}><Download className="h-4 w-4" /></IconButton>
            </>
          )}
          {tab === "console" && <IconButton size="sm" label={t("run.clear")} onClick={() => setLogs([])}><Trash2 className="h-4 w-4" /></IconButton>}
          <IconButton size="sm" label={t("run.layout")} onClick={() => updateSettings({ layout: stacked ? "split" : "stacked" })} className="hidden lg:inline-flex">
            {stacked ? <Columns2 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((x) => <div key={x.id} hidden={tab !== x.id} className="scroll-thin absolute inset-0 overflow-y-auto">{x.content}</div>)}
        <div hidden={tab !== "code"} className="absolute inset-0">
          <CodeEditor value={code} onChange={change} fontSize={settings.editorFontSize} ariaLabel={t("lesson.code")} />
        </div>
        <div hidden={tab !== "console"} className="scroll-thin absolute inset-0 overflow-y-auto bg-code p-2 font-mono text-[12px]">
          {logs.length === 0 && <div className="p-4 text-center font-sans text-[13px] text-faint">{t("run.noLogs")}</div>}
          {logs.map((l) => (
            <div key={l.id} className={cx("flex gap-2 whitespace-pre-wrap break-words border-b border-line/60 px-2 py-1.5 leading-relaxed",
              l.level === "error" ? "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-danger" : l.level === "warn" ? "text-warning" : "text-fg/85")}>
              {l.level === "error" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1">{l.text}</span>
              {l.count > 1 && <span className="h-5 rounded-full bg-surface3 px-1.5 text-[10.5px] leading-5 text-muted">×{l.count}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const previewPane = (
    <section ref={previewBox} className={cx("group/preview relative min-h-[260px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-[#07070a] shadow-lift", full && "rounded-none border-0")}>
      <Preview code={ranCode} runKey={runKey} paused={paused} onMessage={onMessage} />
      {/* status pill */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11.5px] font-medium text-white/85 backdrop-blur-md">
        <span className={cx("h-2 w-2 rounded-full", shownStatus === "error" ? "bg-red-400" : shownStatus === "paused" ? "bg-amber-300" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.9)]")} />
        {t(statusKey[shownStatus])}
        {shownStatus === "running" && fps > 0 && <span className="tabular-nums text-white/55">· {t("run.fps", { fps })}</span>}
      </div>
      {/* toolbar */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/55 p-1 text-white shadow-2xl backdrop-blur-xl transition-opacity duration-base md:opacity-70 md:group-hover/preview:opacity-100">
        <ToolBtn label={`${t("run.run")}`} onClick={() => run()} primary pulse={stale}><Play className="h-4 w-4" fill="currentColor" /></ToolBtn>
        <ToolBtn label={paused ? t("run.resume") : t("run.pause")} onClick={() => setPaused((p) => !p)}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</ToolBtn>
        {originalCode !== undefined && <ToolBtn label={t("run.reset")} onClick={reset} disabled={!modified}><RotateCcw className="h-4 w-4" /></ToolBtn>}
        <ToolBtn label={t("run.save")} onClick={onSave}><Save className="h-4 w-4" /></ToolBtn>
        <ToolBtn label={full ? t("run.exitFullscreen") : t("run.fullscreen")} onClick={toggleFull}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</ToolBtn>
      </div>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div ref={container} className={cx("min-h-0 flex-1 gap-0 p-3 pt-0 sm:p-4 sm:pt-0", stacked ? "flex flex-col" : "flex flex-col lg:flex-row")}>
        {stacked ? (
          <>
            <div style={{ flexBasis: `${split}%` }} className="flex min-h-0 shrink-0 flex-col">{previewPane}</div>
            <Divider onPointerDown={startDrag} vertical={false} />
            <div className="flex min-h-[320px] flex-1 flex-col">{leftPane}</div>
          </>
        ) : (
          <>
            <div style={{ flexBasis: `${split}%` }} className="flex min-h-[420px] min-w-0 shrink-0 flex-col max-lg:!basis-auto lg:min-h-0">{leftPane}</div>
            <Divider onPointerDown={startDrag} vertical />
            <div className="flex min-h-[340px] min-w-0 flex-1 flex-col max-lg:mt-3 lg:min-h-0">{previewPane}</div>
          </>
        )}
      </div>
    </div>
  );
}

function Divider({ onPointerDown, vertical }: { onPointerDown: (e: React.PointerEvent) => void; vertical: boolean }) {
  return (
    <div onPointerDown={onPointerDown} role="separator" aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cx("group hidden shrink-0 items-center justify-center lg:flex", vertical ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize")}>
      <span className={cx("rounded-full bg-line-strong transition-all group-hover:bg-accent", vertical ? "h-10 w-1 group-hover:h-16" : "h-1 w-10 group-hover:w-16")} />
    </div>
  );
}

function ToolBtn({ label, onClick, children, primary, disabled, pulse }: { label: string; onClick: () => void; children: ReactNode; primary?: boolean; disabled?: boolean; pulse?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cx("relative flex h-9 items-center justify-center rounded-xl transition-all duration-fast active:scale-95 disabled:opacity-35",
        primary ? "w-11 bg-accent text-accent-fg shadow-glow hover:brightness-110" : "w-9 text-white/80 hover:bg-white/10 hover:text-white")}>
      {pulse && <span className="absolute inset-0 animate-ping rounded-xl bg-accent/40" />}
      <span className="relative">{children}</span>
    </button>
  );
}
