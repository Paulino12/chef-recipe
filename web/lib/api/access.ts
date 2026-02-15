export type AppRole = "owner" | "subscriber";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type AccessInput = {
  role: AppRole;
  subscriptionStatus?: SubscriptionStatus | null;
  enterpriseGranted?: boolean | null;
};

export type ComputedAccess = {
  canViewPublic: boolean;
  canViewEnterprise: boolean;
};

function hasPublicSubscription(status?: SubscriptionStatus | null) {
  return status === "trialing" || status === "active";
}

/**
 * Computes effective recipe visibility from canonical business rules.
 */
export function computeRecipeAccess(input: AccessInput): ComputedAccess {
  if (input.role === "owner") {
    return { canViewPublic: true, canViewEnterprise: true };
  }

  return {
    canViewPublic: hasPublicSubscription(input.subscriptionStatus),
    canViewEnterprise: Boolean(input.enterpriseGranted),
  };
}
