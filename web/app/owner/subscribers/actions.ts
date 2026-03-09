"use server";

import { revalidatePath } from "next/cache";

import { getInternalApiOrigin } from "@/lib/api/origin";
import { getForwardAuthHeaders } from "@/lib/api/serverSession";

type EnterpriseActionKind = "grant-enterprise" | "revoke-enterprise";
type SubscriptionStatusActionKind = "trialing" | "expired";

async function parseResponseError(response: Response) {
  let message = `request failed (${response.status})`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim()) {
      message = payload.error;
    }
  } catch {
    // Keep fallback message.
  }
  return message;
}

async function updateEnterpriseAccess(formData: FormData, action: EnterpriseActionKind) {
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
    throw new Error(await parseResponseError(response));
  }

  // Refresh table after grant/revoke.
  revalidatePath("/owner/subscribers");
}

async function updateSubscriptionStatus(
  formData: FormData,
  status: SubscriptionStatusActionKind,
) {
  const userId = String(formData.get("userId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) throw new Error("Missing userId");

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
    throw new Error(await parseResponseError(response));
  }

  revalidatePath("/owner/subscribers");
  revalidatePath("/recipes");
  revalidatePath("/profile");
}

async function deleteSubscriberAccount(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) throw new Error("Missing userId");

  const authHeaders = await getForwardAuthHeaders();
  const endpoint = new URL(
    `/api/admin/subscribers/${encodeURIComponent(userId)}`,
    getInternalApiOrigin(),
  ).toString();

  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
      ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
    },
    cache: "no-store",
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }

  revalidatePath("/owner/subscribers");
}

export async function grantEnterpriseAction(formData: FormData) {
  return updateEnterpriseAccess(formData, "grant-enterprise");
}

export async function revokeEnterpriseAction(formData: FormData) {
  return updateEnterpriseAccess(formData, "revoke-enterprise");
}

export async function restoreSubscriberAccessAction(formData: FormData) {
  return updateSubscriptionStatus(formData, "trialing");
}

export async function suspendSubscriberAccessAction(formData: FormData) {
  return updateSubscriptionStatus(formData, "expired");
}

export async function deleteSubscriberAction(formData: FormData) {
  return deleteSubscriberAccount(formData);
}
