import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_AUDIENCES,
  type AdminAudience,
  listAdminRecipes,
  setRecipeVisibility,
} from "@/lib/api/adminRecipes";
import { requireApiKey } from "@/lib/api/auth";

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
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  try {
    const recipes = await listAdminRecipes(q, { page, pageSize, category });
    return NextResponse.json(recipes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PatchBody = {
  id?: unknown;
  audience?: unknown;
  value?: unknown;
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
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (id.startsWith("drafts.")) {
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

  try {
    const updated = await setRecipeVisibility(id, validatedAudience, body.value);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, ...updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update recipe visibility";
    const status = message.toLowerCase().includes("permission") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
