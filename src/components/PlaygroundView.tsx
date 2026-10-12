"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Sparkles, Cpu, Plus, FlaskConical } from "lucide-react";
import { useApp } from "@/client/app-context";
import { TEMPLATES, type TemplateId } from "@/content/templates";
import { Workbench } from "./Workbench";
import { Button, cx } from "./ui";

const TPL_ICON = { three: Box, webgl: Sparkles, webgpu: Cpu } as const;
const DRAFT = "tp-playground-draft";

export function PlaygroundView() {
  const { t, source, toast, ready } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState<string>(TEMPLATES.three);
  const [title, setTitle] = useState("");
  const [snippetId, setSnippetId] = useState<string | null>(null);
  const [exampleId, setExampleId] = useState<string | null>(null);
  const [runId, setRunId] = useState("pg:init");
  const current = useRef<string | null>(null);
  current.current = snippetId;

  // load: ?snippet=id, ?template=x, ?new=1, else the last local draft
  useEffect(() => {
    if (!ready) return;
    const sid = params.get("snippet");
    const tpl = params.get("template") as TemplateId | null;
    (async () => {
      if (sid && sid === current.current) return; // we just saved it
      if (sid) {
        const s = await source.getSnippet(sid).catch(() => null);
        if (!s) { toast(t("pg.loadFailed"), "error"); return; }
        setCode(s.code); setTitle(s.title); setSnippetId(s.id); setExampleId(s.exampleId); setRunId(`pg:${s.id}`);
        return;
      }
      if (tpl && tpl in TEMPLATES) { loadTemplate(tpl); return; }
      if (params.get("new")) { loadTemplate("three"); return; }
      try {
        const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
        if (d?.code) { setCode(d.code); setTitle(d.title || ""); setRunId(`pg:draft:${Date.now()}`); }
      } catch { /* ignore */ }
    })();
  }, [ready, params]);

  useEffect(() => {
    if (!snippetId) localStorage.setItem(DRAFT, JSON.stringify({ code, title }));
  }, [code, title, snippetId]);

  function loadTemplate(id: TemplateId) {
    setCode(TEMPLATES[id]); setTitle(""); setSnippetId(null); setExampleId(null); setRunId(`pg:${id}:${Date.now()}`);
    if (params.get("snippet") || params.get("template") || params.get("new")) router.replace("/playground");
  }

  const save = async () => {
    const input = { title: title.trim() || t("pg.untitled"), exampleId, code };
    try {
      if (snippetId && (await source.updateSnippet(snippetId, input))) { toast(t("run.updated"), "success"); return; }
      const s = await source.createSnippet(input);
      setSnippetId(s.id);
      setTitle(s.title);
      router.replace(`/playground?snippet=${s.id}`);
      toast(t("run.saved"), "success");
    } catch { toast(t("common.error"), "error"); }
  };

  const header = (
    <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface2 text-accent-text shadow-card"><FlaskConical className="h-5 w-5" /></div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("pg.titlePlaceholder")} aria-label={t("pg.titlePlaceholder")} maxLength={80}
        className="ring-focus h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 font-display text-[19px] font-semibold tracking-[-0.01em] placeholder:text-faint hover:border-line focus:border-line focus:bg-surface" />
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-card" role="group" aria-label={t("pg.templates")}>
        {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
          const Icon = TPL_ICON[id];
          return (
            <button key={id} onClick={() => loadTemplate(id)} title={t(`pg.tpl.${id}`)}
              className={cx("ring-focus flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-muted transition hover:bg-surface2 hover:text-fg")}>
              <Icon className="h-4 w-4" /><span className="hidden xl:inline">{t(`pg.tpl.${id}`)}</span>
            </button>
          );
        })}
      </div>
      <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => loadTemplate("three")}>{t("pg.new")}</Button>
    </div>
  );

  return (
    <div className="h-dvh max-lg:h-auto max-lg:min-h-[calc(100dvh-56px)]">
      <Workbench key={runId} storageKey={runId} code={code} setCode={setCode} onSave={save} header={header} />
    </div>
  );
}
