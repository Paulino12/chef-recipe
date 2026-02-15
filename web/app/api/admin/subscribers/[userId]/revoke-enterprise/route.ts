import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { revokeEnterpriseAccess } from "@/lib/api/subscribers";

type Body = {
  reason?: unknown;
};

function parseReason(body: Body) {
  return typeof body.reason === "string" ? body.reason.trim() : undefined;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  // Owner-only entitlement update endpoint.
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await ctx.params;
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  // Pass actor id so the database audit log records who revoked access.
  const updated = await revokeEnterpriseAccess(trimmedUserId, parseReason(body), user.id);
  if (!updated) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

  return NextResponse.json({
    user_id: updated.user_id,
    enterprise_granted: updated.enterprise_granted,
    updated_at: updated.updated_at,
  });
}

