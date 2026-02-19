import { NextRequest, NextResponse } from "next/server";

import { SubscriptionStatus } from "@/lib/api/access";
import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { setSubscriptionStatus } from "@/lib/api/subscribers";

type Body = {
  status?: unknown;
  reason?: unknown;
};

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

function parseStatus(value: unknown): SubscriptionStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as SubscriptionStatus;
  return VALID_STATUSES.has(normalized) ? normalized : null;
}

function parseReason(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  // Owner-only subscription-status update endpoint.
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

  const parsedStatus = parseStatus(body.status);
  if (!parsedStatus) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await setSubscriptionStatus(
    trimmedUserId,
    parsedStatus,
    parseReason(body.reason),
    user.id,
  );
  if (!updated) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

  return NextResponse.json(updated);
}
