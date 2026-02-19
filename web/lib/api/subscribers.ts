import { createClient } from "@supabase/supabase-js";

import { computeRecipeAccess, SubscriptionStatus } from "@/lib/api/access";
import { Database } from "@/lib/api/supabaseDatabase";

type SubscriberRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  subscription_status: SubscriptionStatus;
  enterprise_granted: boolean;
  updated_at: string;
};

type UserAccessViewRow = {
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string | null;
  subscription_status: SubscriptionStatus | null;
  enterprise_granted: boolean | null;
  can_view_public: boolean | null;
  can_view_enterprise: boolean | null;
};

type TimestampRow = {
  user_id: string | null;
  updated_at: string | null;
};

export type AdminSubscriber = {
  user_id: string;
  email: string;
  display_name: string | null;
  subscription_status: SubscriptionStatus;
  enterprise_granted: boolean;
  can_view_public: boolean;
  can_view_enterprise: boolean;
  updated_at: string;
};

export type ListSubscribersOptions = {
  q?: string;
  status?: SubscriptionStatus;
  enterprise?: boolean;
  page?: number;
  pageSize?: number;
};

export type SubscriptionStatusUpdate = {
  user_id: string;
  subscription_status: SubscriptionStatus;
  updated_at: string;
};

type SupabaseEnv = {
  url: string;
  serviceRoleKey: string;
};

type SupabaseAdminClient = ReturnType<typeof createClient<Database>>;

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

const DEV_SUBSCRIBERS_SEED: SubscriberRow[] = [
  {
    user_id: "sub_001",
    email: "alice@example.com",
    display_name: "Alice",
    subscription_status: "active",
    enterprise_granted: false,
    updated_at: "2026-02-14T12:00:00.000Z",
  },
  {
    user_id: "sub_002",
    email: "bob@example.com",
    display_name: "Bob",
    subscription_status: "expired",
    enterprise_granted: true,
    updated_at: "2026-02-14T12:00:00.000Z",
  },
  {
    user_id: "sub_003",
    email: "carol@example.com",
    display_name: "Carol",
    subscription_status: "trialing",
    enterprise_granted: true,
    updated_at: "2026-02-14T12:00:00.000Z",
  },
];

const devSubscribersStore: SubscriberRow[] = DEV_SUBSCRIBERS_SEED.map((row) => ({ ...row }));

function parseSubscriptionStatus(value: string | null | undefined): SubscriptionStatus | null {
  if (!value) return null;
  return VALID_STATUSES.has(value as SubscriptionStatus) ? (value as SubscriptionStatus) : null;
}

