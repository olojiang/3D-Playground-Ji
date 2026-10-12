import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const PUT = (req: Request) => h.updateProfile(req);
export const DELETE = (req: Request) => h.deleteAccount(req);
