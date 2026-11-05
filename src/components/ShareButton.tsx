"use client";
/** Share a saved snippet: toggle public/private, copy the read-only /s/<id> link. Accounts only. */
import { useState } from "react";
import Link from "next/link";
import { Share2, Link2, Globe2, Lock, Copy } from "lucide-react";
import { useApp } from "@/client/app-context";
import { shareUrl } from "@/core/share";
import { Button, IconButton, Modal, ModalHeader, Switch, Chip } from "./ui";

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

export function ShareButton({ snippetId, shareId, onChange, ensureSaved, compact }: {
  snippetId: string | null;
  shareId: string | null | undefined;
  onChange: (shareId: string | null) => void;
  /** Playground: save an unsaved draft first and return its id. */
  ensureSaved?: () => Promise<string | null>;
  compact?: boolean;
}) {
  const { t, user, source, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = shareId && typeof window !== "undefined" ? shareUrl(shareId, window.location.origin) : "";

  const openDialog = () => {
    if (!user) { toast(t("share.needAccount"), "info"); return; }
    setOpen(true);
  };
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const id = snippetId ?? (ensureSaved ? await ensureSaved() : null);
      if (!id) return;
      const sid = await source.setShared(id, on);
      onChange(sid);
      if (sid) {
        await copyText(shareUrl(sid, window.location.origin));
        toast(t("share.made"), "success");
      } else toast(t("share.stopped"), "info");
    } catch { toast(t("common.error"), "error"); } finally { setBusy(false); }
  };
  const copy = async () => { if (link && (await copyText(link))) toast(t("share.copied"), "success"); };

  return (
    <>
      {compact ? (
        <IconButton label={t("share.share")} size="sm" onClick={openDialog} active={!!shareId}><Share2 className="h-4 w-4" /></IconButton>
      ) : (
        <Button size="sm" variant={shareId ? "subtle" : "ghost"} icon={shareId ? <Globe2 className="h-4 w-4 text-accent-text" /> : <Share2 className="h-4 w-4" />} onClick={openDialog}>
          <span className="max-sm:hidden">{t("share.share")}</span>
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} label={t("share.menuTitle")} className="max-w-md">
        <ModalHeader title={t("share.menuTitle")} onClose={() => setOpen(false)} closeLabel={t("common.close")} />
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface2/60 p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent-text">
              {shareId ? <Globe2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px] font-medium">
                {shareId ? t("share.public") : t("share.private")}
                <Chip tone={shareId ? "accent" : "default"}>{t("share.readOnly")}</Chip>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("share.menuBody")}</p>
            </div>
            <Switch checked={!!shareId} onChange={(v) => !busy && toggle(v)} label={t("share.share")} />
          </div>
          {shareId && (
            <div className="flex items-center gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 font-mono text-[12.5px] text-muted">
                <Link2 className="h-4 w-4 shrink-0 text-faint" />
                <Link href={`/s/${shareId}`} target="_blank" className="truncate hover:text-accent-text">{link}</Link>
              </div>
              <Button size="md" variant="primary" icon={<Copy className="h-4 w-4" />} onClick={copy}>{t("share.copyLink")}</Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
