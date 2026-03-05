import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getCurrentUserFromRequest: vi.fn(),
  getStripeClient: vi.fn(),
  getBillingSubscriptionRow: vi.fn(),
  upsertBillingCustomerLink: vi.fn(),
  createCustomer: vi.fn(),
  createCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/api/currentUser", () => ({
  getCurrentUserFromRequest: mocks.getCurrentUserFromRequest,
}));

vi.mock("@/lib/api/stripe", () => ({
  getStripeClient: mocks.getStripeClient,
}));

vi.mock("@/lib/api/stripeBilling", () => ({
  getBillingSubscriptionRow: mocks.getBillingSubscriptionRow,
  upsertBillingCustomerLink: mocks.upsertBillingCustomerLink,
}));

import { POST } from "@/app/api/billing/stripe/checkout-session/route";

describe("POST /api/billing/stripe/checkout-session", () => {
  const originalPriceId = process.env.STRIPE_PUBLIC_PRICE_ID;
  const originalAllowedPriceIds = process.env.STRIPE_ALLOWED_PRICE_IDS;
  const originalTrialDays = process.env.STRIPE_TRIAL_DAYS;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.STRIPE_PUBLIC_PRICE_ID = "price_default";
    process.env.STRIPE_ALLOWED_PRICE_IDS = "";
    process.env.STRIPE_TRIAL_DAYS = "3";

    mocks.getCurrentUserFromRequest.mockResolvedValue({
      id: TEST_USER_ID,
      email: "subscriber@example.com",
      role: "subscriber",
      subscriptionStatus: "trialing",
      enterpriseGranted: false,
      billingProvider: null,
      hasBillingCustomer: false,
      hasStripeSubscription: false,
    });

    mocks.getBillingSubscriptionRow.mockResolvedValue(null);
    mocks.createCustomer.mockResolvedValue({ id: "cus_new_1" });
    mocks.createCheckoutSession.mockResolvedValue({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    mocks.getStripeClient.mockReturnValue({
      customers: { create: mocks.createCustomer },
      checkout: { sessions: { create: mocks.createCheckoutSession } },
    });
  });

  afterEach(() => {
    if (typeof originalPriceId === "undefined") {
      delete process.env.STRIPE_PUBLIC_PRICE_ID;
    } else {
      process.env.STRIPE_PUBLIC_PRICE_ID = originalPriceId;
    }

    if (typeof originalAllowedPriceIds === "undefined") {
      delete process.env.STRIPE_ALLOWED_PRICE_IDS;
    } else {
      process.env.STRIPE_ALLOWED_PRICE_IDS = originalAllowedPriceIds;
    }

    if (typeof originalTrialDays === "undefined") {
      delete process.env.STRIPE_TRIAL_DAYS;
    } else {
      process.env.STRIPE_TRIAL_DAYS = originalTrialDays;
    }
  });

  it("rejects unsupported requested price id", async () => {
    const req = new NextRequest("http://localhost:3000/api/billing/stripe/checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priceId: "price_not_allowed" }),
    });

    const response = await POST(req);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Unsupported Stripe price id.");
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("blocks checkout when a managed Stripe subscription is already active", async () => {
    mocks.getBillingSubscriptionRow.mockResolvedValueOnce({
      user_id: TEST_USER_ID,
      status: "active",
      provider: "stripe",
      provider_customer_id: "cus_existing_1",
      provider_subscription_id: "sub_existing_1",
    });

    const req = new NextRequest("http://localhost:3000/api/billing/stripe/checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const response = await POST(req);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Subscription already exists. Open billing portal to manage your plan.");
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("creates first checkout with subscription metadata and trial period", async () => {
    mocks.getBillingSubscriptionRow.mockResolvedValueOnce({
      user_id: TEST_USER_ID,
      status: "trialing",
      provider: null,
      provider_customer_id: null,
      provider_subscription_id: null,
    });

    const req = new NextRequest("http://localhost:3000/api/billing/stripe/checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const response = await POST(req);
    const body = (await response.json()) as {
      checkout_url: string;
      checkout_session_id: string;
    };

    expect(response.status).toBe(200);
    expect(mocks.createCustomer).toHaveBeenCalledWith({
      email: "subscriber@example.com",
      metadata: { user_id: TEST_USER_ID },
    });
    expect(mocks.upsertBillingCustomerLink).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      customerId: "cus_new_1",
    });
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_new_1",
        line_items: [{ price: "price_default", quantity: 1 }],
        subscription_data: {
          metadata: { user_id: TEST_USER_ID },
          trial_period_days: 3,
        },
      }),
    );
    expect(body).toEqual({
      checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
      checkout_session_id: "cs_test_1",
    });
  });

  it("does not grant a second trial when user has prior Stripe subscription history", async () => {
    mocks.getBillingSubscriptionRow.mockResolvedValueOnce({
      user_id: TEST_USER_ID,
      status: "canceled",
      provider: "stripe",
      provider_customer_id: "cus_old_1",
      provider_subscription_id: "sub_old_1",
    });

    const req = new NextRequest("http://localhost:3000/api/billing/stripe/checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    const createArgs = mocks.createCheckoutSession.mock.calls[0]?.[0] as {
      customer: string;
      subscription_data?: { trial_period_days?: number; metadata?: { user_id?: string } };
    };
    expect(createArgs.customer).toBe("cus_old_1");
    expect(createArgs.subscription_data?.metadata?.user_id).toBe(TEST_USER_ID);
    expect(createArgs.subscription_data?.trial_period_days).toBeUndefined();
  });
});
