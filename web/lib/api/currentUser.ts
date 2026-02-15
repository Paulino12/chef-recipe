import { NextRequest } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { AppRole, SubscriptionStatus } from "@/lib/api/access";

/**
 * Canonical "who is this request acting as?" resolver used by API routes.
 * Priority:
 * 1) Supabase access token (cookie/header)
 * 2) DEV_USER_* env fallback for local development
 */
export type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  subscriptionStatus: SubscriptionStatus | null;
  enterpriseGranted: boolean;
};

const VALID_ROLES = new Set<AppRole>(["owner", "subscriber"]);
const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

function parseRole(value: string | null | undefined): AppRole | null {
  if (!value) return null;
  return VALID_ROLES.has(value as AppRole) ? (value as AppRole) : null;
}

function parseSubscriptionStatus(
  value: string | null | undefined,
): SubscriptionStatus | null {
  if (!value) return null;
  return VALID_STATUSES.has(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : null;
}

function parseBool(value: string | null | undefined) {
  return value === "true";
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Accept the token from the standard Authorization header, an explicit custom header,
 * or the cookie set by the sign-in page.
 */
function getBearerToken(req: NextRequest) {
  const authorization = req.headers.get("authorization")?.trim() || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const directToken = req.headers.get("x-supabase-access-token")?.trim() || "";
  if (directToken) return directToken;

  const cookieToken = req.cookies.get("sb-access-token")?.value?.trim() || "";
  if (cookieToken) {
    try {
      return decodeURIComponent(cookieToken);
    } catch {
      return cookieToken;
    }
  }

  return null;
}

type ProfileRow = {
  email: string | null;
  role: string | null;
};

type SubscriptionRow = {
  status: string | null;
};

type EntitlementRow = {
  enterprise_granted: boolean | null;
};

async function getCurrentUserFromSupabase(req: NextRequest): Promise<CurrentUser | null> {
  const supabaseEnv = getSupabaseEnv();
  if (!supabaseEnv) return null;

  const token = getBearerToken(req);
  if (!token) return null;

  const supabase = createClient(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) return null;

  const user = userResult.data.user;
  const userId = user.id;
  const userEmail = user.email?.trim() || "";

  // Read app-specific role/subscription/entitlement rows from our public schema.
  const profileResult = await supabase
    .from("user_profiles")
    .select("email,role")
    .eq("user_id", userId)
    .maybeSingle<ProfileRow>();

  const subscriptionResult = await supabase
    .from("user_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle<SubscriptionRow>();

  const entitlementResult = await supabase
    .from("user_entitlements")
    .select("enterprise_granted")
    .eq("user_id", userId)
    .maybeSingle<EntitlementRow>();

  const profile = profileResult.data ?? null;
  const role =
    parseRole(profile?.role) ||
    parseRole(typeof user.user_metadata?.role === "string" ? user.user_metadata.role : null) ||
    "subscriber";

  const subscriptionStatus = parseSubscriptionStatus(subscriptionResult.data?.status ?? null);
  const enterpriseGranted = Boolean(entitlementResult.data?.enterprise_granted);

  const email = profile?.email?.trim() || userEmail;
  if (!email) return null;

  return {
    id: userId,
    email,
    role,
    subscriptionStatus,
    enterpriseGranted,
  };
}

function getCurrentUserFromDev(req: NextRequest): CurrentUser | null {
  // Optional local override path used while API auth wiring is still in progress.
  const id = req.headers.get("x-user-id")?.trim() || process.env.DEV_USER_ID?.trim() || "";
  const email =
    req.headers.get("x-user-email")?.trim() || process.env.DEV_USER_EMAIL?.trim() || "";
  const role =
    parseRole(req.headers.get("x-user-role")?.trim()) ||
    parseRole(process.env.DEV_USER_ROLE?.trim());
  const subscriptionStatus =
    parseSubscriptionStatus(req.headers.get("x-user-subscription-status")?.trim()) ||
    parseSubscriptionStatus(process.env.DEV_USER_SUBSCRIPTION_STATUS?.trim());

  const enterpriseGranted = parseBool(
    req.headers.get("x-user-enterprise-granted")?.trim() ||
      process.env.DEV_USER_ENTERPRISE_GRANTED?.trim(),
  );

  if (!id || !email || !role) return null;

  return {
    id,
    email,
    role,
    subscriptionStatus,
    enterpriseGranted,
  };
}

/**
 * Resolution order:
 * 1) Supabase bearer token (when configured)
 * 2) DEV_USER_* fallback for local development
 */
export async function getCurrentUserFromRequest(req: NextRequest): Promise<CurrentUser | null> {
  const fromSupabase = await getCurrentUserFromSupabase(req);
  if (fromSupabase) return fromSupabase;
  return getCurrentUserFromDev(req);
}

