export type Audience = "public" | "enterprise";

export type RecipeListItem = {
  id: string;
  pluNumber: number;
  title: string;
  categoryPath: string[];
  portions: number | null;
  portionNetWeightG: number | null;
};

export type RecipeIngredient = {
  text: string;
  qty: number | null;
  unit: string | null;
  item: string | null;
};

export type MethodBlock = {
  _type?: string;
  listItem?: string;
  level?: number;
  children?: Array<{ _type?: string; text?: string }>;
};

export type RecipeDetail = {
  id: string;
  pluNumber: number;
  title: string;
  categoryPath: string[];
  portions: number | null;
  ingredients: RecipeIngredient[];
  method: MethodBlock[];
  allergens: Record<string, string>;
  nutrition: {
    portionNetWeightG: number | null;
  };
  visibility: {
    public: boolean;
    enterprise: boolean;
  };
};
