import { NextRequest, NextResponse } from "next/server";

import { SubscriptionStatus } from "@/lib/api/access";
import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { setSubscriberSubscriptionStatus } from "@/lib/api/subscribers";

type Body = {
  status?: unknown;
  reason?: unknown;
};

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
]);

function parseReason(body: Body) {
  return typeof body.reason === "string" ? body.reason.trim() : undefined;
}

function parseStatus(body: Body): SubscriptionStatus | null {
  if (typeof body.status !== "string") return null;
  const value = body.status.trim();
  return VALID_STATUSES.has(value as SubscriptionStatus) ? (value as SubscriptionStatus) : null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
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

  const status = parseStatus(body);
  if (!status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await setSubscriberSubscriptionStatus(
    trimmedUserId,
    status,
    parseReason(body),
    user.id,
  );
  if (!updated) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

  return NextResponse.json(updated);
}
