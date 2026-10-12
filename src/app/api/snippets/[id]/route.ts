import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export const GET = async (req: Request, ctx: Ctx) => h.getSnippet(req, await ctx.params);
export const PUT = async (req: Request, ctx: Ctx) => h.putSnippet(req, await ctx.params);
export const DELETE = async (req: Request, ctx: Ctx) => h.deleteSnippet(req, await ctx.params);
