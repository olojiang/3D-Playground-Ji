import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const PUT = (req: Request) => h.changePassword(req);
