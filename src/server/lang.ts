import { cookies } from "next/headers";
import { isLang, type Lang } from "@/core/userdata";

/** UI language for server rendering: the tp-lang cookie (the middleware maps ?lang= onto it), default zh. */
export async function requestLang(): Promise<Lang> {
  const c = (await cookies()).get("tp-lang")?.value;
  return isLang(c) ? c : "zh";
}
