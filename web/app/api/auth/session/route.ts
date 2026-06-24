import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { Database } from "@/lib/api/supabaseDatabase";

type SessionBody = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
};

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

function clearSessionCookies(response: NextResponse) {
  response.cookies.set("sb-access-token", "", getCookieOptions(0));
  response.cookies.set("sb-refresh-token", "", getCookieOptions(0));
}

export async function POST(req: NextRequest) {
  const supabaseEnv = getSupabasePublicEnv();
  if (!supabaseEnv) {
    return NextResponse.json({ error: "Server config error: missing Supabase public env" }, { status: 500 });
  }

  let body: SessionBody;
  try {
    body = (await req.json()) as SessionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  const expiresAt = typeof body.expires_at === "number" && Number.isFinite(body.expires_at)
    ? body.expires_at
    : null;

  if (!accessToken) {
    return NextResponse.json({ error: "access_token is required" }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    userResult = await supabase.auth.getUser(accessToken);
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to reach Supabase Auth while verifying the session. Check server DNS/network access to NEXT_PUBLIC_SUPABASE_URL.",
      },
      { status: 503 },
    );
  }

  if (userResult.error || !userResult.data.user) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAge = expiresAt && expiresAt > now ? expiresAt - now : undefined;
  const response = NextResponse.json({ ok: true });
  response.cookies.set("sb-access-token", accessToken, getCookieOptions(maxAge));
  if (refreshToken) {
    response.cookies.set("sb-refresh-token", refreshToken, getCookieOptions(maxAge));
  } else {
    response.cookies.set("sb-refresh-token", "", getCookieOptions(0));
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
