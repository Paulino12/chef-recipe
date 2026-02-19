import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { createSupabaseAdminClient } from "@/lib/api/supabaseAdmin";

type Body = {
  display_name?: unknown;
};

type ProfileRow = {
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string | null;
  updated_at: string | null;
};

function normalizeDisplayName(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return { error: "display_name must be a string or null" } as const;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) {
    return { error: "display_name must be 80 characters or fewer" } as const;
  }
  return trimmed;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
    },
    entitlements: {
      subscription_status: user.subscriptionStatus,
      enterprise_granted: user.enterpriseGranted,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const normalizedDisplayName = normalizeDisplayName(body.display_name);
  if (
    normalizedDisplayName &&
    typeof normalizedDisplayName === "object" &&
    "error" in normalizedDisplayName
  ) {
    return NextResponse.json({ error: normalizedDisplayName.error }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server config error: missing Supabase admin env" }, { status: 500 });
  }

  const result = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        role: user.role,
        display_name: normalizedDisplayName,
      },
      { onConflict: "user_id" },
    )
    .select("user_id,email,display_name,role,updated_at")
    .single<ProfileRow>();

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      id: result.data.user_id ?? user.id,
      email: result.data.email ?? user.email,
      display_name: result.data.display_name,
      role: result.data.role ?? user.role,
    },
    updated_at: result.data.updated_at,
  });
}
