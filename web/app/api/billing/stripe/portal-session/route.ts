import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { getStripeClient } from "@/lib/api/stripe";
import { getBillingSubscriptionRow } from "@/lib/api/stripeBilling";

function resolveBaseUrl(req: NextRequest) {
  const configured = process.env.APP_BASE_URL?.trim() || "";
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await getBillingSubscriptionRow(user.id);
  const customerId = subscription?.provider_customer_id?.trim() || "";
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing customer found for this account yet." },
      { status: 400 },
    );
  }

  const stripe = getStripeClient();
  const baseUrl = resolveBaseUrl(req);
  const returnUrl =
    process.env.STRIPE_PORTAL_RETURN_URL?.trim() ||
    `${baseUrl}/recipes?billing=portal`;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return NextResponse.json({
    portal_url: session.url,
  });
}
