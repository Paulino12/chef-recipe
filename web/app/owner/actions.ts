"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_AUDIENCES, type AdminAudience } from "@/lib/api/adminRecipes";
import { getInternalApiOrigin } from "@/lib/api/origin";

export async function toggleVisibilityAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();

  if (!id) throw new Error("Missing recipe id");
  if (!ADMIN_AUDIENCES.includes(audience as AdminAudience)) {
    throw new Error('Invalid audience. Expected "public" or "enterprise".');
  }
  if (valueRaw !== "true" && valueRaw !== "false") {
    throw new Error('Invalid value. Expected "true" or "false".');
  }

  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw new Error("Missing server config: ADMIN_API_KEY not set");
  }

  const value = valueRaw === "true";
  const endpoint = new URL("/api/admin/recipes", getInternalApiOrigin()).toString();

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-api-key": adminApiKey,
    },
    cache: "no-store",
    body: JSON.stringify({ id, audience, value }),
  });

  if (!response.ok) {
    let reason = `request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) {
        reason = data.error;
      }
    } catch {
      // Ignore JSON parse errors and use status fallback.
    }
    throw new Error(reason);
  }

  // Keep owner and public pages in sync after a visibility toggle.
  revalidatePath("/");
  revalidatePath("/owner");
}
