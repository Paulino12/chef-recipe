import { AppRole, SubscriptionStatus } from "./access";

export type UserProfile = {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: AppRole;
  };
  entitlements: {
    subscription_status: SubscriptionStatus | null;
    enterprise_granted: boolean;
  };
};

export type UpdateProfileResponse = {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: AppRole;
  };
  updated_at: string | null;
};

export type PasswordResetResponse = {
  ok: boolean;
  message: string;
};
