import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => h.getSettings(req);
export const PUT = (req: Request) => h.putSettings(req);
