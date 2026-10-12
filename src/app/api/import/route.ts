import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => h.importData(req);
