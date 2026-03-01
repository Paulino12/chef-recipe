import type { StructureResolver } from "sanity/structure";

const RECIPE_TYPE = "recipe";

const defaultOrdering = [
  { field: "_updatedAt", direction: "desc" as const },
  { field: "title", direction: "asc" as const },
];

export const structure: StructureResolver = (S) => {
  const recipeList = (
    title: string,
    filter: string,
    params: Record<string, string> = {},
  ) =>
    S.documentList()
      .title(title)
      .schemaType(RECIPE_TYPE)
      .filter(`_type == "${RECIPE_TYPE}" && ${filter}`)
      .params(params)
      .defaultOrdering(defaultOrdering);

  return S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Recipe workflow")
        .child(
          S.list()
            .title("Recipe workflow")
            .items([
              S.listItem()
                .title("New intake")
                .child(recipeList("New intake", 'coalesce(workflowStatus, "intake") == "intake"')),
              S.listItem()
                .title("In review")
                .child(recipeList("In review", 'workflowStatus == "review"')),
              S.listItem()
                .title("Approved to publish")
                .child(recipeList("Approved to publish", 'workflowStatus == "approved"')),
              S.listItem()
                .title("Live recipes")
                .child(recipeList("Live recipes", 'workflowStatus == "live"')),
              S.listItem()
                .title("Needs image")
                .child(
                  recipeList(
                    "Needs image",
                    '(!defined(image.asset) && (!defined(imageUrl) || imageUrl == "" || imageUrl == "/recipe-placeholder.svg"))',
                  ),
                ),
              S.listItem()
                .title("Archived")
                .child(recipeList("Archived", 'workflowStatus == "archived"')),
            ]),
        ),
      S.listItem()
        .title("Collections")
        .child(
          S.list()
            .title("Collections")
            .items([
              S.listItem()
                .title("Dining")
                .child(recipeList("Dining", 'coalesce(collection, "Dining") == $collection', { collection: "Dining" })),
              S.listItem()
                .title("Hospitality")
                .child(
                  recipeList('Hospitality', 'coalesce(collection, "Dining") == $collection', {
                    collection: "Hospitality",
                  }),
                ),
            ]),
        ),
      S.listItem().title("All recipes").child(recipeList("All recipes", "true")),
    ]);
};
