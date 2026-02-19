import { NextRequest, NextResponse } from "next/server";

import Stripe from "stripe";

import { SubscriptionStatus } from "@/lib/api/access";
import {
  getStripeClient,
  mapStripeStatusToAppStatus,
  toIsoFromUnixSeconds,
} from "@/lib/api/stripe";
import {
  findUserIdByStripeCustomerOrSubscription,
  syncStripeSubscriptionStatus,
  upsertBillingCustomerLink,
} from "@/lib/api/stripeBilling";

export const runtime = "nodejs";

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseMetadataUserId(metadata: Stripe.Metadata | null | undefined) {
  const candidate = metadata?.user_id?.trim() || "";
  return isUuid(candidate) ? candidate : null;
}

function getSubscriptionCurrentPeriodEnd(
  subscription: Stripe.Subscription,
): number | null {
  const candidate = (
    subscription as Stripe.Subscription & { current_period_end?: number | null }
  ).current_period_end;
  return typeof candidate === "number" ? candidate : null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;
  if (typeof direct === "string") return direct;

  const fromParent = (
    invoice as Stripe.Invoice & {
      parent?: { subscription_details?: { subscription?: string | null } | null } | null;
    }
  ).parent?.subscription_details?.subscription;
  return typeof fromParent === "string" ? fromParent : null;
}

async function resolveUserId(input: {
  metadataUserId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  if (isUuid(input.metadataUserId)) return input.metadataUserId ?? null;
  return findUserIdByStripeCustomerOrSubscription({
    customerId: input.customerId ?? null,
    subscriptionId: input.subscriptionId ?? null,
  });
}

async function applyStripeSubscriptionSnapshot(input: {
  subscription: Stripe.Subscription;
  eventId: string | null;
  eventType: string | null;
}) {
  const subscription = input.subscription;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const metadataUserId = parseMetadataUserId(subscription.metadata);
  const userId = await resolveUserId({
    metadataUserId,
    customerId,
    subscriptionId: subscription.id,
  });
  if (!userId) return { ok: true, ignored: "unmapped_user" as const };

  if (customerId) {
    await upsertBillingCustomerLink({ userId, customerId });
  }

  const status = mapStripeStatusToAppStatus(subscription.status);
  await syncStripeSubscriptionStatus({
    userId,
    subscriptionStatus: status,
    customerId,
    subscriptionId: subscription.id,
    trialEndsAt: toIsoFromUnixSeconds(subscription.trial_end),
    currentPeriodEndsAt: toIsoFromUnixSeconds(
      getSubscriptionCurrentPeriodEnd(subscription),
    ),
    eventId: input.eventId,
    eventType: input.eventType,
  });

  return { ok: true, user_id: userId, subscription_status: status };
}

async function applyManualStatusFromInvoice(input: {
  invoice: Stripe.Invoice;
  status: SubscriptionStatus;
  eventId: string | null;
  eventType: string | null;
}) {
  const customerId = typeof input.invoice.customer === "string" ? input.invoice.customer : null;
  const subscriptionId = getInvoiceSubscriptionId(input.invoice);
  const userId = await resolveUserId({ customerId, subscriptionId });
  if (!userId) return { ok: true, ignored: "unmapped_user" as const };

  await syncStripeSubscriptionStatus({
    userId,
    subscriptionStatus: input.status,
    customerId,
    subscriptionId,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    eventId: input.eventId,
    eventType: input.eventType,
  });

  return { ok: true, user_id: userId, subscription_status: input.status };
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Server config error: missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature")?.trim() || "";
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const payload = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Stripe webhook signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const metadataUserId = parseMetadataUserId(session.metadata);
      const userId = await resolveUserId({
        metadataUserId: metadataUserId || session.client_reference_id || null,
        customerId,
        subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
      });

      if (userId && customerId) {
        await upsertBillingCustomerLink({ userId, customerId });
      }

      if (typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const applied = await applyStripeSubscriptionSnapshot({
          subscription,
          eventId: event.id,
          eventType: event.type,
        });
        return NextResponse.json(applied);
      }

      return NextResponse.json({ ok: true, ignored: "no_subscription_id" });
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const applied = await applyStripeSubscriptionSnapshot({
        subscription,
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json(applied);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const applied = await applyManualStatusFromInvoice({
        invoice,
        status: "past_due",
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json(applied);
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return NextResponse.json({ ok: true, ignored: "no_subscription_id" });

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const applied = await applyStripeSubscriptionSnapshot({
        subscription,
        eventId: event.id,
        eventType: event.type,
      });
      return NextResponse.json(applied);
    }

    return NextResponse.json({ ok: true, ignored: "event_not_handled" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
