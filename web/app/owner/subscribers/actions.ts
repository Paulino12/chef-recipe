"use server";

import { revalidatePath } from "next/cache";

import { getInternalApiOrigin } from "@/lib/api/origin";
import { getForwardAuthHeaders } from "@/lib/api/serverSession";

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
