import crypto from "node:crypto";
import { NextRequest } from "next/server";

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export type PublicApiAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export function requirePublicApiAccess(req: NextRequest): PublicApiAuthResult {
  if (process.env.PUBLIC_API_ENABLED?.trim().toLowerCase() === "false") {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Not found",
    };
  }

  const expectedSecret = process.env.PUBLIC_API_PROXY_SECRET?.trim();
  if (!expectedSecret) {
    return { ok: true };
  }

  const providedSecret = req.headers.get("x-rapidapi-proxy-secret")?.trim() ?? "";
  if (!providedSecret) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Missing x-rapidapi-proxy-secret header",
    };
  }

  if (!safeEqual(providedSecret, expectedSecret)) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Invalid API gateway secret",
    };
  }

  return { ok: true };
}
