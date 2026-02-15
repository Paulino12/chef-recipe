import crypto from "node:crypto";
import { NextRequest } from "next/server";

/**
 * Timing-safe comparison (prevents leaking key length/timing info).
 * Not perfect security alone, but good practice for API keys.
 */
function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

type AuthCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

/**
 * Require an API key in header `x-api-key`.
 */
export function requireApiKey(req: NextRequest, expected: string | undefined) {
  const got = req.headers.get("x-api-key") ?? "";
  if (!expected) return { ok: false, reason: "Missing server config: expected key not set" };
  if (!got) return { ok: false, reason: "Missing x-api-key header" };
  if (!safeEqual(got, expected)) return { ok: false, reason: "Invalid API key" };
  return { ok: true as const };
}

export function requireOwnerAccess(ownerKey: string | undefined | null): AuthCheck {
  const expected = process.env.OWNER_DASHBOARD_KEY ?? process.env.OWNER_KEY;
  const got = ownerKey?.trim() ?? "";

  if (!expected) {
    return { ok: false, reason: "Missing server config: OWNER_DASHBOARD_KEY not set" };
  }

  if (!got) {
    return { ok: false, reason: "Missing owner key" };
  }

  if (!safeEqual(got, expected)) {
    return { ok: false, reason: "Invalid owner key" };
  }

  return { ok: true };
}
