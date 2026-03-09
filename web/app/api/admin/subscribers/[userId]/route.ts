import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { deleteSubscriber } from "@/lib/api/subscribers";

type Body = {
  reason?: unknown;
};

function parseReason(body: Body) {
  return typeof body.reason === "string" ? body.reason.trim() : undefined;
}

export async function DELETE(
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

  const deleted = await deleteSubscriber(trimmedUserId, parseReason(body), user.id);
  if (!deleted) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

  return NextResponse.json(deleted);
}
