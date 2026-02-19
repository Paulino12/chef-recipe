# Auth and Role Flow (Web)

This document explains the current end-to-end flow for authentication, role checks, and access decisions in the web app.

## 1) Core sources of truth

- Identity token source:
  - Browser cookie `sb-access-token` (set by `web/app/signin/page.tsx`)
  - Or `Authorization: Bearer ...` header
- User profile and entitlements (Supabase tables):
  - `public.user_profiles` (`role`, `email`)
  - `public.user_subscriptions` (`status`)
  - `public.user_entitlements` (`enterprise_granted`)
- Access rules:
  - Computed by `computeRecipeAccess` in `web/lib/api/access.ts`

## 2) Sign-in flow

1. User signs in on `web/app/signin/page.tsx`.
2. Supabase returns `session.access_token`.
3. App stores it in cookie `sb-access-token`.
4. If `next` query param is present (for example `/signin?next=%2Frecipes`), user is redirected there after sign-in.
5. Server routes/pages then read that cookie to identify user.

## 2.1) Global header auth controls

- `web/app/layout.tsx` renders the site-wide sticky header.
- Header shows:
  - `Sign in` when unauthenticated.
  - `Sign out` when authenticated.
- `Sign out` runs `web/app/actions/auth.ts`:
  - clears `sb-access-token` (and refresh token cookie)
  - redirects to `/`
- Header links are persistent across pages:
  - `All recipes` (`/recipes`) - sign-in required
  - `Profile` (`/profile`) - visible when signed in (includes billing controls)
  - `Pricing` anchor on landing (`/#pricing`) - visible when signed out
  - `Owner area` (`/owner`) - visible to `owner` role only
  - `Subscribers` (`/owner/subscribers`, visible to owners)

## 3) Request identity resolution

`web/lib/api/currentUser.ts` is the canonical resolver used by API routes.

Resolution order:
1. Supabase token path:
   - `Authorization` header, `x-supabase-access-token`, or `sb-access-token` cookie
   - `supabase.auth.getUser(token)` validates token
   - Reads profile/subscription/entitlement rows from public schema
2. Dev fallback path:
   - `DEV_USER_*` variables (for local development only)

Output type is `CurrentUser`:
- `id`, `email`, `role`, `subscriptionStatus`, `enterpriseGranted`

## 4) Access computation

`web/app/api/me/access/route.ts` combines:
- identity from `getCurrentUserFromRequest`
- rules from `computeRecipeAccess`

It returns:
- `user` (id/email/role)
- `entitlements` (subscription + enterprise + computed permissions)

Server pages call this through `web/lib/api/serverSession.ts`:
- `getServerAccessSession()`
- This keeps page-level logic consistent with API behavior.

## 5) Owner page protection

Owner pages enforce role checks in server components:
- `web/app/owner/page.tsx`
- `web/app/owner/subscribers/page.tsx`

Both do:
1. `getServerAccessSession()`
2. Redirect to `/signin` if no session
3. Redirect to `/` if role is not `owner`

## 6) Subscriber management flow (grant/revoke enterprise)

UI page:
- `web/app/owner/subscribers/page.tsx`

Server action:
- `web/app/owner/subscribers/actions.ts`
- Forwards incoming `cookie`/`authorization` headers to internal API

API endpoints:
- `GET /api/admin/subscribers`
- `POST /api/admin/subscribers/:userId/grant-enterprise`
- `POST /api/admin/subscribers/:userId/revoke-enterprise`

Data layer:
- `web/lib/api/subscribers.ts`
  - Reads from `v_user_access` + updated timestamps
  - Updates `user_entitlements`
  - Writes `audit_log` rows with actor/target/action/reason

## 7) Recipe access enforcement

Recipes web pages:
- `/recipes` requires sign-in.
- `/recipes/[id]` requires sign-in.
- `/recipes` supports audience filters (`public`, `enterprise`, `all`) based on computed entitlements.
- Default signed-in recipe mode starts on `public`; enterprise/all can be selected if available.
- `/profile` is the subscriber management page for display name + password reset + billing actions.
- Favorites:
  - Star toggle is available on recipe cards and recipe detail.
  - Favorites-only mode is enabled via `/recipes?...&favorites=1`.
  - Persistence path is dual-write:
    - primary table `public.user_recipe_favorites`
    - fallback cookie `recipe_favorites`
  - This keeps favorites functional even if DB migration is pending.

User recipe feed API endpoint:
- `web/app/api/recipes/route.ts`
- Uses `computeRecipeAccess` and denies unauthorized audiences.

Owner recipe visibility admin endpoint:
- `web/app/api/admin/recipes/route.ts`
- Currently protected by `x-api-key` (`ADMIN_API_KEY`).
- This is separate from role-based owner page gating.

## 8) Environment variables to know

- Supabase user auth:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Supabase server admin access (required for subscriber admin APIs):
  - `SUPABASE_SERVICE_ROLE_KEY`
- Internal server-to-server base URL:
  - `INTERNAL_API_ORIGIN` (required in production)
- Recipe admin API key path:
  - `ADMIN_API_KEY`
- Dev fallback identity (optional):
  - `DEV_USER_*`

## 9) Mental model (short version)

- `signin` creates token cookie
- `currentUser` resolves identity + role from Supabase
- `me/access` converts identity into final permissions
- owner pages require role `owner`
- subscriber admin actions write entitlement changes + audit records
