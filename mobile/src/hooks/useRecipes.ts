import { useCallback, useEffect, useState } from "react";
import { fetchRecipes } from "../services/recipesApi";
import { Audience, RecipeListItem } from "../types/recipe";

type UseRecipesState = {
  data: RecipeListItem[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
};

export function useRecipes(
  audience: Audience,
  query: string,
  accessToken: string | null,
  enabled = true,
): UseRecipesState {
  const [data, setData] = useState<RecipeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!enabled || !accessToken) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    // Keep UI state deterministic whenever audience/search changes.
    setIsLoading(true);
    setError(null);

    fetchRecipes(audience, query, accessToken, controller.signal)
      .then((recipes) => {
        if (!active) return;
        setData(recipes);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load recipes";
        setError(message);
        setData([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [audience, query, refreshToken, accessToken, enabled]);

  const reload = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { data, isLoading, error, reload };
}
