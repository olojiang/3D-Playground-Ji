"use client";
/** CodeMirror 6 editor, themed entirely from CSS variables so it follows every app theme. */
import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, indentOnInput, foldKeymap } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags } from "@lezer/highlight";

const style = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.definitionKeyword], color: "var(--syn-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--syn-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--syn-number)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syn-fn)" },
  { tag: [tags.className, tags.typeName, tags.namespace], color: "var(--syn-type)" },
  { tag: [tags.propertyName], color: "var(--text)" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "var(--text)" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--muted)" },
]);

const baseTheme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "var(--code-bg)" },
  ".cm-content": { caretColor: "var(--accent)", padding: "12px 0" },
  ".cm-gutterElement": { padding: "0 10px 0 14px !important" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 6px 0 0 !important" },
});

export function CodeEditor({ value, onChange, fontSize, ariaLabel }: { value: string; onChange: (v: string) => void; fontSize: number; ariaLabel: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const font = useRef(new Compartment());
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), foldGutter(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(), dropCursor(),
          EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(), autocompletion(),
          rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
          javascript(), syntaxHighlighting(style), baseTheme,
          font.current.of(EditorView.theme({ "&": { fontSize: `${fontSize}px` } })),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, []);

  // external value changes (reset, load snippet)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: font.current.reconfigure(EditorView.theme({ "&": { fontSize: `${fontSize}px` } })) });
  }, [fontSize]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
