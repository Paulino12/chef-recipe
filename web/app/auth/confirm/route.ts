import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { Database } from "@/lib/api/supabaseDatabase";

function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function getCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

function buildErrorRedirect(req: NextRequest, message: string, type: string) {
  const nextUrl = new URL(type === "recovery" ? "/signin" : "/signin", req.url);
  nextUrl.searchParams.set("error", message);
  return NextResponse.redirect(nextUrl);
}

export async function GET(req: NextRequest) {
  const supabaseEnv = getSupabasePublicEnv();
  if (!supabaseEnv) {
    return buildErrorRedirect(req, "Missing Supabase configuration.", "email");
  }

  const tokenHash = req.nextUrl.searchParams.get("token_hash")?.trim() || "";
  const type = req.nextUrl.searchParams.get("type")?.trim() || "";

  if (!tokenHash || !type) {
    return buildErrorRedirect(req, "The email link is invalid or incomplete.", type);
  }

  const supabase = createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const verifyResult = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
  });

  if (verifyResult.error) {
    return buildErrorRedirect(
      req,
      verifyResult.error.message || "The email link is invalid or has expired.",
      type,
    );
  }

  if (type === "recovery" && verifyResult.data.session?.access_token) {
    const redirectUrl = new URL("/reset-password", req.url);
    const response = NextResponse.redirect(redirectUrl);

    const expiresAt = verifyResult.data.session.expires_at ?? null;
    const now = Math.floor(Date.now() / 1000);
    const maxAge = expiresAt && expiresAt > now ? expiresAt - now : undefined;

    response.cookies.set(
      "sb-access-token",
      verifyResult.data.session.access_token,
      getCookieOptions(maxAge),
    );
    response.cookies.set(
      "sb-refresh-token",
      verifyResult.data.session.refresh_token ?? "",
      verifyResult.data.session.refresh_token ? getCookieOptions(maxAge) : getCookieOptions(0),
    );

    return response;
  }

  const redirectUrl = new URL("/signin", req.url);
  if (type === "email" || type === "signup") {
    redirectUrl.searchParams.set("confirmed", "1");
  }

  return NextResponse.redirect(redirectUrl);
}
