import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: new Error("No Supabase session"),
      })),
    },
  })),
}));

vi.mock("@/lib/api/supabaseAdmin", () => ({
  createSupabaseAdminClient: vi.fn(() => null),
  ensureUserAccessRows: vi.fn(),
}));

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";

describe("getCurrentUserFromRequest development fallback", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores header-based fallback in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH_FALLBACK_ENABLED", "true");

    const req = new NextRequest("http://localhost:3000/api/me/access", {
      headers: {
        "x-user-id": "owner-1",
        "x-user-email": "owner@example.com",
        "x-user-role": "owner",
      },
    });

    await expect(getCurrentUserFromRequest(req)).resolves.toBeNull();
  });

  it("requires explicit opt-in for development fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_USER_ID", "dev-user-1");
    vi.stubEnv("DEV_USER_EMAIL", "dev@example.com");
    vi.stubEnv("DEV_USER_ROLE", "owner");

    const req = new NextRequest("http://localhost:3000/api/me/access");

    await expect(getCurrentUserFromRequest(req)).resolves.toBeNull();
  });

  it("allows env-based fallback when explicitly enabled in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH_FALLBACK_ENABLED", "true");
    vi.stubEnv("DEV_USER_ID", "dev-user-1");
    vi.stubEnv("DEV_USER_EMAIL", "dev@example.com");
    vi.stubEnv("DEV_USER_ROLE", "owner");
    vi.stubEnv("DEV_USER_SUBSCRIPTION_STATUS", "active");
    vi.stubEnv("DEV_USER_ENTERPRISE_GRANTED", "true");

    const req = new NextRequest("http://localhost:3000/api/me/access");
    const user = await getCurrentUserFromRequest(req);

    expect(user).toEqual({
      id: "dev-user-1",
      email: "dev@example.com",
      displayName: null,
      role: "owner",
      subscriptionStatus: "active",
      enterpriseGranted: true,
      billingProvider: null,
      hasBillingCustomer: false,
      hasStripeSubscription: false,
    });
  });
});
