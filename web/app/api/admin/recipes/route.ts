import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_AUDIENCES,
  type AdminAudience,
  listAdminRecipes,
  setRecipesVisibility,
} from "@/lib/api/adminRecipes";
import { requireApiKey } from "@/lib/api/auth";
import { normalizeCollection } from "@/lib/recipes";

function unauthorized(req: NextRequest) {
  // Current protection model for recipe admin endpoints: shared server API key.
  const check = requireApiKey(req, process.env.ADMIN_API_KEY);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  const authError = unauthorized(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const category = (searchParams.get("category") ?? "").trim();
  const collection = normalizeCollection((searchParams.get("collection") ?? "").trim());
  const imageFilterParam = (searchParams.get("image") ?? "").trim();
  const imageFilter = imageFilterParam === "with" || imageFilterParam === "without"
    ? imageFilterParam
    : undefined;
  const visibilityFilterParam = (searchParams.get("visibility") ?? "").trim();
  const visibilityFilter =
    visibilityFilterParam === "public_on" ||
    visibilityFilterParam === "public_off" ||
    visibilityFilterParam === "enterprise_on" ||
    visibilityFilterParam === "enterprise_off" ||
    visibilityFilterParam === "any_on" ||
    visibilityFilterParam === "both_off"
      ? visibilityFilterParam
      : undefined;
  const costingFilterParam = (searchParams.get("costing") ?? "").trim();
  const costingFilter =
    costingFilterParam === "with" || costingFilterParam === "without"
      ? costingFilterParam
      : undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  try {
    const recipes = await listAdminRecipes(q, {
      page,
      pageSize,
      category,
      collection,
      imageFilter,
      visibilityFilter,
      costingFilter,
    });
    return NextResponse.json(recipes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PatchBody = {
  id?: unknown;
  ids?: unknown;
  audience?: unknown;
  value?: unknown;
  includeRelated?: unknown;
};

export async function PATCH(req: NextRequest) {
  const authError = unauthorized(req);
  if (authError) return authError;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((value): value is string => typeof value === "string").map((value) => value.trim())
    : [];
  const targetIds = [...new Set([id, ...ids].filter(Boolean))];
  if (!targetIds.length) return NextResponse.json({ error: "id or ids is required" }, { status: 400 });
  if (targetIds.some((targetId) => targetId.startsWith("drafts."))) {
    return NextResponse.json({ error: "draft ids are not supported" }, { status: 400 });
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

  const validatedAudience = audience as AdminAudience;
  const includeRelated = body.includeRelated === true;

  try {
    const updated = await setRecipesVisibility(targetIds, validatedAudience, body.value, {
      includeRelated,
    });
    if (!updated.updatedIds.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      updatedCount: updated.updatedIds.length,
      relatedCount: updated.relatedIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update recipe visibility";
    const status = message.toLowerCase().includes("permission") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
