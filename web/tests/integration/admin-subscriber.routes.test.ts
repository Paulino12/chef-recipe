import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserFromRequest: vi.fn(),
  grantEnterpriseAccess: vi.fn(),
  revokeEnterpriseAccess: vi.fn(),
}));

vi.mock("@/lib/api/currentUser", () => ({
  getCurrentUserFromRequest: mocks.getCurrentUserFromRequest,
}));

vi.mock("@/lib/api/subscribers", () => ({
  grantEnterpriseAccess: mocks.grantEnterpriseAccess,
  revokeEnterpriseAccess: mocks.revokeEnterpriseAccess,
}));

import { POST as grantEnterprisePost } from "@/app/api/admin/subscribers/[userId]/grant-enterprise/route";
import { POST as revokeEnterprisePost } from "@/app/api/admin/subscribers/[userId]/revoke-enterprise/route";

describe("owner subscriber admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated grant request", async () => {
    mocks.getCurrentUserFromRequest.mockResolvedValueOnce(null);

    const response = await grantEnterprisePost(
      new NextRequest("http://localhost:3000/api/admin/subscribers/sub-1/grant-enterprise", {
        method: "POST",
      }),
      { params: Promise.resolve({ userId: "sub-1" }) },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-owner revoke request", async () => {
    mocks.getCurrentUserFromRequest.mockResolvedValueOnce({
      id: "sub-1",
      role: "subscriber",
    });

    const response = await revokeEnterprisePost(
      new NextRequest("http://localhost:3000/api/admin/subscribers/sub-2/revoke-enterprise", {
        method: "POST",
      }),
      { params: Promise.resolve({ userId: "sub-2" }) },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("grants enterprise access and forwards actor + reason", async () => {
    mocks.getCurrentUserFromRequest.mockResolvedValueOnce({
      id: "owner-1",
      role: "owner",
    });
    mocks.grantEnterpriseAccess.mockResolvedValueOnce({
      user_id: "sub-2",
      enterprise_granted: true,
      updated_at: "2026-02-19T00:00:00.000Z",
    });

    const response = await grantEnterprisePost(
      new NextRequest("http://localhost:3000/api/admin/subscribers/sub-2/grant-enterprise", {
        method: "POST",
        body: JSON.stringify({ reason: "  manual test  " }),
      }),
      { params: Promise.resolve({ userId: "  sub-2  " }) },
    );
    const body = (await response.json()) as {
      user_id: string;
      enterprise_granted: boolean;
      updated_at: string;
    };

    expect(response.status).toBe(200);
    expect(mocks.grantEnterpriseAccess).toHaveBeenCalledWith("sub-2", "manual test", "owner-1");
    expect(body).toEqual({
      user_id: "sub-2",
      enterprise_granted: true,
      updated_at: "2026-02-19T00:00:00.000Z",
    });
  });
});
