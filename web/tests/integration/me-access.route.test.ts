import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserFromRequest: vi.fn(),
}));

vi.mock("@/lib/api/currentUser", () => ({
  getCurrentUserFromRequest: mocks.getCurrentUserFromRequest,
}));

import { GET } from "@/app/api/me/access/route";

describe("GET /api/me/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when request is unauthenticated", async () => {
    mocks.getCurrentUserFromRequest.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest("http://localhost:3000/api/me/access"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns computed subscriber entitlements", async () => {
    mocks.getCurrentUserFromRequest.mockResolvedValueOnce({
      id: "sub-1",
      email: "sub@example.com",
      displayName: "Subscriber One",
      role: "subscriber",
      subscriptionStatus: "trialing",
      enterpriseGranted: false,
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/me/access"));
    const body = (await response.json()) as {
      user: { id: string; email: string; role: string; display_name: string | null };
      entitlements: { can_view_public: boolean; can_view_enterprise: boolean };
      computed_at: string;
    };

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      id: "sub-1",
      email: "sub@example.com",
      display_name: "Subscriber One",
      role: "subscriber",
    });
    expect(body.entitlements.can_view_public).toBe(true);
    expect(body.entitlements.can_view_enterprise).toBe(false);
    expect(Number.isNaN(Date.parse(body.computed_at))).toBe(false);
  });
});
