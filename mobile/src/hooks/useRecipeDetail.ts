import { useEffect, useMemo, useState } from "react";
import { fetchRecipeById } from "../services/recipesApi";
import { Audience, RecipeDetail } from "../types/recipe";

type UseRecipeDetailState = {
  data: RecipeDetail | null;
  isLoading: boolean;
  error: string | null;
};

export function useRecipeDetail(
  recipeId: string | null,
  audience: Audience,
): UseRecipeDetailState {
  const [data, setData] = useState<RecipeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipeId) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setError(null);

    fetchRecipeById(recipeId, audience, controller.signal)
      .then((recipe) => {
        if (!active) return;
        setData(recipe);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load recipe detail";
        setError(message);
        setData(null);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [recipeId, audience]);

  return useMemo(() => ({ data, isLoading, error }), [data, isLoading, error]);
}
