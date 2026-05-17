import { defineType, defineField } from "sanity";

/**
 * One bullet line for ingredients.
 * We store both display text + optional structured parts.
 */
export const ingredientLine = defineType({
  name: "ingredientLine",
  title: "Ingredient line",
  type: "object",
  fields: [
    defineField({
      name: "text",
      title: "Text",
      type: "string",
      validation: (R) => R.required(),
    }),
    defineField({ name: "qty", title: "Qty", type: "number" }),
    defineField({ name: "unit", title: "Unit", type: "string" }),
    defineField({ name: "item", title: "Item", type: "string" }),
    defineField({
      name: "subRecipe",
      title: "Sub-recipe",
      type: "reference",
      to: [{ type: "recipe" }],
      description:
        "Optional: select an existing recipe when this ingredient line uses another recipe.",
      options: {
        disableNew: true,
        filter: ({ document }) => {
          const rawId = typeof document?._id === "string" ? document._id : "";
          const publishedId = rawId.replace(/^drafts\./, "");
          return {
            filter: "!(_id in [$publishedId, $draftId])",
            params: {
              publishedId,
              draftId: publishedId ? `drafts.${publishedId}` : "",
            },
          };
        },
      },
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (!value || typeof value !== "object" || !("_ref" in value)) return true;
          const ref = typeof value._ref === "string" ? value._ref.replace(/^drafts\./, "") : "";
          const documentId =
            typeof context.document?._id === "string"
              ? context.document._id.replace(/^drafts\./, "")
              : "";
          return ref && documentId && ref === documentId
            ? "A recipe cannot use itself as a sub-recipe."
            : true;
        }),
    }),
  ],
});
