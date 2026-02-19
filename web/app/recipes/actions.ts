"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getFavoriteIdsFromCookieStore, setFavoriteIdsCookie } from "@/lib/api/favoriteCookie";
import { addRecipeFavorite, removeRecipeFavorite } from "@/lib/api/favorites";
import { getServerAccessSession } from "@/lib/api/serverSession";

function parseFavoriteValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("Invalid favorite value");
}

export async function setRecipeFavoriteAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const recipeId = String(formData.get("recipeId") ?? "").trim();
  if (!recipeId) {
    throw new Error("Missing recipe id");
  }

  const cookieStore = await cookies();
  const cookieFavoriteIds = getFavoriteIdsFromCookieStore(cookieStore);
  const isFavorite = parseFavoriteValue(formData.get("value"));

  // Dual-write strategy:
  // 1) Persist in DB when available
  // 2) Always mirror in cookie for immediate UX and migration fallback
  if (isFavorite) {
    await addRecipeFavorite(session.user.id, recipeId);
    cookieFavoriteIds.add(recipeId);
  } else {
    await removeRecipeFavorite(session.user.id, recipeId);
    cookieFavoriteIds.delete(recipeId);
  }
  setFavoriteIdsCookie(cookieStore, [...cookieFavoriteIds]);

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
}
