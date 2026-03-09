import { SubscriptionStatus } from "@/lib/api/access";

export function isBillingUiEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_BILLING_UI?.trim() === "true";
}

export function formatAccessStatusLabel(status: SubscriptionStatus | null) {
  switch (status) {
    case "trialing":
      return "Pre-billing access";
    case "active":
      return "Active access";
    case "past_due":
      return "Payment issue";
    case "paused":
      return "Paused";
    case "canceled":
      return "Canceled";
    case "expired":
      return "Expired";
    default:
      return "No access";
  }
}
