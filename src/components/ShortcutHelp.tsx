"use client";
import { useMemo } from "react";
import { useApp } from "@/client/app-context";
import { resolveBindings, formatBinding, type Group } from "@/core/shortcuts";
import type { MessageKey } from "@/core/i18n";
import { Modal, ModalHeader, Kbd } from "./ui";

export const GROUP_ORDER: Group[] = ["general", "navigation", "lesson", "editor", "view"];

export function ShortcutTable({ columns = 2 }: { columns?: 1 | 2 }) {
  const { t, settings, mac } = useApp();
  const defs = useMemo(() => resolveBindings(settings.shortcuts), [settings.shortcuts]);
  return (
    <div className={columns === 2 ? "grid gap-x-8 gap-y-6 md:grid-cols-2" : "space-y-6"}>
      {GROUP_ORDER.map((g) => (
        <section key={g}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t(`sc.group.${g}` as MessageKey)}</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface2/50">
            {defs.filter((d) => d.group === g).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 px-3 py-2 text-[13.5px]">
                <span className="text-muted">{t(`sc.${d.id}` as MessageKey)}</span>
                <Kbd keys={formatBinding(d.keys, mac)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ShortcutHelp() {
  const { t, helpOpen, setHelpOpen } = useApp();
  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} label={t("sc.title")} className="max-w-[880px]">
      <ModalHeader title={t("sc.title")} onClose={() => setHelpOpen(false)} closeLabel={t("common.close")} />
      <div className="scroll-thin max-h-[72vh] overflow-y-auto p-5"><ShortcutTable /></div>
    </Modal>
  );
}
