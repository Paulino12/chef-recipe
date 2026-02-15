import { NextRequest, NextResponse } from "next/server";

import { computeRecipeAccess } from "@/lib/api/access";
import { getCurrentUserFromRequest } from "@/lib/api/currentUser";

export async function GET(req: NextRequest) {
  // Single endpoint that converts identity + entitlements into effective permissions.
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = computeRecipeAccess({
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    enterpriseGranted: user.enterpriseGranted,
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    entitlements: {
      subscription_status: user.subscriptionStatus,
      enterprise_granted: user.enterpriseGranted,
      can_view_public: access.canViewPublic,
      can_view_enterprise: access.canViewEnterprise,
    },
    computed_at: new Date().toISOString(),
  });
}

