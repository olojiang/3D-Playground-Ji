import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "../helpers/pglite";
import { Client } from "../helpers/api";
import * as h from "@/server/handlers";
import { SHARE_ID } from "@/core/share";

beforeAll(async () => { await usePglite(); });

async function setup() {
  const owner = new Client(), other = new Client(), anon = new Client();
  await owner.register(`own${Math.random().toString(36).slice(2)}@x.com`);
  await other.register(`oth${Math.random().toString(36).slice(2)}@x.com`);
  const snip = (await owner.call(h.createSnippet, { body: { title: "Galaxy", exampleId: "three/particles-points", code: "console.log('hi')" } })).data.snippet;
  return { owner, other, anon, snip };
}
const share = (c: Client, id: string, on: boolean) => c.call(h.shareSnippet, { method: "PUT", params: { id }, body: { on } });
const view = (c: Client, shareId: string) => c.call(h.getSharedSnippet, { params: { id: shareId } });

describe("snippet sharing", () => {
  it("snippets are private by default: no share id, nothing public", async () => {
    const { owner, snip } = await setup();
    expect(snip.shareId).toBeNull();
    expect((await owner.call(h.listSnippets)).data.snippets[0].shareId).toBeNull();
  });

  it("owner shares → unguessable link anyone (other user, anonymous) can read, read-only", async () => {
    const { owner, other, anon, snip } = await setup();
    const r = await share(owner, snip.id, true);
    expect(r.status).toBe(200);
    const sid = r.data.shareId as string;
    expect(sid).toMatch(SHARE_ID);
    expect(sid).not.toBe(snip.id);
    // idempotent: sharing again keeps the same link
    expect((await share(owner, snip.id, true)).data.shareId).toBe(sid);
    expect((await owner.call(h.listSnippets)).data.snippets[0].shareId).toBe(sid);
    for (const c of [anon, other, owner]) {
      const v = await view(c, sid);
      expect(v.status).toBe(200);
      expect(v.data.snippet).toMatchObject({ id: sid, title: "Galaxy", code: "console.log('hi')", exampleId: "three/particles-points" });
      // never leaks the owner or the private id
      expect(JSON.stringify(v.data)).not.toMatch(/@x\.com|user_?id/i);
      expect(v.data.snippet.ownerId).toBeUndefined();
      expect(JSON.stringify(v.data)).not.toContain(snip.id);
    }
    // the private API still refuses other users even though the snippet is shared
    expect((await other.call(h.getSnippet, { params: { id: snip.id } })).status).toBe(404);
    expect((await other.call(h.putSnippet, { method: "PUT", params: { id: snip.id }, body: { title: "x", code: "" } })).status).toBe(404);
  });

  it("only the owner can toggle sharing; guests need an account", async () => {
    const { other, anon, snip } = await setup();
    expect((await share(other, snip.id, true)).status).toBe(404);
    expect((await share(anon, snip.id, true)).status).toBe(401);
    expect((await share(other, "bad id!", true)).status).toBe(404);
  });

  it("unsharing revokes the link; re-sharing mints a new one", async () => {
    const { owner, other, anon, snip } = await setup();
    const sid = (await share(owner, snip.id, true)).data.shareId;
    const off = await share(owner, snip.id, false);
    expect(off.data.shareId).toBeNull();
    for (const c of [anon, other, owner]) expect((await view(c, sid)).status).toBe(404);
    const sid2 = (await share(owner, snip.id, true)).data.shareId;
    expect(sid2).not.toBe(sid);
    expect((await view(anon, sid)).status).toBe(404);
    expect((await view(anon, sid2)).status).toBe(200);
  });

  it("shared view follows edits and dies with the snippet", async () => {
    const { owner, anon, snip } = await setup();
    const sid = (await share(owner, snip.id, true)).data.shareId;
    await owner.call(h.putSnippet, { method: "PUT", params: { id: snip.id }, body: { title: "Galaxy v2", code: "v2()" } });
    expect((await view(anon, sid)).data.snippet).toMatchObject({ title: "Galaxy v2", code: "v2()" });
    await owner.call(h.deleteSnippet, { method: "DELETE", params: { id: snip.id } });
    expect((await view(anon, sid)).status).toBe(404);
  });

  it("random and malformed share ids are 404", async () => {
    const anon = new Client();
    expect((await view(anon, "A".repeat(22))).status).toBe(404);
    expect((await view(anon, "../../etc")).status).toBe(404);
    expect((await view(anon, "")).status).toBe(404);
  });

  it("export keeps share state out of other accounts and import never makes anything public", async () => {
    const { owner, other, snip } = await setup();
    await share(owner, snip.id, true);
    expect(JSON.stringify((await other.call(h.exportData)).data)).not.toContain("Galaxy");
    const backup = (await owner.call(h.exportData)).data;
    const r = await other.call(h.importData, { body: backup });
    expect(r.status).toBe(200);
    const imported = (await other.call(h.listSnippets)).data.snippets;
    expect(imported[0].shareId).toBeNull();
  });
});
