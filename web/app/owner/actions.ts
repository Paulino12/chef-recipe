"use server";

import { revalidatePath } from "next/cache";

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

async function applyVisibility(input: { id: string; audience: AdminAudience; value: boolean }) {
  const adminApiKey = getAdminApiKey();
  const endpoint = new URL("/api/admin/recipes", getInternalApiOrigin()).toString();

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-api-key": adminApiKey,
    },
    cache: "no-store",
    body: JSON.stringify({
      id: input.id,
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

  if (!id) throw new Error("Missing recipe id");
  await applyVisibility({ id, audience, value });

  // Keep owner and public pages in sync after a visibility toggle.
  revalidatePath("/");
  revalidatePath("/owner");
}

export async function setPageVisibilityAction(formData: FormData) {
  const idsRaw = String(formData.get("ids") ?? "").trim();
  const audience = parseAudience(String(formData.get("audience") ?? "").trim());
  const value = parseValue(String(formData.get("value") ?? "").trim());

  const ids = [...new Set(idsRaw.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("No recipes in current page to update.");

  const failures: Array<{ id: string; reason: string }> = [];
  for (const id of ids) {
    try {
      await applyVisibility({ id, audience, value });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      failures.push({ id, reason });
    }
  }

  if (failures.length) {
    const first = failures[0];
    throw new Error(
      `Bulk update partially failed (${failures.length}/${ids.length}). First failure: ${first.id} -> ${first.reason}`,
    );
  }

  // Keep owner and public pages in sync after a visibility toggle.
  revalidatePath("/");
  revalidatePath("/owner");
}
