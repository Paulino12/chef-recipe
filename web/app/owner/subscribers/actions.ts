"use server";

import { revalidatePath } from "next/cache";

import { getInternalApiOrigin } from "@/lib/api/origin";
import { getForwardAuthHeaders } from "@/lib/api/serverSession";
import { SubscriptionStatus } from "@/lib/api/access";

type ActionKind = "grant-enterprise" | "revoke-enterprise";

async function updateEnterpriseAccess(formData: FormData, action: ActionKind) {
  const userId = String(formData.get("userId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) throw new Error("Missing userId");

  // Forward auth so API can enforce role=owner and attach actor id in audit log.
  const authHeaders = await getForwardAuthHeaders();

  const endpoint = new URL(
    `/api/admin/subscribers/${encodeURIComponent(userId)}/${action}`,
    getInternalApiOrigin(),
  ).toString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
      ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
    },
    cache: "no-store",
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    let message = `request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  // Refresh table after grant/revoke.
  revalidatePath("/owner/subscribers");
}

export async function grantEnterpriseAction(formData: FormData) {
  return updateEnterpriseAccess(formData, "grant-enterprise");
}

export async function revokeEnterpriseAction(formData: FormData) {
  return updateEnterpriseAccess(formData, "revoke-enterprise");
}

const VALID_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

export async function setSubscriptionStatusAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as SubscriptionStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) throw new Error("Missing userId");
  if (!VALID_STATUSES.has(status)) throw new Error("Invalid status");

  const authHeaders = await getForwardAuthHeaders();
  const endpoint = new URL(
    `/api/admin/subscribers/${encodeURIComponent(userId)}/set-subscription-status`,
    getInternalApiOrigin(),
  ).toString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
      ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
    },
    cache: "no-store",
    body: JSON.stringify({ status, reason }),
  });

  if (!response.ok) {
    let message = `request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  revalidatePath("/owner/subscribers");
}
