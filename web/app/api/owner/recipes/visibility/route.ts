import { NextRequest, NextResponse } from "next/server";

import { ADMIN_AUDIENCES, type AdminAudience, setRecipesVisibility } from "@/lib/api/adminRecipes";
import { getServerAccessSession } from "@/lib/api/serverSession";

type VisibilityBody = {
  ids?: unknown;
  audience?: unknown;
  value?: unknown;
};

export async function POST(req: NextRequest) {
  const session = await getServerAccessSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: VisibilityBody;
  try {
    body = (await req.json()) as VisibilityBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  if (!ids.length) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }

  const audience = body.audience;
  if (!ADMIN_AUDIENCES.includes(audience as AdminAudience)) {
    return NextResponse.json(
      { error: 'audience must be "public" or "enterprise"' },
      { status: 400 },
    );
  }

  if (typeof body.value !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }

  try {
    const updated = await setRecipesVisibility(ids, audience as AdminAudience, body.value, {
      includeRelated: true,
    });
    if (!updated.updatedIds.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      updatedCount: updated.updatedIds.length,
      relatedCount: updated.relatedIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update recipe visibility";
    const lower = message.toLowerCase();
    const status = lower.includes("permission")
      ? 403
      : lower.includes("unauthorized")
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
