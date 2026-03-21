# Recipe Platform Web

Web dashboard and public browsing app for the recipe platform.

## Main Areas

- `/` Landing hero with integrated pricing
- `/signup` Supabase email/password sign-up
- `/recipes` Signed-in recipe browsing with audience filters (`public`, `enterprise`, `all`)
- `/profile` Subscriber profile + billing management
- `/billing` Legacy alias route that redirects to `/profile`
- `/reset-password` Password reset landing page for recovery emails
- `/signin` Supabase email/password sign-in
- `/owner` Owner recipe visibility controls
- `/owner/subscribers` Owner subscriber enterprise grant/revoke controls

## Favorites

- Recipe cards and recipe detail pages support favorite toggling (heart icon).
- Favorites are persisted in:
  - `public.user_recipe_favorites` (primary)
  - `recipe_favorites` cookie (fallback + immediate UX)
- `/recipes` supports `favorites=1` query param to show favorite-only results
  while still honoring audience/category/search/pagination filters.

## Global Navigation

`web/app/layout.tsx` provides a site-wide sticky header with:

- `All recipes` link to `/recipes` (sign-in required)
- `Profile` link to `/profile` for signed-in users (billing lives there)
- `Owner area` link to `/owner` (shown only for `owner` role)
- `Subscribers` link for owner users
- `Pricing` link for signed-out users (anchors to landing section)
- `Sign in` or `Sign out` button (auth-aware)

## Auth Model

- Sign-in/sign-up now exchange the Supabase session through `POST /api/auth/session`.
- The app stores auth tokens in server-set `HttpOnly` cookies (`sb-access-token`, `sb-refresh-token`).
- API routes resolve current user through `web/lib/api/currentUser.ts`.
- Owner pages check role through `getServerAccessSession()` (`web/lib/api/serverSession.ts`).
- Sign-out uses server action `web/app/actions/auth.ts` to clear auth cookies.
- New Supabase users are auto-provisioned as `subscriber` with `trialing` subscription and `enterprise_granted=false`.
- Sign-up confirmation redirects back to `/signin?confirmed=1`.
- Sign-in includes resend-confirmation and forgot-password actions.
- Profile APIs are available for signed-in users:
  - `GET/PATCH /api/me/profile`
  - `POST /api/me/password/reset`

See `docs/auth-role-flow.md` for full request-level flow.

## Environment Variables

Required for auth:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for owner subscriber admin APIs (server-only):

- `SUPABASE_SERVICE_ROLE_KEY`

Required for RevenueCat webhook processing:

- `REVENUECAT_WEBHOOK_SECRET`
- `REVENUECAT_PUBLIC_ENTITLEMENT_ID` (optional but recommended)

Required for Stripe billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLIC_PRICE_ID` (or pass `priceId` per request)
- `STRIPE_TRIAL_DAYS` (optional, defaults to `3`)
- `STRIPE_ALLOWED_PRICE_IDS` (optional comma-separated allowlist for override `priceId`)

Optional Stripe URLs:

- `APP_BASE_URL`
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`

Optional for password reset redirect:

- `PASSWORD_RESET_REDIRECT_TO`

Supabase Auth redirect URLs should allow:

- `https://<your-domain>/signin?confirmed=1`
- `https://<your-domain>/reset-password`

Required for server-to-server API calls in production:

- `INTERNAL_API_ORIGIN`

Current recipe admin API-key path:

- `ADMIN_API_KEY`

## Database Migration Required for Favorites

Run this once in Supabase SQL Editor:

```sql
create table if not exists public.user_recipe_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists idx_user_recipe_favorites_recipe_id
  on public.user_recipe_favorites (recipe_id);
```

If this Supabase project was reset after the first schema setup, rerun the SQL block above once so favorites persist in the database instead of falling back to cookies only.

## Database Migration Required for Recipe Costing

Run this once in Supabase SQL Editor before using the owner costing workspace:

```sql
create table if not exists public.recipe_costings (
  recipe_id text primary key,
  recipe_title text not null,
  recipe_collection text not null,
  recipe_portions numeric,
  ingredient_fingerprint text not null,
  currency text not null default 'GBP',
  total_cost numeric(12,2) not null default 0,
  cost_per_portion numeric(12,2),
  source_recipe_id text,
  cost_lines jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_costings_currency_check check (char_length(trim(currency)) > 0)
);

create index if not exists idx_recipe_costings_updated_at
  on public.recipe_costings (updated_at desc);

create index if not exists idx_recipe_costings_source_recipe_id
  on public.recipe_costings (source_recipe_id);

drop trigger if exists trg_recipe_costings_updated_at on public.recipe_costings;
create trigger trg_recipe_costings_updated_at
before update on public.recipe_costings
for each row execute function public.touch_updated_at();
```

