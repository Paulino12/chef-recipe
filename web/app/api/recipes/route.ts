import { NextRequest, NextResponse } from "next/server";

import { computeRecipeAccess } from "@/lib/api/access";
import { getCurrentUserFromRequest } from "@/lib/api/currentUser";
import { sanityServer } from "@/lib/sanity/serverClient";

const AUDIENCES = new Set(["public", "enterprise"] as const);
type Audience = "public" | "enterprise";

function isAudienceAllowed(audience: Audience, canViewPublic: boolean, canViewEnterprise: boolean) {
  return audience === "public" ? canViewPublic : canViewEnterprise;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const audience = (searchParams.get("audience") ?? "public") as Audience;
  if (!AUDIENCES.has(audience)) {
    return NextResponse.json(
      { error: 'audience must be "public" or "enterprise"' },
      { status: 400 },
    );
  }

  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization is based on computed access flags, not raw role alone.
  const access = computeRecipeAccess({
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    enterpriseGranted: user.enterpriseGranted,
  });

  if (!isAudienceAllowed(audience, access.canViewPublic, access.canViewEnterprise)) {
    return NextResponse.json({ error: `Access denied for ${audience} recipes` }, { status: 403 });
  }

  const qRaw = searchParams.get("q") ?? "";
  const q = qRaw.trim();

  const query = `
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      visibility.${audience} == true
      ${q ? "&& title match $q" : ""}
    ] | order(title asc) {
      "id": _id,
      pluNumber,
      title,
      categoryPath,
      portions,
      nutrition { portionNetWeightG }
    }
  `;

  const data = await sanityServer.fetch(query, q ? { q: `*${q}*` } : {});
  return NextResponse.json(data);
}

