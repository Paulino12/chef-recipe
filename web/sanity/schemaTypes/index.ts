/**
 * Schema type registry.
 * If imports here are wrong/missing, Studio won’t boot.
 */
import { ingredientLine } from "./ingredientLine";
import { recipe } from "./recipe";

export const schemaTypes = [recipe, ingredientLine];
