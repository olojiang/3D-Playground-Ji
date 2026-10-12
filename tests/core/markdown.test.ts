import { describe, it, expect } from "vitest";
import { parseMarkdown, parseInline, headings, slugify, readingMinutes, inlineText } from "@/core/markdown";

describe("inline", () => {
  it("parses code, bold and links", () => {
    expect(parseInline("a `b` **c `d`** [e](https://x.y)")).toEqual([
      { t: "text", v: "a " }, { t: "code", v: "b" }, { t: "text", v: " " },
      { t: "bold", c: [{ t: "text", v: "c " }, { t: "code", v: "d" }] }, { t: "text", v: " " },
      { t: "link", href: "https://x.y", c: [{ t: "text", v: "e" }] },
    ]);
  });
  it("refuses javascript: links and leaves unmatched markers as text", () => {
    expect(parseInline("[x](javascript:alert(1))")[0]).toEqual({ t: "text", v: "[x](javascript:alert(1))" });
    expect(parseInline("a ` b ** c")).toEqual([{ t: "text", v: "a ` b ** c" }]);
  });
});

describe("blocks", () => {
  const md = "## 三件套 Intro\n\nPara one\ncontinues.\n\n- a\n- **b**\n\n1. x\n2. y\n\n```glsl\nvoid main(){}\n```\n\n> tip here\n> more\n\n### Sub";
  const b = parseMarkdown(md);
  it("produces the right block types in order", () => {
    expect(b.map((x) => x.type)).toEqual(["h2", "p", "ul", "ol", "code", "quote", "h3"]);
  });
  it("joins paragraph lines and keeps code verbatim", () => {
    expect(inlineText((b[1] as unknown as { c: never[] }).c)).toBe("Para one continues.");
    expect(b[4]).toEqual({ type: "code", lang: "glsl", code: "void main(){}" });
    expect(inlineText((b[5] as unknown as { c: never[] }).c)).toBe("tip here more");
  });
  it("builds a table of contents with unique, CJK-friendly ids", () => {
    expect(headings(parseMarkdown("## A\n## A\n### 中文 标题"))).toEqual([
      { id: "a", text: "A", level: 2 }, { id: "a-1", text: "A", level: 2 }, { id: "中文-标题", text: "中文 标题", level: 3 },
    ]);
    expect(slugify("!!!")).toBe("section");
  });
  it("survives an unclosed fence", () => {
    expect(parseMarkdown("```js\nlet a")).toEqual([{ type: "code", lang: "js", code: "let a" }]);
  });
});

describe("reading time", () => {
  it("is at least one minute", () => {
    expect(readingMinutes("hi")).toBe(1);
    expect(readingMinutes("字".repeat(1200))).toBe(3);
  });
});
