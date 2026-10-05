import { NextResponse, type NextRequest } from "next/server";
import { can, capabilityForPath } from "@/lib/auth/permissions";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Optimistic route guard (cookie only, no DB). Real enforcement happens again
 * in every page (requirePageUser) and every server action / route handler (requireCap).
 */
const PUBLIC = ["/login"];
/** Authenticated per entry by signed entry tokens instead of the session cookie. */
const TOKEN_AUTH_API = ["/api/entries"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (TOKEN_AUTH_API.includes(pathname)) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  // The login page decides itself (with a DB check) whether to skip ahead: a
  // valid cookie for a since-deactivated user must still be able to reach it.
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  if (!session) {
    if (isApi) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.mcp && pathname !== "/change-pin" && !isApi) {
    return NextResponse.redirect(new URL("/change-pin", request.url));
  }

  const cap = capabilityForPath(pathname);
  if (cap && !can(session.role, cap)) {
    if (isApi) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    return NextResponse.redirect(new URL("/log", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|icon|apple-icon|pwa-icon|sw.js|offline.html|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