If the project was recreated or reset after the schema was first applied, rerun this block so saved recipe costing can load and persist.

## Supabase Email Templates

The app now expects:

- confirmation emails to return users to `/signin?confirmed=1`
- password reset emails to return users to `/reset-password`

Recommended template copy lives in `docs/supabase-email-templates.md`.

## Quality Snapshot

- `npm run lint` currently passes.
- `npx tsc --noEmit` currently passes.
- `npm test` (Vitest integration suite) currently passes.

Current integration tests:

- `tests/integration/me-access.route.test.ts`
- `tests/integration/admin-subscriber.routes.test.ts`
- `tests/integration/recipe-favorites.action.test.ts`
- `tests/integration/stripe-webhook.route.test.ts`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run Studio Separately

To avoid embedded Studio runtime issues during development, run Studio as a separate process:

```bash
npm run studio
```

Open `http://localhost:3333`.

The in-app `/studio` route is intentionally disabled and now points you to standalone Studio.

Additional Studio scripts:

```bash
npm run studio:build
npm run studio:deploy
```

## Recipe Data Pipeline

Recipe import data is normalized with a reusable script before Sanity import:

```bash
npm run data:prepare
```

This script:

- Cleans ingredient supplier/packaging tails
- Rebuilds ingredient text from `qty + unit + item`
- Converts recipe numbers from `93...` to `12...` (`id`, `_id`, `pluNumber`)
- Ensures `imageUrl` fallback is present (`/recipe-placeholder.svg`)

To prepare and import in one command:

```bash
npm run data:import
```

## Test

```bash
npm test
```

## Operational Checklist

1. Apply database schema/migrations in Supabase:
   - Run `docs/db-schema.sql`
   - Run favorites table migration in this file (`Database Migration Required for Favorites`)
2. Confirm required environment variables in `web/.env.local`:
   - Supabase auth keys
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLIC_PRICE_ID`)
3. Configure webhooks:
   - RevenueCat -> `POST /api/billing/revenuecat/webhook`
   - Stripe -> `POST /api/billing/stripe/webhook`
4. Local webhook verification:
   - Run app: `npm run dev`
   - Run Stripe CLI listener and set `STRIPE_WEBHOOK_SECRET` from listener output
5. Pre-deploy checks:
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm test`

## Production Deployment (Web + Studio)

1. Deploy web app (e.g. Vercel) from `web` folder:
   - Build command: `npm run build`
   - Start command: `npm run start`
2. Set production env vars in hosting provider:
   - `NEXT_PUBLIC_SANITY_PROJECT_ID`
   - `NEXT_PUBLIC_SANITY_DATASET`
   - `NEXT_PUBLIC_SANITY_API_VERSION`
   - `NEXT_PUBLIC_STUDIO_URL` (your deployed standalone studio URL)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INTERNAL_API_ORIGIN` (must be your web app base URL)
   - `ADMIN_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLIC_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET`
   - `APP_BASE_URL` (same as web app base URL)
3. Deploy standalone Studio:
   - Run `npm run studio:deploy`
   - Choose/confirm hostname (e.g. `recipe-platform-studio.sanity.studio`)
4. Update web env `NEXT_PUBLIC_STUDIO_URL` to the deployed Studio URL.
5. Configure Stripe production webhook:
   - `POST https://<web-domain>/api/billing/stripe/webhook`
6. Run go-live smoke checks:
   - Sign in as owner -> `/owner` loads recipes
   - Toggle recipe visibility works
   - Subscriber sees only expected audiences
   - Stripe checkout starts and webhook updates subscription status

## Billing Webhook

Configure RevenueCat webhook URL:

- `POST https://<your-domain>/api/billing/revenuecat/webhook`

Set RevenueCat authorization header secret to match `REVENUECAT_WEBHOOK_SECRET`.

Configure Stripe webhook URL:

- `POST https://<your-domain>/api/billing/stripe/webhook`

Use Stripe's webhook signing secret as `STRIPE_WEBHOOK_SECRET`.
