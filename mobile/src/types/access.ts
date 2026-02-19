export type AppRole = "owner" | "subscriber";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type AccessSession = {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: AppRole;
  };
  entitlements: {
    subscription_status: SubscriptionStatus | null;
    enterprise_granted: boolean;
    can_view_public: boolean;
    can_view_enterprise: boolean;
  };
  computed_at: string;
};
