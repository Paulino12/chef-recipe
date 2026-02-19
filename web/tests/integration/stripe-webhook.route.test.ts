import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  mapStripeStatusToAppStatus: vi.fn(),
  toIsoFromUnixSeconds: vi.fn(),
  findUserIdByStripeCustomerOrSubscription: vi.fn(),
  syncStripeSubscriptionStatus: vi.fn(),
  upsertBillingCustomerLink: vi.fn(),
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
}));

vi.mock("@/lib/api/stripe", () => ({
  getStripeClient: mocks.getStripeClient,
  mapStripeStatusToAppStatus: mocks.mapStripeStatusToAppStatus,
  toIsoFromUnixSeconds: mocks.toIsoFromUnixSeconds,
}));

vi.mock("@/lib/api/stripeBilling", () => ({
  findUserIdByStripeCustomerOrSubscription: mocks.findUserIdByStripeCustomerOrSubscription,
  syncStripeSubscriptionStatus: mocks.syncStripeSubscriptionStatus,
  upsertBillingCustomerLink: mocks.upsertBillingCustomerLink,
}));

import { POST } from "@/app/api/billing/stripe/webhook/route";

describe("POST /api/billing/stripe/webhook", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    mocks.getStripeClient.mockReturnValue({
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.retrieveSubscription },
    });
    mocks.mapStripeStatusToAppStatus.mockImplementation((status: string) =>
      status === "trialing" ? "trialing" : status === "active" ? "active" : "expired",
    );
    mocks.toIsoFromUnixSeconds.mockImplementation((value: number | null | undefined) => {
      if (typeof value !== "number" || value <= 0) return null;
      return new Date(value * 1000).toISOString();
    });
  });

  afterEach(() => {
    if (typeof originalSecret === "undefined") {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/billing/stripe/webhook", {
      method: "POST",
      body: "{}",
    });

    const response = await POST(req);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing stripe-signature header");
  });

  it("returns 400 when Stripe signature verification fails", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const req = new NextRequest("http://localhost:3000/api/billing/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "t=1,v1=fake",
      },
    });

    const response = await POST(req);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid signature");
  });

  it("syncs subscription snapshot for customer.subscription.updated", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_sub_updated",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: {
            user_id: TEST_USER_ID,
          },
          trial_end: 1_800_000_000,
          current_period_end: 1_800_086_400,
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/billing/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "t=1,v1=fake",
      },
    });

    const response = await POST(req);
    const body = (await response.json()) as {
      ok: boolean;
      user_id: string;
      subscription_status: string;
    };

    expect(response.status).toBe(200);
    expect(mocks.findUserIdByStripeCustomerOrSubscription).not.toHaveBeenCalled();
    expect(mocks.upsertBillingCustomerLink).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      customerId: "cus_123",
    });
    expect(mocks.syncStripeSubscriptionStatus).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      subscriptionStatus: "active",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      trialEndsAt: "2027-01-15T08:00:00.000Z",
      currentPeriodEndsAt: "2027-01-16T08:00:00.000Z",
      eventId: "evt_sub_updated",
      eventType: "customer.subscription.updated",
    });
    expect(body).toEqual({
      ok: true,
      user_id: TEST_USER_ID,
      subscription_status: "active",
    });
  });

  it("marks subscription as past_due on invoice.payment_failed", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_777",
          parent: {
            subscription_details: {
              subscription: "sub_777",
            },
          },
        },
      },
    });
    mocks.findUserIdByStripeCustomerOrSubscription.mockResolvedValueOnce(TEST_USER_ID);

    const req = new NextRequest("http://localhost:3000/api/billing/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "t=1,v1=fake",
      },
    });

    const response = await POST(req);
    const body = (await response.json()) as {
      ok: boolean;
      user_id: string;
      subscription_status: string;
    };

    expect(response.status).toBe(200);
    expect(mocks.findUserIdByStripeCustomerOrSubscription).toHaveBeenCalledWith({
      customerId: "cus_777",
      subscriptionId: "sub_777",
    });
    expect(mocks.syncStripeSubscriptionStatus).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      subscriptionStatus: "past_due",
      customerId: "cus_777",
      subscriptionId: "sub_777",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      eventId: "evt_invoice_failed",
      eventType: "invoice.payment_failed",
    });
    expect(body).toEqual({
      ok: true,
      user_id: TEST_USER_ID,
      subscription_status: "past_due",
    });
  });
});
