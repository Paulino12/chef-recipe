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
  ],
});
