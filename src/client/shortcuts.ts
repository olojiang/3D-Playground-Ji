"use client";
/**
 * Page-level shortcut handlers. Pages register handlers for ids (e.g. "run", "lesson.next");
 * the Shell's single keydown listener dispatches to them. Registering a handler for a
 * lesson-scope id activates the "lesson" scope.
 */
import { useEffect, useRef } from "react";
import type { Scope } from "@/core/shortcuts";

type Handler = () => void;
const stack: Map<string, Handler>[] = [];

export function useShortcutHandlers(handlers: Record<string, Handler>, deps: unknown[] = []) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const m = new Map<string, Handler>(Object.keys(handlers).map((id) => [id, () => ref.current[id]?.()]));
    stack.push(m);
    return () => { const i = stack.indexOf(m); if (i >= 0) stack.splice(i, 1); };
  }, deps);
}

/** Most recently mounted handler wins. */
export function pageHandler(id: string): Handler | undefined {
  for (let i = stack.length - 1; i >= 0; i--) { const h = stack[i].get(id); if (h) return h; }
  return undefined;
}

export function activeScopes(): Scope[] {
  const s: Scope[] = ["global"];
  if (stack.some((m) => m.size > 0)) s.push("lesson");
  return s;
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.closest(".cm-editor")) return true;
  const tag = el.tagName;
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["checkbox", "radio", "button", "range"].includes((el as HTMLInputElement).type));
}
