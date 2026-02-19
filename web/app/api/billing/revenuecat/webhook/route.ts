import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { SubscriptionStatus } from "@/lib/api/access";
import { createSupabaseAdminClient } from "@/lib/api/supabaseAdmin";

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: unknown;
  entitlement_ids?: unknown;
  period_type?: string | null;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  product_id?: string | null;
  transaction_id?: string | null;
};

type RevenueCatPayload = {
  event?: RevenueCatEvent;
};

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function normalizeSecret(value: string | null | undefined) {
  return value?.trim() || "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function firstValidUserId(event: RevenueCatEvent) {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...parseStringArray(event.aliases),
  ]
    .map((value) => value?.trim() || "")
    .filter((value) => Boolean(value));

  return candidates.find((candidate) => isUuid(candidate)) ?? null;
}

function eventTargetsPublicEntitlement(event: RevenueCatEvent) {
  const requiredEntitlementId = process.env.REVENUECAT_PUBLIC_ENTITLEMENT_ID?.trim() || "";
  if (!requiredEntitlementId) return true;

  const entitlementIds = parseStringArray(event.entitlement_ids);
  return entitlementIds.includes(requiredEntitlementId);
}

function toIsoFromMillis(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

function mapEventToSubscriptionStatus(event: RevenueCatEvent): SubscriptionStatus | null {
  const type = (event.type ?? "").trim().toUpperCase();
  const periodType = (event.period_type ?? "").trim().toUpperCase();

  if (
    type === "INITIAL_PURCHASE" ||
    type === "RENEWAL" ||
    type === "PRODUCT_CHANGE" ||
    type === "UNCANCELLATION" ||
    type === "SUBSCRIPTION_EXTENDED"
  ) {
    return periodType === "TRIAL" || periodType === "INTRO" ? "trialing" : "active";
  }

  if (type === "BILLING_ISSUE") return "past_due";
  if (type === "EXPIRATION") return "expired";
  if (type === "REFUND") return "canceled";

  // Cancellation means auto-renew is disabled but entitlement can stay active until expiry.
  if (type === "CANCELLATION") return "active";

  return null;
}

export async function POST(req: NextRequest) {
  const expectedSecret = normalizeSecret(process.env.REVENUECAT_WEBHOOK_SECRET);
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Server config error: missing REVENUECAT_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const gotSecret = normalizeSecret(
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-revenuecat-secret"),
  );
  if (!gotSecret || !safeEqual(gotSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: RevenueCatPayload;
  try {
    payload = (await req.json()) as RevenueCatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const event = payload.event;
  if (!event) {
    return NextResponse.json({ error: "Missing event payload" }, { status: 400 });
  }

  if (!eventTargetsPublicEntitlement(event)) {
    return NextResponse.json({ ok: true, ignored: "non-target entitlement" });
  }

  const userId = firstValidUserId(event);
  if (!userId) {
    return NextResponse.json({ error: "No valid user id in event payload" }, { status: 400 });
  }

  const status = mapEventToSubscriptionStatus(event);
  if (!status) {
    return NextResponse.json({ ok: true, ignored: "event not mapped" });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server config error: missing Supabase admin env" },
      { status: 500 },
    );
  }

  const periodEndsAt = toIsoFromMillis(event.expiration_at_ms);
  const trialEndsAt = status === "trialing" ? periodEndsAt : null;

  const upsertResult = await supabaseAdmin
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        status,
        trial_ends_at: trialEndsAt,
        current_period_ends_at: periodEndsAt,
        provider: "revenuecat",
        provider_customer_id: event.app_user_id ?? event.original_app_user_id ?? userId,
        provider_subscription_id: event.product_id ?? event.transaction_id ?? null,
      },
      { onConflict: "user_id" },
    );

  if (upsertResult.error) {
    return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
  }

  const auditResult = await supabaseAdmin.from("audit_log").insert({
    actor_user_id: null,
    target_user_id: userId,
    action: "set_subscription_status",
    reason: "revenuecat_webhook",
    metadata: {
      provider: "revenuecat",
      event_id: event.id ?? null,
      event_type: event.type ?? null,
      period_type: event.period_type ?? null,
      product_id: event.product_id ?? null,
      subscription_status: status,
      period_ends_at: periodEndsAt,
    },
  });

  if (auditResult.error) {
    return NextResponse.json({ error: auditResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    subscription_status: status,
  });
}
