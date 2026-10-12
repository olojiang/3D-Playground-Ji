import * as h from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => h.getFavorites(req);
export const PUT = (req: Request) => h.putFavorite(req);
