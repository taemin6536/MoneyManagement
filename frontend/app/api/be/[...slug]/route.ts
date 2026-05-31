import { NextRequest, NextResponse } from "next/server";

/**
 * BFF proxy. Browser hits `/api/be/<rest>` (same-origin, gated by
 * `middleware.ts` session check). We forward to `INTERNAL_API_BASE_URL/api/<rest>`
 * with `X-Internal-Token` so the FastAPI guard accepts the call. Browser
 * never sees the backend URL or the internal token.
 */

const BACKEND =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

const INTERNAL_TOKEN = process.env.BACKEND_INTERNAL_TOKEN ?? "";

// Don't forward these client→backend (they describe the browser hop, not
// the backend hop) or session cookies (backend has no use for them).
const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "cookie",
]);

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const path = slug.join("/");
  const search = req.nextUrl.search;
  const url = `${BACKEND}/api/${path}${search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  });
  if (INTERNAL_TOKEN) headers.set("x-internal-token", INTERNAL_TOKEN);

  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(url, init);

  // Pass-through. Drop hop-by-hop response headers so the browser doesn't
  // get confused by mismatched encoding/length.
  const respHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) respHeaders.set(k, v);
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
