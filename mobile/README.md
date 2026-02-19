# Recipes Platform iOS App

Expo + React Native app for subscriber recipe access.

## What is implemented now

- In-app sign in and sign up (Supabase email/password)
- Access session fetch from web API (`GET /api/me/access`)
- In-app profile screen (`display_name`, email view, password reset email trigger)
- RevenueCat purchase + restore controls from profile (iOS)
- Recipe feed access is gated by entitlements:
  - `can_view_public`
  - `can_view_enterprise`
- Signed-in users can refresh entitlements and sign out
- Recipe list and detail require authenticated API calls (Bearer token)

## Current subscription behavior

This app now reflects backend subscription/entitlement state.
It does **not** process Apple in-app purchases yet.

Practical meaning:
- If subscription status is `trialing` or `active`, public recipes are available.
- If owner granted enterprise access, enterprise recipes are available.
- If neither is available, app shows a subscription-required state and lets user refresh access.

## Environment setup

Create `mobile/.env` from `.env.example`:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
# RevenueCat iOS setup
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_PUBLIC_ENTITLEMENT_ID=
# optional for legacy enterprise-key API setups
EXPO_PUBLIC_ENTERPRISE_API_KEY=
```

Notes:
- `EXPO_PUBLIC_API_BASE_URL` must point to your running web app.
- On a physical iPhone, use a LAN URL reachable from the phone.
- RevenueCat requires a development build (not plain Expo Go).

## Run

```bash
cd mobile
npm install
npm run ios
```

## Code map

```txt
mobile/src/
  config/env.ts              # runtime env values
  services/authApi.ts        # Supabase sign in/sign up
  services/accessApi.ts      # /api/me/access client
  services/profileApi.ts     # /api/me/profile + password reset client
  services/revenueCat.ts     # iOS purchase/restore helpers
  services/recipesApi.ts     # authenticated recipe API calls
  hooks/useAuthSession.ts    # auth + access orchestration
  hooks/useRecipes.ts        # recipe list loading
  hooks/useRecipeDetail.ts   # recipe detail loading
  screens/ProfileScreen.tsx
  screens/RecipeExplorerScreen.tsx
```

## Billing server dependency

The web app must expose `POST /api/billing/revenuecat/webhook` and process RevenueCat events to update `user_subscriptions.status`.
