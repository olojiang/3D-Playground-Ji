import { describe, it, expect } from "vitest";
import { newShareId, SHARE_ID, shareUrl } from "@/core/share";

describe("share ids", () => {
  it("are 22-char base62, unique and unguessable", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const id = newShareId();
      expect(id).toMatch(SHARE_ID);
      seen.add(id);
    }
    expect(seen.size).toBe(2000);
  });
  it("use the provided random source without modulo bias shortcuts", () => {
    const zeros = (n: number) => new Uint8Array(n);
    expect(newShareId(zeros)).toBe("A".repeat(22));
  });
  it("builds absolute links", () => {
    expect(shareUrl("abc", "https://3d.827722.xyz")).toBe("https://3d.827722.xyz/s/abc");
    expect(shareUrl("abc", "https://x.dev/")).toBe("https://x.dev/s/abc");
  });
  it("rejects anything that is not a share id", () => {
    for (const bad of ["", "short", "A".repeat(21), "A".repeat(23), "A".repeat(21) + "-", "../" + "A".repeat(19)]) expect(SHARE_ID.test(bad)).toBe(false);
  });
});
