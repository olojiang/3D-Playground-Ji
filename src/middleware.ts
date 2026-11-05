import { NextResponse, type NextRequest } from "next/server";
import { langFromQuery } from "@/core/lang-query";

/** `?lang=zh|en` (used by hreflang alternates) selects the language for this request and remembers it in the tp-lang cookie. */
export function middleware(req: NextRequest) {
  const lang = langFromQuery(req.nextUrl.search);
  if (!lang) return NextResponse.next();
  const headers = new Headers(req.headers);
  const others = (req.headers.get("cookie") || "").split(/;\s*/).filter((c) => c && !c.startsWith("tp-lang="));
  headers.set("cookie", [...others, `tp-lang=${lang}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set("tp-lang", lang, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}

export const config = { matcher: ["/((?!api/|_next/|vendor/|models/|sandbox.html|favicon|icon|.*\\.(?:png|jpg|svg|js|css|json|txt|xml|woff2?)$).*)"] };
