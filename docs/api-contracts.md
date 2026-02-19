# API Contracts (Milestone 1)

This document defines the first API contracts needed to implement authentication-aware recipe access.

## Scope
- Access computation for the signed-in user
- Owner subscriber management for enterprise grants
- Response shapes used by both web and mobile

## Conventions
- Base: web API routes (`/api/...`)
- Auth: user session token/cookie (no shared enterprise key for user flows)
- JSON responses only
- Dates in ISO 8601 UTC strings

## Canonical enums

### `role`
- `owner`
- `subscriber`

### `subscription_status`
- `trialing`
- `active`
- `past_due`
- `canceled`
- `expired`

## Access Rules (from access matrix)
1. `owner` can view `public` and `enterprise`.
2. `subscriber` can view `public` only when `subscription_status` is `trialing` or `active`.
3. `subscriber` can view `enterprise` when `enterprise_granted` is `true`.
4. Unauthenticated users (`guest`) cannot load recipe feeds.

## Endpoint: `GET /api/me/access`
Returns computed effective access for the currently authenticated user.

### Auth
- Required

### 200 response
```json
{
  "user": {
    "id": "usr_123",
    "email": "person@example.com",
    "display_name": "Paul",
    "role": "subscriber"
  },
  "entitlements": {
    "subscription_status": "active",
    "enterprise_granted": false,
    "can_view_public": true,
    "can_view_enterprise": false
  },
  "computed_at": "2026-02-09T12:00:00.000Z"
}
```

### Errors
- `401` unauthenticated
```json
{ "error": "Unauthorized" }
```

## Endpoint: `GET /api/admin/subscribers`
Owner-only list for subscriber management.

### Auth
- Required (`owner` only)

### Query params
- `q` (optional): email search
- `status` (optional): one of `trialing|active|past_due|canceled|expired`
- `enterprise` (optional): `true|false`
- `page` (optional): default `1`
- `page_size` (optional): default `25`, max `100`

### 200 response
```json
{
  "items": [
    {
      "user_id": "usr_456",
      "email": "subscriber@example.com",
      "subscription_status": "trialing",
      "enterprise_granted": false,
      "can_view_public": true,
      "can_view_enterprise": false,
      "updated_at": "2026-02-09T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total": 1
  }
}
```

### Errors
- `401` unauthenticated
- `403` authenticated but not owner

## Endpoint: `POST /api/admin/subscribers/:userId/grant-enterprise`
Owner-only action to grant enterprise access.

### Auth
- Required (`owner` only)

### Request body
```json
{
  "reason": "Manual upgrade"
}
```

### 200 response
```json
{
  "user_id": "usr_456",
  "enterprise_granted": true,
  "updated_at": "2026-02-09T12:00:00.000Z"
}
```

### Errors
- `400` invalid `userId` or payload
- `401` unauthenticated
- `403` not owner
- `404` subscriber not found

## Endpoint: `POST /api/admin/subscribers/:userId/revoke-enterprise`
Owner-only action to revoke enterprise access.

### Auth
- Required (`owner` only)

### Request body
```json
{
  "reason": "Plan change"
}
```

### 200 response
```json
{
  "user_id": "usr_456",
  "enterprise_granted": false,
  "updated_at": "2026-02-09T12:00:00.000Z"
}
```

### Errors
- `400` invalid `userId` or payload
- `401` unauthenticated
- `403` not owner
- `404` subscriber not found

## Endpoint: `POST /api/admin/subscribers/:userId/set-subscription-status`
Owner-only action to manually set subscription status.

### Auth
- Required (`owner` only)

### Request body
```json
{
  "status": "active",
  "reason": "Owner dashboard set status"
}
```

### 200 response
```json
{
  "user_id": "usr_456",
  "subscription_status": "active",
  "updated_at": "2026-02-09T12:00:00.000Z"
}
```

### Errors
- `400` invalid `userId` or status
- `401` unauthenticated
- `403` not owner
- `404` subscriber not found

## Endpoint: `GET /api/me/profile` (optional convenience)
Useful if UI needs profile details separately from access.

