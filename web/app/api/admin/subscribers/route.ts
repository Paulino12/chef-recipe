import { NextRequest, NextResponse } from "next/server";

import { SubscriptionStatus } from "@/lib/api/access";
import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { listSubscribers } from "@/lib/api/subscribers";

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

function parseStatus(value: string | null): SubscriptionStatus | undefined {
  if (!value) return undefined;
  return VALID_STATUSES.has(value as SubscriptionStatus) ? (value as SubscriptionStatus) : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  // Owner-only endpoint for subscriber list/filter in dashboard.
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Owner dashboard filters.
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const status = parseStatus(searchParams.get("status"));
  const enterprise = parseBoolean(searchParams.get("enterprise"));
  const page = parseNumber(searchParams.get("page"));
  const pageSize = parseNumber(searchParams.get("page_size"));

  const data = await listSubscribers({ q, status, enterprise, page, pageSize });
  return NextResponse.json(data);
}

