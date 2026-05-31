import type { NextRequest } from "next/server";

/**
 * Build a redirect URL that uses the request's REAL public host, not the
 * internal bind address. Next.js standalone behind Fly's proxy sees
 * `req.url` / `req.nextUrl` as `http://0.0.0.0:3000/...` (the bind addr),
 * which would produce broken `Location` headers. Prefer the proxy's
 * forwarded headers instead.
 */
export function publicUrl(req: NextRequest, path: string): URL {
  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.headers.get("fly-forwarded-proto") ??
    "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const base = host ? `${proto}://${host}` : new URL(req.url).origin;
  return new URL(path, base);
}
