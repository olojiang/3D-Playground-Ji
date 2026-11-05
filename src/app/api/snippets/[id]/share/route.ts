import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export const PUT = async (req: Request, ctx: Ctx) => h.shareSnippet(req, await ctx.params);
