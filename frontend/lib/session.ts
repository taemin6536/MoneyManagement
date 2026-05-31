/**
 * Tiny signed-session helper (HMAC-SHA256 via Web Crypto so it runs on the
 * Edge middleware runtime). Cookie value shape:  "<issuedAtMs>.<hex sig>"
 *
 * Single user, no claims — the cookie just proves "the holder knew the
 * password at issue time". Expiry is timestamp-based + cookie Max-Age.
 */

export const SESSION_COOKIE = "mm-session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function signSession(secret: string): Promise<string> {
  const issuedAt = String(Date.now());
  const sig = await hmacHex(secret, issuedAt);
  return `${issuedAt}.${sig}`;
}

export async function verifySession(
  cookieValue: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = await hmacHex(secret, issuedAt);
  if (!constantTimeEqual(sig, expected)) return false;
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts)) return false;
  const ageSec = (Date.now() - ts) / 1000;
  return ageSec >= 0 && ageSec < SESSION_TTL_SECONDS;
}

/** Whether auth is wired up. Three secrets must be set; otherwise dev bypass. */
export function authConfigured(): boolean {
  return Boolean(
    process.env.SESSION_SECRET &&
      process.env.SINGLE_USER_PASSWORD &&
      process.env.BACKEND_INTERNAL_TOKEN,
  );
}
