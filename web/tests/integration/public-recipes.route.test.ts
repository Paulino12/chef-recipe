import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePublicApiAccess: vi.fn(),
  listPublicApiRecipes: vi.fn(),
  getPublicApiRecipeById: vi.fn(),
  listPublicApiCategories: vi.fn(),
  listPublicApiCollections: vi.fn(),
}));

vi.mock("@/lib/api/public/auth", () => ({
  requirePublicApiAccess: mocks.requirePublicApiAccess,
}));

vi.mock("@/lib/api/public/recipes", async () => {
  return {
    PUBLIC_API_DEFAULT_PAGE_SIZE: 20,
    PUBLIC_API_MAX_PAGE_SIZE: 50,
    PUBLIC_API_LIST_CACHE_CONTROL: "public, s-maxage=60, stale-while-revalidate=86400",
    PUBLIC_API_DETAIL_CACHE_CONTROL: "public, s-maxage=300, stale-while-revalidate=86400",
    PUBLIC_API_METADATA_CACHE_CONTROL: "public, s-maxage=3600, stale-while-revalidate=86400",
    listPublicApiRecipes: mocks.listPublicApiRecipes,
    getPublicApiRecipeById: mocks.getPublicApiRecipeById,
    listPublicApiCategories: mocks.listPublicApiCategories,
    listPublicApiCollections: mocks.listPublicApiCollections,
  };
});

import { GET as getCategories } from "@/app/api/public/v1/categories/route";
import { GET as getCollections } from "@/app/api/public/v1/collections/route";
import { GET as getHealth } from "@/app/api/public/v1/health/route";
import { GET as getRecipeDetail } from "@/app/api/public/v1/recipes/[id]/route";
import { GET as getRecipeList } from "@/app/api/public/v1/recipes/route";

describe("public recipe API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePublicApiAccess.mockReturnValue({ ok: true });
  });

  it("returns 401 when public API access is denied", async () => {
    mocks.requirePublicApiAccess.mockReturnValueOnce({
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Invalid API gateway secret",
    });

    const response = await getRecipeList(
      new NextRequest("http://localhost:3000/api/public/v1/recipes"),
    );
    const body = (await response.json()) as {
      error: { code: string; message: string; request_id: string };
    };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Invalid API gateway secret");
  });

  it("returns paginated public recipe data", async () => {
    mocks.listPublicApiRecipes.mockResolvedValueOnce({
      data: [
        {
          id: "rn_12086068",
          rn: 12086068,
          title: "Lemon Drizzle Cake",
          collection: "Dining",
          category_path: ["Desserts", "Cakes"],
          image_url: "/recipe-placeholder.svg",
          portions: 12,
          allergens: { gluten: "contains" },
          nutrition_summary: {
            kcal_per_serving: 320,
            fat_g: 14,
            sugars_g: 20,
            salt_g: 0.3,
          },
          updated_at: "2026-03-03T12:00:00.000Z",
        },
      ],
      pagination: {
        page: 1,
        page_size: 20,
        total: 1,
        total_pages: 1,
      },
    });

    const response = await getRecipeList(
      new NextRequest(
        "http://localhost:3000/api/public/v1/recipes?collection=Dining&page=1&page_size=20",
      ),
    );
    const body = (await response.json()) as {
      data: Array<{ id: string; rn: number }>;
      pagination: { total: number };
      request_id: string;
    };

    expect(response.status).toBe(200);
    expect(mocks.listPublicApiRecipes).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "Dining",
        page: 1,
        pageSize: 20,
      }),
    );
    expect(body.data[0]).toMatchObject({
      id: "rn_12086068",
      rn: 12086068,
    });
    expect(body.pagination.total).toBe(1);
    expect(typeof body.request_id).toBe("string");
  });

  it("rejects invalid public recipe ids", async () => {
    const response = await getRecipeDetail(
      new NextRequest("http://localhost:3000/api/public/v1/recipes/not-an-rn"),
      { params: Promise.resolve({ id: "not-an-rn" }) },
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_recipe_id");
  });

  it("returns 404 when a public recipe does not exist", async () => {
    mocks.getPublicApiRecipeById.mockResolvedValueOnce(null);

    const response = await getRecipeDetail(
      new NextRequest("http://localhost:3000/api/public/v1/recipes/rn_12086068"),
      { params: Promise.resolve({ id: "rn_12086068" }) },
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("Recipe not found");
  });

  it("returns metadata endpoints without touching internal APIs", async () => {
    mocks.listPublicApiCategories.mockResolvedValueOnce([
      { value: "Desserts", count: 8 },
    ]);
    mocks.listPublicApiCollections.mockResolvedValueOnce([
      { value: "Dining", count: 20 },
      { value: "Hospitality", count: 4 },
    ]);

    const categoriesResponse = await getCategories(
      new NextRequest("http://localhost:3000/api/public/v1/categories"),
    );
    const collectionsResponse = await getCollections(
      new NextRequest("http://localhost:3000/api/public/v1/collections"),
    );
    const categoriesBody = (await categoriesResponse.json()) as {
      data: Array<{ value: string; count: number }>;
    };
    const collectionsBody = (await collectionsResponse.json()) as {
      data: Array<{ value: string; count: number }>;
    };

    expect(categoriesResponse.status).toBe(200);
    expect(collectionsResponse.status).toBe(200);
    expect(categoriesBody.data).toEqual([{ value: "Desserts", count: 8 }]);
    expect(collectionsBody.data).toEqual([
      { value: "Dining", count: 20 },
      { value: "Hospitality", count: 4 },
    ]);
  });

  it("returns a simple health response", async () => {
    const response = await getHealth();
    const body = (await response.json()) as {
      data: { ok: boolean; version: string };
      request_id: string;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ ok: true, version: "v1" });
    expect(typeof body.request_id).toBe("string");
  });
});
