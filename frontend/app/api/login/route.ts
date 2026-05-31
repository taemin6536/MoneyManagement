import { NextRequest, NextResponse } from "next/server";

import { publicUrl } from "@/lib/public-url";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authConfigured,
  signSession,
} from "@/lib/session";

// Constant-time string comparison — avoid timing side-channels on the password.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function safeNext(next: string | null): string {
  if (!next) return "/";
  // Only allow same-origin relative paths to prevent open redirect.
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.redirect(publicUrl(req, "/"), { status: 303 });
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));

  const expected = process.env.SINGLE_USER_PASSWORD ?? "";
  if (!password || !expected || !constantTimeEqual(password, expected)) {
    const url = publicUrl(req, "/login");
    url.searchParams.set("error", "invalid");
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await signSession(process.env.SESSION_SECRET!);
  const res = NextResponse.redirect(publicUrl(req, next), { status: 303 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
