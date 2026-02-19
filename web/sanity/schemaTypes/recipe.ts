import { defineType, defineField } from "sanity";

/**
 * Recipe document schema.
 * This matches your golden_samples_v3 shape.
 */
export const recipe = defineType({
  preview: {
    select: {
      title: "title",
      plu: "pluNumber",
      pub: "visibility.public",
      ent: "visibility.enterprise",
    },
    prepare({ title, plu, pub, ent }) {
      const tags = [pub ? "PUBLIC" : null, ent ? "ENTERPRISE" : null].filter(
        Boolean,
      );

      return {
        title,
        subtitle: `PLU ${plu}${tags.length ? " • " + tags.join(" + ") : ""}`,
      };
    },
  },
  name: "recipe",
  title: "Recipe",
  type: "document",
  fields: [
    defineField({
      name: "pluNumber",
      title: "PLU number",
      type: "number",
      validation: (R) => R.required().integer().positive(),
    }),
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "categoryPath",
      title: "Category path",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({ name: "portions", title: "Portions", type: "number" }),

    defineField({
      name: "ingredients",
      title: "Ingredients",
      type: "array",
      of: [{ type: "ingredientLine" }],
    }),

    defineField({
      name: "method",
      title: "Method",
      type: "array",
      of: [
        {
          type: "block",
          // allow numbered lists (what you want)
          lists: [
            { title: "Number", value: "number" },
            { title: "Bullet", value: "bullet" },
          ],
        },
      ],
    }),

    defineField({
      name: "methodText",
      title: "Method (plain)",
      type: "text",
      readOnly: true,
    }),

    defineField({
      name: "allergens",
      title: "Allergens (UK14)",
      type: "object",
      fields: [
        defineField({ name: "gluten", type: "string" }),
        defineField({ name: "crustaceans", type: "string" }),
        defineField({ name: "eggs", type: "string" }),
        defineField({ name: "fish", type: "string" }),
        defineField({ name: "peanuts", type: "string" }),
        defineField({ name: "soya", type: "string" }),
        defineField({ name: "milk", type: "string" }),
        defineField({ name: "nuts", type: "string" }),
        defineField({ name: "celery", type: "string" }),
        defineField({ name: "mustard", type: "string" }),
        defineField({ name: "sesame", type: "string" }),
        defineField({ name: "sulphites", type: "string" }),
        defineField({ name: "lupin", type: "string" }),
        defineField({ name: "molluscs", type: "string" }),
      ],
    }),

    defineField({
      name: "nutrition",
      title: "Nutrition",
      type: "object",
      fields: [
        defineField({
          name: "portionNetWeightG",
          title: "Portion net weight (g)",
          type: "number",
        }),
        defineField({
          name: "perServing",
          title: "Per serving",
          type: "object",
          fields: [
            defineField({ name: "energyKj", title: "Energy (kJ)", type: "number" }),
            defineField({ name: "energyKcal", title: "Energy (kcal)", type: "number" }),
            defineField({ name: "fatG", title: "Fat (g)", type: "number" }),
            defineField({ name: "saturatesG", title: "Saturates (g)", type: "number" }),
            defineField({ name: "sugarsG", title: "Sugars (g)", type: "number" }),
            defineField({ name: "saltG", title: "Salt (g)", type: "number" }),
          ],
        }),
        defineField({
          name: "per100g",
          title: "Per 100g",
          type: "object",
          fields: [
            defineField({ name: "energyKj", title: "Energy (kJ)", type: "number" }),
            defineField({ name: "energyKcal", title: "Energy (kcal)", type: "number" }),
          ],
        }),
        defineField({
          name: "riPercent",
          title: "RI %",
          type: "object",
          fields: [
            defineField({ name: "energy", title: "Energy (%)", type: "number" }),
            defineField({ name: "fat", title: "Fat (%)", type: "number" }),
            defineField({ name: "saturates", title: "Saturates (%)", type: "number" }),
            defineField({ name: "sugars", title: "Sugars (%)", type: "number" }),
            defineField({ name: "salt", title: "Salt (%)", type: "number" }),
          ],
        }),
      ],
    }),

    defineField({
      name: "visibility",
      title: "Publishing",
      type: "object",
      description: "Choose where this recipe appears.",
      fields: [
        defineField({
          name: "public",
          title: "Public app",
          type: "boolean",
          description: "Visible to paying public subscribers (iOS).",
          initialValue: false,
        }),
        defineField({
          name: "enterprise",
          title: "Enterprise app",
          type: "boolean",
          description: "Visible to your chefs (iOS).",
          initialValue: false,
        }),
      ],
    }),

    defineField({
      name: "source",
      title: "Source",
      type: "object",
      fields: [
        defineField({ name: "pdfPath", type: "string", readOnly: true }),
      ],
    }),
  ],
});
