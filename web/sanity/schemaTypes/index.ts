import type { SchemaTypeDefinition } from "sanity";

import { ingredientLine } from "./ingredientLine";
import { recipe } from "./recipe";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [recipe, ingredientLine],
};
