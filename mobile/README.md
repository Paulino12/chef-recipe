# Recipes Platform iOS App

This folder contains an Expo + React Native app focused on one goal:
show recipes by audience (`public` or `enterprise`) based on visibility you control in the web owner dashboard.

Authentication/subscription is intentionally not implemented yet.

## 1) What this app does

- Loads recipes from the existing web API.
- Lets the user switch between `Public` and `Enterprise` audience.
- Shows only recipes whose visibility for that audience is `true`.
- Opens a detailed recipe view with ingredients, method, allergens, and visibility metadata.

## 2) How owner dashboard control flows into mobile

1. In web owner dashboard, you toggle recipe visibility (public/enterprise).
2. Web app updates Sanity `recipe.visibility.public` and `recipe.visibility.enterprise`.
3. Mobile calls:
   - `GET /api/recipes?audience=public|enterprise&q=...`
   - `GET /api/recipes/:id?audience=public|enterprise`
4. These endpoints only return recipes where `visibility.<audience> == true`.
5. Result: your web dashboard controls exactly what appears in the mobile app.

## 3) Project structure

```txt
mobile/
  App.tsx
  src/
    components/
      AudienceSelector.tsx
      RecipeCard.tsx
      RecipeDetailModal.tsx
      SectionCard.tsx
      StatePanel.tsx
    config/
      env.ts
    hooks/
      useDebouncedValue.ts
      useRecipeDetail.ts
      useRecipes.ts
    lib/
      formatters.ts
      http.ts
      recipeMapper.ts
    screens/
      RecipeExplorerScreen.tsx
    services/
      recipesApi.ts
    theme/
      tokens.ts
    types/
      recipe.ts
```

## 4) Architecture notes (learning-friendly)

- `types/`: domain models for compile-time safety.
- `services/`: API access only (no UI logic).
- `lib/`: pure helpers (mapping, formatting, HTTP).
- `hooks/`: async orchestration and state.
- `components/`: reusable UI blocks.
- `screens/`: page-level composition.

This split keeps code DRY:
- parsing/mapping happens once (`recipeMapper.ts`)
- API details stay in one place (`recipesApi.ts`)
- UI stays focused on rendering.

## 5) Environment setup

Copy `.env.example` to `.env` and set values:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_ENTERPRISE_API_KEY=
```

Notes:
- `EXPO_PUBLIC_API_BASE_URL` should point to the running web app.
- `EXPO_PUBLIC_ENTERPRISE_API_KEY` is optional. Use it only if you want enterprise feed access through current API gate.

## 6) Run locally

```bash
cd mobile
npm install
npm run ios
```

If you use a physical iPhone, make sure the API base URL is reachable from the phone network.

## 7) Next improvements (when ready)

- Real auth and audience assignment from backend identity (instead of local audience toggle).
- Subscription/paywall flow.
- Offline cache (e.g. persistent query cache).
- Favorite/save recipes.
- Pagination and richer filters.
