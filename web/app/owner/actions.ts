"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ADMIN_AUDIENCES, type AdminAudience } from "@/lib/api/adminRecipes";
import { getInternalApiOrigin } from "@/lib/api/origin";

function parseAudience(raw: string) {
  if (!ADMIN_AUDIENCES.includes(raw as AdminAudience)) {
    throw new Error('Invalid audience. Expected "public" or "enterprise".');
  }
  return raw as AdminAudience;
}

function parseValue(raw: string) {
  if (raw !== "true" && raw !== "false") {
    throw new Error('Invalid value. Expected "true" or "false".');
  }
  return raw === "true";
}

function getAdminApiKey() {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw new Error("Missing server config: ADMIN_API_KEY not set");
  }
  return adminApiKey;
}

function parseReturnTo(raw: string) {
  const value = raw.trim();
  if (!value) return "/owner";
  if (!value.startsWith("/")) return "/owner";
  if (value.startsWith("//")) return "/owner";
  return value;
}

async function applyVisibility(input: {
  ids: string[];
  audience: AdminAudience;
  value: boolean;
}) {
  const adminApiKey = getAdminApiKey();
  const endpoint = new URL("/api/admin/recipes", getInternalApiOrigin()).toString();

  const uniqueIds = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) throw new Error("Missing recipe id");

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-api-key": adminApiKey,
    },
    cache: "no-store",
    body: JSON.stringify({
      ids: uniqueIds,
      audience: input.audience,
      value: input.value,
    }),
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
}

export async function toggleVisibilityAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const audience = parseAudience(String(formData.get("audience") ?? "").trim());
  const value = parseValue(String(formData.get("value") ?? "").trim());
  const returnTo = parseReturnTo(String(formData.get("returnTo") ?? ""));

  if (!id) throw new Error("Missing recipe id");
  await applyVisibility({ ids: [id], audience, value });

  // Keep owner and public pages in sync after a visibility toggle.
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/recipes");
  redirect(returnTo);
}

export async function setPageVisibilityAction(formData: FormData) {
  const idsRaw = String(formData.get("ids") ?? "").trim();
  const audience = parseAudience(String(formData.get("audience") ?? "").trim());
  const value = parseValue(String(formData.get("value") ?? "").trim());
  const returnTo = parseReturnTo(String(formData.get("returnTo") ?? ""));

  const ids = [...new Set(idsRaw.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("No recipes in current page to update.");
  await applyVisibility({ ids, audience, value });

  // Keep owner and public pages in sync after a visibility toggle.
  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/recipes");
  redirect(returnTo);
}
