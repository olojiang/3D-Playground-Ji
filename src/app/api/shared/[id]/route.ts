import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export const GET = async (req: Request, ctx: Ctx) => h.getSharedSnippet(req, await ctx.params);
