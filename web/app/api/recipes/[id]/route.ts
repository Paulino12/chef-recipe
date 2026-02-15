import { NextRequest, NextResponse } from "next/server";

import { computeRecipeAccess } from "@/lib/api/access";
import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { sanityServer } from "@/lib/sanity/serverClient";

const AUDIENCES = new Set(["public", "enterprise"] as const);
type Audience = "public" | "enterprise";

function isAudienceAllowed(audience: Audience, canViewPublic: boolean, canViewEnterprise: boolean) {
  return audience === "public" ? canViewPublic : canViewEnterprise;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);

  const audience = (searchParams.get("audience") ?? "public") as Audience;
  if (!AUDIENCES.has(audience)) {
    return NextResponse.json({ error: 'audience must be "public" or "enterprise"' }, { status: 400 });
  }

  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = computeRecipeAccess({
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    enterpriseGranted: user.enterpriseGranted,
  });

  if (!isAudienceAllowed(audience, access.canViewPublic, access.canViewEnterprise)) {
    return NextResponse.json({ error: `Access denied for ${audience} recipes` }, { status: 403 });
  }

  const { id } = await ctx.params;

  const query = `
    *[
      _type == "recipe" &&
      _id == $id &&
      !(_id in path("drafts.**")) &&
      visibility.${audience} == true
    ][0]{
      "id": _id,
      pluNumber,
      title,
      categoryPath,
      portions,
      ingredients[]{ text, qty, unit, item },
      method,
      allergens,
      nutrition,
      visibility
    }
  `;

  const recipe = await sanityServer.fetch(query, { id });

  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(recipe);
}

