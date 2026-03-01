import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";

function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function getPasswordResetRedirectUrl(req: NextRequest) {
  const configured = process.env.PASSWORD_RESET_REDIRECT_TO?.trim();
  if (configured) return configured;
  return new URL("/reset-password", req.nextUrl.origin).toString();
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseEnv = getSupabasePublicEnv();
  if (!supabaseEnv) {
    return NextResponse.json({ error: "Server config error: missing Supabase public env" }, { status: 500 });
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.auth.resetPasswordForEmail(
    user.email,
    { redirectTo: getPasswordResetRedirectUrl(req) },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Password reset email sent.",
  });
}
