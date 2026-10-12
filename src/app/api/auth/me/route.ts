import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => h.me(req);
