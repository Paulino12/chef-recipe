import { SubscriptionStatus } from "@/lib/api/access";
import { createSupabaseAdminClient } from "@/lib/api/supabaseAdmin";

type AppSubscriptionRow = {
  user_id: string | null;
  status: SubscriptionStatus | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
};

type UserIdOnlyRow = {
  user_id: string | null;
};

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

function parseStatus(value: string | null | undefined): SubscriptionStatus | null {
  if (!value) return null;
  return VALID_STATUSES.has(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : null;
}

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getBillingSubscriptionRow(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase admin env.");
  }

  const result = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id,status,provider_customer_id,provider_subscription_id")
    .eq("user_id", userId)
    .maybeSingle<AppSubscriptionRow>();

  if (result.error) throw new Error(result.error.message);
  return result.data ?? null;
}

export async function upsertBillingCustomerLink(input: {
  userId: string;
  customerId: string;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase admin env.");
  }

  const existing = await getBillingSubscriptionRow(input.userId);
  const existingStatus = parseStatus(existing?.status ?? null) || "trialing";

  const result = await supabaseAdmin.from("user_subscriptions").upsert(
    {
      user_id: input.userId,
      status: existingStatus,
      provider: "stripe",
      provider_customer_id: input.customerId,
    },
    { onConflict: "user_id" },
  );

  if (result.error) throw new Error(result.error.message);
}

export async function syncStripeSubscriptionStatus(input: {
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  customerId: string | null;
  subscriptionId: string | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  eventId: string | null;
  eventType: string | null;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase admin env.");
  }

  const upsertResult = await supabaseAdmin.from("user_subscriptions").upsert(
    {
      user_id: input.userId,
      status: input.subscriptionStatus,
      trial_ends_at: input.trialEndsAt,
      current_period_ends_at: input.currentPeriodEndsAt,
      provider: "stripe",
      provider_customer_id: input.customerId,
      provider_subscription_id: input.subscriptionId,
    },
    { onConflict: "user_id" },
  );

  if (upsertResult.error) throw new Error(upsertResult.error.message);

  const auditResult = await supabaseAdmin.from("audit_log").insert({
    actor_user_id: null,
    target_user_id: input.userId,
    action: "set_subscription_status",
    reason: "stripe_webhook",
    metadata: {
      provider: "stripe",
      event_id: input.eventId,
      event_type: input.eventType,
      subscription_status: input.subscriptionStatus,
      provider_customer_id: input.customerId,
      provider_subscription_id: input.subscriptionId,
      trial_ends_at: input.trialEndsAt,
      current_period_ends_at: input.currentPeriodEndsAt,
    },
  });

  if (auditResult.error) throw new Error(auditResult.error.message);
}

export async function findUserIdByStripeCustomerOrSubscription(input: {
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error("Missing Supabase admin env.");
  }

  if (input.subscriptionId) {
    const bySubscription = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("provider_subscription_id", input.subscriptionId)
      .maybeSingle<UserIdOnlyRow>();
    if (bySubscription.error) throw new Error(bySubscription.error.message);
    if (isUuid(bySubscription.data?.user_id)) return bySubscription.data?.user_id ?? null;
  }

  if (input.customerId) {
    const byCustomer = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("provider_customer_id", input.customerId)
      .maybeSingle<UserIdOnlyRow>();
    if (byCustomer.error) throw new Error(byCustomer.error.message);
    if (isUuid(byCustomer.data?.user_id)) return byCustomer.data?.user_id ?? null;
  }

  return null;
}