### Auth
- Required

### 200 response
```json
{
  "user": {
    "id": "usr_123",
    "email": "person@example.com",
    "display_name": "Paul",
    "role": "subscriber"
  },
  "entitlements": {
    "subscription_status": "trialing",
    "enterprise_granted": false
  }
}
```

## Endpoint: `PATCH /api/me/profile`
Update self profile fields.

### Auth
- Required

### Request body
```json
{
  "display_name": "Paul"
}
```

`display_name` accepts `string | null` and is capped at 80 chars.

### 200 response
```json
{
  "user": {
    "id": "usr_123",
    "email": "person@example.com",
    "display_name": "Paul",
    "role": "subscriber"
  },
  "updated_at": "2026-02-09T12:00:00.000Z"
}
```

## Endpoint: `POST /api/me/password/reset`
Send password reset email for current user.

### Auth
- Required

### 200 response
```json
{
  "ok": true,
  "message": "Password reset email sent."
}
```

## Endpoint: `POST /api/billing/revenuecat/webhook`
RevenueCat server webhook for subscription status updates.

### Auth
- Required via shared secret header:
  - `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`

### Request body
- RevenueCat event payload.

### Behavior
- Maps RevenueCat events to `user_subscriptions.status` and updates:
  - `provider = revenuecat`
  - `provider_customer_id`
  - `provider_subscription_id`
  - `trial_ends_at`
  - `current_period_ends_at`
- Inserts `audit_log` action `set_subscription_status`.

### 200 response
```json
{
  "ok": true,
  "user_id": "usr_123",
  "subscription_status": "active"
}
```

## Endpoint: `POST /api/billing/stripe/checkout-session`
Create Stripe Checkout session for the signed-in subscriber.

### Auth
- Required (`subscriber` only)

### Request body
```json
{
  "priceId": "price_123"
}
```

`priceId` is optional when `STRIPE_PUBLIC_PRICE_ID` is configured server-side.

### 200 response
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/...",
  "checkout_session_id": "cs_test_..."
}
```

## Endpoint: `POST /api/billing/stripe/portal-session`
Create Stripe customer portal session for signed-in user.

### Auth
- Required

### 200 response
```json
{
  "portal_url": "https://billing.stripe.com/session/..."
}
```

## Endpoint: `POST /api/billing/stripe/webhook`
Stripe webhook endpoint that updates `user_subscriptions` from subscription events.

### Auth
- Required via Stripe signature header:
  - `stripe-signature`

### Behavior
- Verifies `STRIPE_WEBHOOK_SECRET`.
- Handles:
  - `checkout.session.completed`
  - `customer.subscription.created|updated|deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`
- Upserts `user_subscriptions` with `provider='stripe'`.
- Writes `audit_log` action `set_subscription_status`.

## Recipes UI Contract: `GET /recipes` query params

This is a page-level contract used by web server components.

- `audience`: `public | enterprise | all`
- `q`: search by recipe title
- `category`: top-level category
- `page`: numeric page index
- `pageSize`: `10 | 50 | 100`
- `favorites`:
  - `1` or `true` means "favorites-only mode"
  - favorites-only still applies audience/category/search filters

## Favorites Persistence Contract

Favorites are currently dual-persisted:

1. Primary: `public.user_recipe_favorites` table (`user_id`, `recipe_id`)
2. Fallback: HTTP-only cookie `recipe_favorites`

This dual-write behavior prevents UX regressions while environments catch up
with the DB migration.

## Notes for implementation
- `can_view_public` and `can_view_enterprise` are server-computed values.
- API consumers should rely on computed flags, not duplicate logic in clients.
- Every grant/revoke must write an `audit_log` record with `actor_user_id`, `target_user_id`, `action`, and `reason`.
- New auth signups are auto-provisioned with:
  - `user_profiles.role = subscriber`
  - `user_subscriptions.status = trialing`
  - `user_entitlements.enterprise_granted = false`
- Result: new subscribers can view public recipes immediately and appear in owner subscriber management.