function parseIsoOrFallback(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function getSupabaseEnv(): SupabaseEnv | null {
  // No Supabase config means local/dev fallback mode.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url && !serviceRoleKey) return null;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url, serviceRoleKey };
}

function createSupabaseAdminClient(env: SupabaseEnv): SupabaseAdminClient {
  // Server-only admin client: used for owner APIs (subscriber list + grant/revoke).
  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizePage(value?: number) {
  if (!value || !Number.isFinite(value)) return 1;
  const n = Math.floor(value);
  return n > 0 ? n : 1;
}

function normalizePageSize(value?: number) {
  if (!value || !Number.isFinite(value)) return 25;
  const n = Math.floor(value);
  if (n <= 0) return 25;
  return n > 100 ? 100 : n;
}

function pickNewestIso(values: Array<string | null | undefined>) {
  let latest = 0;
  for (const value of values) {
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return latest > 0 ? new Date(latest).toISOString() : new Date().toISOString();
}

function toAdminSubscriber(row: SubscriberRow): AdminSubscriber {
  const access = computeRecipeAccess({
    role: "subscriber",
    subscriptionStatus: row.subscription_status,
    enterpriseGranted: row.enterprise_granted,
  });

  return {
    user_id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    subscription_status: row.subscription_status,
    enterprise_granted: row.enterprise_granted,
    can_view_public: access.canViewPublic,
    can_view_enterprise: access.canViewEnterprise,
    updated_at: row.updated_at,
  };
}

function toAdminSubscriberFromView(
  row: UserAccessViewRow,
  updatedAtMap: Map<string, string>,
): AdminSubscriber | null {
  const userId = row.user_id?.trim() || "";
  const email = row.email?.trim() || "";
  const displayName = row.display_name?.trim() || null;
  const status = parseSubscriptionStatus(row.subscription_status) || "expired";
  if (!userId || !email) return null;

  return {
    user_id: userId,
    email,
    display_name: displayName,
    subscription_status: status,
    enterprise_granted: Boolean(row.enterprise_granted),
    can_view_public: Boolean(row.can_view_public),
    can_view_enterprise: Boolean(row.can_view_enterprise),
    updated_at: parseIsoOrFallback(updatedAtMap.get(userId), new Date().toISOString()),
  };
}

function updateEnterpriseGrantDev(userId: string, enterpriseGranted: boolean) {
  const index = devSubscribersStore.findIndex((row) => row.user_id === userId);
  if (index < 0) return null;

  const current = devSubscribersStore[index];
  const updated: SubscriberRow = {
    ...current,
    enterprise_granted: enterpriseGranted,
    updated_at: new Date().toISOString(),
  };

  devSubscribersStore[index] = updated;
  return toAdminSubscriber(updated);
}

function updateSubscriptionStatusDev(userId: string, status: SubscriptionStatus) {
  const index = devSubscribersStore.findIndex((row) => row.user_id === userId);
  if (index < 0) return null;

  const current = devSubscribersStore[index];
  const updated: SubscriberRow = {
    ...current,
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  devSubscribersStore[index] = updated;
  return {
    user_id: updated.user_id,
    subscription_status: updated.subscription_status,
    updated_at: updated.updated_at,
  } satisfies SubscriptionStatusUpdate;
}

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadUpdatedAtByUserId(
  supabase: SupabaseAdminClient,
  userIds: string[],
) {
  if (userIds.length === 0) return new Map<string, string>();

  const [profileResult, subscriptionResult, entitlementResult] = await Promise.all([
    supabase.from("user_profiles").select("user_id,updated_at").in("user_id", userIds),
    supabase.from("user_subscriptions").select("user_id,updated_at").in("user_id", userIds),
    supabase.from("user_entitlements").select("user_id,updated_at").in("user_id", userIds),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (subscriptionResult.error) throw new Error(subscriptionResult.error.message);
  if (entitlementResult.error) throw new Error(entitlementResult.error.message);

  const perUser = new Map<string, string[]>();
  const addRows = (rows: TimestampRow[] | null) => {
    for (const row of rows ?? []) {
      const userId = row.user_id?.trim() || "";
      if (!userId) continue;
      const list = perUser.get(userId) ?? [];
      if (row.updated_at) list.push(row.updated_at);
      perUser.set(userId, list);
    }
  };

  addRows(profileResult.data as TimestampRow[] | null);
  addRows(subscriptionResult.data as TimestampRow[] | null);
  addRows(entitlementResult.data as TimestampRow[] | null);

  const output = new Map<string, string>();
  for (const [userId, values] of perUser.entries()) {
    output.set(userId, pickNewestIso(values));
  }
  return output;
}

async function listSubscribersFromSupabase(options: ListSubscribersOptions = {}) {
  // Main source of truth for owner subscriber management.
  // Reads computed access from the SQL view, then enriches with a single "updated_at" per user.
  const env = getSupabaseEnv();
  if (!env) return null;

  const page = normalizePage(options.page);
  const pageSize = normalizePageSize(options.pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  const q = options.q?.trim() ?? "";

  const supabase = createSupabaseAdminClient(env);
  let query = supabase
    .from("v_user_access")
    .select(
      "user_id,email,display_name,role,subscription_status,enterprise_granted,can_view_public,can_view_enterprise",
      { count: "exact" },
    )
    .eq("role", "subscriber")
    .order("email", { ascending: true })
    .range(start, end);

  if (q) {
    query = query.or(`email.ilike.%${q}%,display_name.ilike.%${q}%`);
  }
  if (options.status) query = query.eq("subscription_status", options.status);
  if (typeof options.enterprise === "boolean") {
    query = query.eq("enterprise_granted", options.enterprise);
  }

  const result = await query;
  if (result.error) throw new Error(result.error.message);

  const rows = (result.data ?? []) as UserAccessViewRow[];
  const userIds = rows
    .map((row) => row.user_id?.trim() || "")
    .filter((value) => Boolean(value));
  const updatedAtMap = await loadUpdatedAtByUserId(supabase, userIds);

  const items = rows
    .map((row) => toAdminSubscriberFromView(row, updatedAtMap))
    .filter((row): row is AdminSubscriber => Boolean(row));

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total: result.count ?? 0,
    },
  };
}

async function updateEnterpriseGrantSupabase(
  userId: string,
  enterpriseGranted: boolean,
  actorUserId?: string,
  reason?: string,
) {
  // Owner action: toggle entitlement + record audit row for traceability.
  const env = getSupabaseEnv();
  if (!env) return null;
  if (!isUuid(userId)) return null;

  const supabase = createSupabaseAdminClient(env);
  const now = new Date().toISOString();

  const profileResult = await supabase
    .from("user_profiles")
    .select("user_id,email")
    .eq("user_id", userId)
    .eq("role", "subscriber")
    .maybeSingle<{ user_id: string | null; email: string | null }>();

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!profileResult.data?.user_id) return null;

  const safeActorUserId: string | null = isUuid(actorUserId) ? (actorUserId ?? null) : null;
  const entitlementPayload = enterpriseGranted
    ? {
        user_id: userId,
        enterprise_granted: true,
        granted_by: safeActorUserId,
        granted_at: now,
      }
    : {
        user_id: userId,
        enterprise_granted: false,
        granted_by: null,
        granted_at: null,
      };

  const entitlementResult = await supabase
    .from("user_entitlements")
    .upsert(entitlementPayload, { onConflict: "user_id" })
    .select("updated_at")
    .single<{ updated_at: string | null }>();

  if (entitlementResult.error) throw new Error(entitlementResult.error.message);

  const action = enterpriseGranted ? "grant_enterprise" : "revoke_enterprise";
  const auditResult = await supabase.from("audit_log").insert({
    actor_user_id: safeActorUserId,
    target_user_id: userId,
    action,
    reason: reason?.trim() || null,
    metadata: { enterprise_granted: enterpriseGranted },
  });

  if (auditResult.error) throw new Error(auditResult.error.message);

  return {
    user_id: userId,
    enterprise_granted: enterpriseGranted,
    updated_at: parseIsoOrFallback(entitlementResult.data?.updated_at, now),
  };
}

async function updateSubscriptionStatusSupabase(
  userId: string,
  status: SubscriptionStatus,
  actorUserId?: string,
  reason?: string,
) {
  // Owner action: set subscription status for billing simulation/testing.
  const env = getSupabaseEnv();
  if (!env) return null;
  if (!isUuid(userId)) return null;

  const supabase = createSupabaseAdminClient(env);

  const profileResult = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "subscriber")
    .maybeSingle<{ user_id: string | null }>();

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!profileResult.data?.user_id) return null;

  const now = new Date().toISOString();
  const trialEndsAt = status === "trialing" ? now : null;
  const currentPeriodEndsAt = status === "trialing" || status === "active" ? now : null;

  const upsertResult = await supabase
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        status,
        trial_ends_at: trialEndsAt,
        current_period_ends_at: currentPeriodEndsAt,
        provider: "manual_owner",
      },
      { onConflict: "user_id" },
    )
    .select("updated_at")
    .single<{ updated_at: string | null }>();

  if (upsertResult.error) throw new Error(upsertResult.error.message);

  const safeActorUserId: string | null = isUuid(actorUserId) ? (actorUserId ?? null) : null;
  const auditResult = await supabase.from("audit_log").insert({
    actor_user_id: safeActorUserId,
    target_user_id: userId,
    action: "set_subscription_status",
    reason: reason?.trim() || null,
    metadata: {
      subscription_status: status,
      provider: "manual_owner",
    },
  });

  if (auditResult.error) throw new Error(auditResult.error.message);

  return {
    user_id: userId,
    subscription_status: status,
    updated_at: parseIsoOrFallback(upsertResult.data?.updated_at, now),
  } satisfies SubscriptionStatusUpdate;
}

