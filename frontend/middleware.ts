import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, authConfigured, verifySession } from "@/lib/session";

const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/logout"];

export async function middleware(req: NextRequest) {
  // Dev bypass: if any of the three required secrets is missing, behave as
  // if there's no auth. Lets local docker boot without setup.
  if (!authConfigured()) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET!;
  const ok = await verifySession(cookie, secret);
  if (ok) return NextResponse.next();

  // Unauthenticated: redirect to /login with ?next=<original>
  const loginUrl = new URL("/login", req.url);
  const nextPath = req.nextUrl.pathname + req.nextUrl.search;
  if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

// Skip Next.js internals + static assets (favicon, icon, _next, public files).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|robots\\.txt).*)",
  ],
};
