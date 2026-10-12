import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => h.getProgress(req);
export const POST = (req: Request) => h.postProgress(req);
