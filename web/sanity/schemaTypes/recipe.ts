import { defineField, defineType } from "sanity";

import { apiVersion } from "../env";
import { RecipeCategoryPathInput } from "../components/recipe-category-path-input";
import { fetchNextRecipeNumber, hasDuplicateRecipeNumber } from "../lib/recipeMetadata";

const WORKFLOW_STATUS_OPTIONS = [
  { title: "Intake", value: "intake" },
  { title: "In review", value: "review" },
  { title: "Approved", value: "approved" },
  { title: "Live", value: "live" },
  { title: "Archived", value: "archived" },
] as const;

const WORKFLOW_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  WORKFLOW_STATUS_OPTIONS.map((option) => [option.value, option.title]),
);

const SOURCE_TYPE_OPTIONS = [
  { title: "Manual entry", value: "manual" },
  { title: "Imported PDF", value: "pdf_import" },
  { title: "Legacy dataset", value: "legacy_dataset" },
  { title: "Chef submission", value: "chef_submission" },
  { title: "Adapted recipe", value: "adapted" },
] as const;

/**
 * Recipe document schema used by both Dining and Hospitality umbrellas.
 * Dining remains the implicit fallback for older documents that predate the
 * collection field.
 *
 * Workflow metadata is intentionally additive so the same recipe document
 * continues to power both the web and mobile consumers without API changes.
 */
export const recipe = defineType({
  preview: {
    select: {
      title: "title",
      plu: "pluNumber",
      collection: "collection",
      workflowStatus: "workflowStatus",
      pub: "visibility.public",
      ent: "visibility.enterprise",
      media: "image",
    },
    prepare({ title, plu, collection, workflowStatus, pub, ent, media }) {
      const workflowLabel = WORKFLOW_STATUS_LABELS[workflowStatus] ?? "Intake";
      const tags = [workflowLabel, pub ? "PUBLIC" : null, ent ? "ENTERPRISE" : null].filter(Boolean);

      return {
        title,
        subtitle: `${collection || "Dining"} | RN ${plu}${tags.length ? " • " + tags.join(" • ") : ""}`,
        media,
      };
    },
  },
  name: "recipe",
  title: "Recipe",
  type: "document",
  groups: [
    { name: "basics", title: "Basics", default: true },
    { name: "content", title: "Method & ingredients" },
    { name: "nutrition", title: "Nutrition" },
    { name: "publishing", title: "Publishing" },
    { name: "workflow", title: "Workflow" },
    { name: "source", title: "Source" },
  ],
  initialValue: {
    collection: "Dining",
    workflowStatus: "intake",
    sourceType: "manual",
    visibility: {
      public: false,
      enterprise: false,
    },
  },
  fields: [
    defineField({
      name: "pluNumber",
      title: "RN (Recipe Number)",
      type: "number",
      group: "basics",
      description: "Prefills with the next available RN in the current 12xxxxxx sequence.",
      initialValue: async (_, context) => fetchNextRecipeNumber(context.getClient({ apiVersion })),
      validation: (Rule) =>
        Rule.required()
          .integer()
          .positive()
          .custom(async (value, context) => {
            if (typeof value !== "number") return true;

            const hasDuplicate = await hasDuplicateRecipeNumber(
              context.getClient({ apiVersion }),
              value,
              typeof context.document?._id === "string" ? context.document._id : undefined,
            );

            return hasDuplicate ? "This RN is already in use by another recipe." : true;
          }),
    }),
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "basics",
      validation: (R) => R.required(),
    }),
    defineField({
      name: "collection",
      title: "Collection",
      type: "string",
      group: "basics",
      description: "Top-level umbrella for recipe browsing and admin filtering.",
      options: {
        list: [
          { title: "Dining", value: "Dining" },
          { title: "Hospitality", value: "Hospitality" },
        ],
        layout: "radio",
      },
      validation: (R) => R.required(),
    }),
    defineField({
      name: "categoryPath",
      title: "Category path",
      type: "array",
      group: "basics",
      description: "Choose an existing category path when possible to avoid duplicates.",
      of: [{ type: "string" }],
      components: {
        input: RecipeCategoryPathInput,
      },
    }),
    defineField({
      name: "portions",
      title: "Portions",
      type: "number",
      group: "basics",
    }),
    defineField({
      name: "workflowStatus",
      title: "Workflow status",
      type: "string",
      group: "workflow",
      description: "Editorial stage for moving a recipe from intake to live release.",
      options: {
        list: [...WORKFLOW_STATUS_OPTIONS],
        layout: "radio",
      },
    }),
    defineField({
      name: "sourceType",
      title: "Source type",
      type: "string",
      group: "workflow",
      description: "How this recipe entered the system.",
      options: {
        list: [...SOURCE_TYPE_OPTIONS],
      },
    }),
    defineField({
      name: "editorialNotes",
      title: "Editorial notes",
      type: "text",
      group: "workflow",
      rows: 4,
      description: "Internal notes for missing fields, launch concerns, or review comments.",
    }),
    defineField({
      name: "image",
      title: "Recipe image",
      type: "image",
      group: "publishing",
      options: { hotspot: true },
      description:
        "Optional uploaded image. If empty, the app falls back to Image URL and then placeholder.",
    }),
    defineField({
      name: "imageUrl",
      title: "Image URL (fallback)",
      type: "string",
      group: "publishing",
      description:
        "Fallback image URL/path used when no uploaded image is set (supports /recipe-placeholder.svg).",
    }),
    defineField({
      name: "ingredients",
      title: "Ingredients",
      type: "array",
      group: "content",
      of: [{ type: "ingredientLine" }],
    }),
    defineField({
      name: "method",
      title: "Method",
      type: "array",
      group: "content",
      of: [
        {
          type: "block",
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
      group: "content",
      readOnly: true,
    }),
    defineField({
      name: "allergens",
      title: "Allergens (UK14)",
      type: "object",
      group: "content",
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
      group: "nutrition",
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
      group: "publishing",
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
      group: "source",
      fields: [defineField({ name: "pdfPath", type: "string", readOnly: true })],
    }),
  ],
});
