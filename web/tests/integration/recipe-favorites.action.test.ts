import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  cookies: vi.fn(),
  getFavoriteIdsFromCookieStore: vi.fn(),
  setFavoriteIdsCookie: vi.fn(),
  addRecipeFavorite: vi.fn(),
  removeRecipeFavorite: vi.fn(),
  getServerAccessSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/api/favoriteCookie", () => ({
  getFavoriteIdsFromCookieStore: mocks.getFavoriteIdsFromCookieStore,
  setFavoriteIdsCookie: mocks.setFavoriteIdsCookie,
}));

vi.mock("@/lib/api/favorites", () => ({
  addRecipeFavorite: mocks.addRecipeFavorite,
  removeRecipeFavorite: mocks.removeRecipeFavorite,
}));

vi.mock("@/lib/api/serverSession", () => ({
  getServerAccessSession: mocks.getServerAccessSession,
}));

import { setRecipeFavoriteAction } from "@/app/recipes/actions";

describe("setRecipeFavoriteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated users", async () => {
    mocks.getServerAccessSession.mockResolvedValueOnce(null);

    const payload = new FormData();
    payload.set("recipeId", "recipe-1");
    payload.set("value", "true");

    await expect(setRecipeFavoriteAction(payload)).rejects.toThrow("Unauthorized");
  });

  it("writes favorite to db and cookie, then revalidates recipes", async () => {
    const cookieStore = { set: vi.fn(), get: vi.fn() };

    mocks.getServerAccessSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.cookies.mockResolvedValueOnce(cookieStore);
    mocks.getFavoriteIdsFromCookieStore.mockReturnValueOnce(new Set<string>(["recipe-0"]));

    const payload = new FormData();
    payload.set("recipeId", "recipe-2");
    payload.set("value", "true");

    await setRecipeFavoriteAction(payload);

    expect(mocks.addRecipeFavorite).toHaveBeenCalledWith("user-1", "recipe-2");
    expect(mocks.setFavoriteIdsCookie).toHaveBeenCalledWith(
      cookieStore,
      expect.arrayContaining(["recipe-0", "recipe-2"]),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recipes/recipe-2");
  });

  it("removes favorite from db and cookie", async () => {
    const cookieStore = { set: vi.fn(), get: vi.fn() };

    mocks.getServerAccessSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.cookies.mockResolvedValueOnce(cookieStore);
    mocks.getFavoriteIdsFromCookieStore.mockReturnValueOnce(new Set<string>(["recipe-2", "recipe-3"]));

    const payload = new FormData();
    payload.set("recipeId", "recipe-2");
    payload.set("value", "false");

    await setRecipeFavoriteAction(payload);

    expect(mocks.removeRecipeFavorite).toHaveBeenCalledWith("user-1", "recipe-2");
    expect(mocks.setFavoriteIdsCookie).toHaveBeenCalledWith(cookieStore, ["recipe-3"]);
  });
});
