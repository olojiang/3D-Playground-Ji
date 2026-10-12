import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => h.listSnippets(req);
export const POST = (req: Request) => h.createSnippet(req);
