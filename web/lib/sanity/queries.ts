export const RECIPES_LIST_QUERY = `
  *[_type == "recipe"] | order(title asc, _id asc) {
    "id": _id,
    pluNumber,
    title,
    categoryPath,
    portions,
    ingredients[]{text, qty, unit, item},
    method,
    allergens,
    nutrition,
    visibility
  }
`;

export const RECIPE_BY_ID_QUERY = `
  *[_type == "recipe" && _id == $id][0] {
    "id": _id,
    pluNumber,
    title,
    categoryPath,
    portions,
    ingredients[]{text, qty, unit, item},
    method,
    allergens,
    nutrition,
    visibility
  }
`;
