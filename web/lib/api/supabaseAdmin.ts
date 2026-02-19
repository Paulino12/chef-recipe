import { createClient } from "@supabase/supabase-js";

import { Database } from "@/lib/api/supabaseDatabase";

type SupabaseAdminClient = ReturnType<typeof createClient<Database>>;

function getSupabaseAdminEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const withCode = error as { code?: string; message?: string };
  if (withCode.code === "23505") return true;
  const message = withCode.message?.toLowerCase() || "";
  return message.includes("duplicate key");
}

export function createSupabaseAdminClient(): SupabaseAdminClient | null {
  const env = getSupabaseAdminEnv();
  if (!env) return null;

  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Ensures app-level rows exist for a Supabase auth user.
 * This keeps "new subscriber => default public access" deterministic.
 */
export async function ensureUserAccessRows(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    userId: string;
    email: string;
  },
) {
  const safeEmail = input.email.trim() || `user-${input.userId}@example.invalid`;

  const [profileResult, subscriptionResult, entitlementResult] = await Promise.all([
    supabaseAdmin
      .from("user_profiles")
      .insert({ user_id: input.userId, email: safeEmail, role: "subscriber" }),
    supabaseAdmin
      .from("user_subscriptions")
      .insert({ user_id: input.userId, status: "trialing" }),
    supabaseAdmin
      .from("user_entitlements")
      .insert({ user_id: input.userId, enterprise_granted: false }),
  ]);

  if (profileResult.error && !isDuplicateKeyError(profileResult.error)) {
    throw new Error(profileResult.error.message);
  }
  if (subscriptionResult.error && !isDuplicateKeyError(subscriptionResult.error)) {
    throw new Error(subscriptionResult.error.message);
  }
  if (entitlementResult.error && !isDuplicateKeyError(entitlementResult.error)) {
    throw new Error(entitlementResult.error.message);
  }
}
