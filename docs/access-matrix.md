# Access Matrix

This document is the single source of truth for recipe access in web and mobile.

## Actors
- `guest`: not signed in
- `subscriber`: signed in user
- `owner`: signed in owner/admin user

## Signals
- `role`: `guest | subscriber | owner`
- `signed_in`: `yes | no`
- `subscription_status`: `trialing | active | past_due | canceled | expired | n/a`
- `enterprise_granted`: `yes | no | n/a`

## Access Truth Table

| role       | signed_in | subscription_status          | enterprise_granted | can_view_public | can_view_enterprise | notes |
| ---------- | --------- | ---------------------------- | ------------------ | --------------- | ------------------- | ----- |
| guest      | no        | n/a                          | n/a                | no              | no                  | Marketing/home only |
| owner      | yes       | n/a                          | n/a                | yes             | yes                 | Full recipe access from role |
| subscriber | yes       | trialing \| active           | no                 | yes             | no                  | Default subscriber access |
| subscriber | yes       | trialing \| active           | yes                | yes             | yes                 | Owner granted enterprise |
| subscriber | yes       | past_due \| canceled \| expired | no                 | no              | no                  | No active public entitlement |
| subscriber | yes       | past_due \| canceled \| expired | yes                | no              | yes                 | Special rule: enterprise only |

## Authorization Rules
1. If `role = owner`, allow both `public` and `enterprise`.
2. If `role = subscriber`, set `can_view_public = subscription_status in {trialing, active}`.
3. If `role = subscriber`, set `can_view_enterprise = enterprise_granted`.
4. If not signed in, treat as `guest`.

## Example QA Scenarios
1. Subscriber on trial, no enterprise grant: sees only public.
2. Subscriber active and enterprise granted: sees public and enterprise.
3. Subscriber canceled and not enterprise granted: sees no recipes.
4. Subscriber expired and enterprise granted: sees enterprise only.
5. Owner account: always sees public and enterprise.
