import { headers } from "next/headers";

import { AppRole, SubscriptionStatus } from "@/lib/api/access";
import { getInternalApiOrigin } from "@/lib/api/origin";

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

export type ForwardAuthHeaders = {
  cookie?: string;
  authorization?: string;
};

/**
 * Read incoming auth headers in a server component/action and forward them
 * when calling internal API routes.
 */
export async function getForwardAuthHeaders(): Promise<ForwardAuthHeaders> {
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const authorization = incoming.get("authorization") ?? "";

  return {
    cookie: cookie || undefined,
    authorization: authorization || undefined,
  };
}

/**
 * Server-side helper used by pages to resolve the current access session.
 * This calls `/api/me/access` so all pages share the same auth/role logic.
 */
export async function getServerAccessSession(): Promise<AccessSession | null> {
  const authHeaders = await getForwardAuthHeaders();
  const url = new URL("/api/me/access", getInternalApiOrigin());

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
      ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
    },
  });

  if (!response.ok) return null;

  return (await response.json()) as AccessSession;
}
