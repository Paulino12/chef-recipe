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

## Endpoint: `GET /api/me/profile` (optional convenience)
Useful if UI needs profile details separately from access.

### Auth
- Required

### 200 response
```json
{
  "id": "usr_123",
  "email": "person@example.com",
  "role": "subscriber",
  "created_at": "2026-02-01T10:00:00.000Z"
}
```

## Notes for implementation
- `can_view_public` and `can_view_enterprise` are server-computed values.
- API consumers should rely on computed flags, not duplicate logic in clients.
- Every grant/revoke must write an `audit_log` record with `actor_user_id`, `target_user_id`, `action`, and `reason`.