export async function listSubscribers(options: ListSubscribersOptions = {}) {
  // Prefer Supabase; keep deterministic dev fallback for local builds without DB wiring.
  const fromSupabase = await listSubscribersFromSupabase(options);
  if (fromSupabase) return fromSupabase;

  const page = normalizePage(options.page);
  const pageSize = normalizePageSize(options.pageSize);
  const q = options.q?.trim().toLowerCase() ?? "";

  const rows = devSubscribersStore.map(toAdminSubscriber).filter((row) => {
    if (q) {
      const emailMatch = row.email.toLowerCase().includes(q);
      const displayNameMatch = (row.display_name ?? "").toLowerCase().includes(q);
      if (!emailMatch && !displayNameMatch) return false;
    }
    if (options.status && row.subscription_status !== options.status) return false;
    if (typeof options.enterprise === "boolean" && row.enterprise_granted !== options.enterprise) {
      return false;
    }
    return true;
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total,
    },
  };
}

export async function grantEnterpriseAccess(
  userId: string,
  reason?: string,
  actorUserId?: string,
) {
  // Supabase-backed in real environments; in-memory fallback in dev-only mode.
  const fromSupabase = await updateEnterpriseGrantSupabase(userId, true, actorUserId, reason);
  if (fromSupabase) return fromSupabase;
  return updateEnterpriseGrantDev(userId, true);
}

export async function revokeEnterpriseAccess(
  userId: string,
  reason?: string,
  actorUserId?: string,
) {
  // Supabase-backed in real environments; in-memory fallback in dev-only mode.
  const fromSupabase = await updateEnterpriseGrantSupabase(userId, false, actorUserId, reason);
  if (fromSupabase) return fromSupabase;
  return updateEnterpriseGrantDev(userId, false);
}

export async function setSubscriptionStatus(
  userId: string,
  status: SubscriptionStatus,
  reason?: string,
  actorUserId?: string,
) {
  const fromSupabase = await updateSubscriptionStatusSupabase(
    userId,
    status,
    actorUserId,
    reason,
  );
  if (fromSupabase) return fromSupabase;
  return updateSubscriptionStatusDev(userId, status);
}
