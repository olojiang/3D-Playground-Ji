import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "../helpers/pglite";
import { Client } from "../helpers/api";
import * as h from "@/server/handlers";

beforeAll(async () => { await usePglite(); });

describe("user isolation", () => {
  it("one user can never read, change or delete another user's data", async () => {
    const alice = new Client(), bob = new Client();
    await alice.register("alice@x.com");
    await bob.register("bob@x.com");

    const snip = (await alice.call(h.createSnippet, { body: { title: "Alice secret", code: "secret()" } })).data.snippet;
    await alice.call(h.putFavorite, { method: "PUT", body: { exampleId: "three/materials", on: true } });
    await alice.call(h.postProgress, { body: { exampleId: "three/materials", completed: true } });
    await alice.call(h.putSettings, { method: "PUT", body: { theme: "gold" } });

    expect((await bob.call(h.listSnippets)).data.snippets).toEqual([]);
    expect((await bob.call(h.getSnippet, { params: { id: snip.id } })).status).toBe(404);
    expect((await bob.call(h.putSnippet, { method: "PUT", params: { id: snip.id }, body: { title: "pwned", code: "" } })).status).toBe(404);
    expect((await bob.call(h.deleteSnippet, { method: "DELETE", params: { id: snip.id } })).status).toBe(404);
    expect((await bob.call(h.getFavorites)).data.favorites).toEqual([]);
    expect((await bob.call(h.getProgress)).data.progress).toEqual([]);
    expect((await bob.call(h.getSettings)).data.settings.theme).toBe("system");
    const bobExport = (await bob.call(h.exportData)).data;
    expect(JSON.stringify(bobExport)).not.toContain("Alice secret");

    // Alice's data is intact
    expect((await alice.call(h.getSnippet, { params: { id: snip.id } })).data.snippet.title).toBe("Alice secret");
  });
});
