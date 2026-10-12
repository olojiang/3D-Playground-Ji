import { describe, it, expect } from "vitest";
import { appendLog, countErrors, isSandboxMessage } from "@/core/console";

describe("console model", () => {
  it("collapses consecutive duplicates and counts errors", () => {
    let l = appendLog([], "log", "a");
    l = appendLog(l, "log", "a");
    l = appendLog(l, "error", "boom");
    l = appendLog(l, "error", "boom");
    l = appendLog(l, "log", "a");
    expect(l.map((e) => [e.text, e.count])).toEqual([["a", 2], ["boom", 2], ["a", 1]]);
    expect(countErrors(l)).toBe(2);
  });
  it("caps the list and truncates huge messages", () => {
    let l = [] as ReturnType<typeof appendLog>;
    for (let i = 0; i < 20; i++) l = appendLog(l, "log", String(i), 0, 5);
    expect(l.map((e) => e.text)).toEqual(["15", "16", "17", "18", "19"]);
    expect(appendLog([], "log", "x".repeat(5000))[0].text.length).toBeLessThan(4100);
  });
  it("validates sandbox messages", () => {
    expect(isSandboxMessage({ source: "pg-sandbox", type: "fps", fps: 60 })).toBe(true);
    expect(isSandboxMessage({ source: "pg-sandbox", type: "console", level: "debug", text: "x" })).toBe(false);
    expect(isSandboxMessage({ source: "other", type: "ready" })).toBe(false);
    expect(isSandboxMessage(null)).toBe(false);
  });
});
