import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { getStripeClient } from "@/lib/api/stripe";
import { getBillingSubscriptionRow, upsertBillingCustomerLink } from "@/lib/api/stripeBilling";

type Body = {
  priceId?: unknown;
};

function parsePriceId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function resolveBaseUrl(req: NextRequest) {
  const configured = process.env.APP_BASE_URL?.trim() || "";
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin.replace(/\/$/, "");
}

function resolveTrialDays() {
  const raw = process.env.STRIPE_TRIAL_DAYS?.trim() || "3";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  const integer = Math.floor(parsed);
  if (integer <= 0) return 0;
  return Math.min(integer, 30);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "subscriber") {
    return NextResponse.json({ error: "Only subscribers can start checkout." }, { status: 403 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const requestedPriceId = parsePriceId(body.priceId);
  const priceId = requestedPriceId || process.env.STRIPE_PUBLIC_PRICE_ID?.trim() || "";
  if (!priceId) {
    return NextResponse.json({ error: "Missing Stripe price id configuration." }, { status: 500 });
  }

  const stripe = getStripeClient();
  const existing = await getBillingSubscriptionRow(user.id);
  let customerId = existing?.provider_customer_id?.trim() || "";

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        user_id: user.id,
      },
    });
    customerId = customer.id;
    await upsertBillingCustomerLink({ userId: user.id, customerId });
  }

  const baseUrl = resolveBaseUrl(req);
  const successUrl =
    process.env.STRIPE_CHECKOUT_SUCCESS_URL?.trim() ||
    `${baseUrl}/recipes?checkout=success`;
  const cancelUrl =
    process.env.STRIPE_CHECKOUT_CANCEL_URL?.trim() ||
    `${baseUrl}/recipes?checkout=cancel`;
  const trialDays = resolveTrialDays();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    client_reference_id: user.id,
    metadata: {
      user_id: user.id,
    },
    subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
  });

  return NextResponse.json({
    checkout_url: session.url,
    checkout_session_id: session.id,
  });
}
