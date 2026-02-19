/**
 * Cookie-backed favorite storage used as a resilience layer while DB-backed
 * favorites are being rolled out. This keeps UX responsive even if the
 * `user_recipe_favorites` table is not available yet.
 */
const FAVORITES_COOKIE_NAME = "recipe_favorites";
const MAX_FAVORITES = 200;

type ReadCookieStore = {
  get: (name: string) => { value: string } | undefined;
};

type WriteCookieStore = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      sameSite: "lax";
      secure: boolean;
      path: string;
      maxAge: number;
    },
  ) => void;
};

function normalizeRecipeIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, MAX_FAVORITES);
}

function decodeFavoriteCookieValue(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return [];
    return normalizeRecipeIds(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return [];
  }
}

function encodeFavoriteCookieValue(recipeIds: string[]) {
  return encodeURIComponent(JSON.stringify(normalizeRecipeIds(recipeIds)));
}

export function getFavoriteIdsFromCookieStore(
  cookieStore: ReadCookieStore,
) {
  const raw = cookieStore.get(FAVORITES_COOKIE_NAME)?.value;
  return new Set<string>(decodeFavoriteCookieValue(raw));
}

export function setFavoriteIdsCookie(
  cookieStore: WriteCookieStore,
  recipeIds: string[],
) {
  // Keep one-year retention to preserve user favorites across sessions.
  const value = encodeFavoriteCookieValue(recipeIds);
  cookieStore.set(FAVORITES_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
