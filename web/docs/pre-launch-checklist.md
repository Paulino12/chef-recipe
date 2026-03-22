# Pre-Launch Checklist

## Security

- Confirm `DEV_AUTH_FALLBACK_ENABLED=false` in production.
- Confirm no `DEV_USER_*` environment variables are set in production.
- Confirm `ADMIN_API_KEY` is strong and stored securely.
- Confirm `SANITY_API_WRITE_TOKEN` has the minimum required permissions.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is only used server-side.
- Confirm `PUBLIC_API_PROXY_SECRET` is set if the public API should be restricted.
- Confirm Stripe webhook secret is configured correctly.

## Authentication And Access

- Test sign up with a real email confirmation flow.
- Test sign in with valid credentials.
- Test password reset email flow.
- Test unauthenticated users are redirected away from protected pages.
- Test subscriber accounts only see allowed recipe audiences.
- Test owner accounts can access owner pages and subscribers management.
- Test non-owner accounts cannot access owner actions or owner APIs.

## Billing

- Test Stripe checkout creates a subscription correctly.
- Test Stripe portal opens for an existing billing customer.
- Test webhook events update subscription status correctly.
- Test active, trialing, paused, past due, canceled, and expired states behave correctly in the UI.

## Recipe Browsing

- Test recipe list search.
- Test category filters.
- Test collection filters.
- Test favourites save/remove flow.
- Test pagination on recipe list and owner list.
- Test recipe detail pages on desktop and mobile widths.
- Test enterprise/public audience switching with the right permissions.

## Owner Workflows

- Test owner recipe visibility toggles.
- Test owner subscriber grant and revoke flows.
- Test owner subscription status changes for subscribers.
- Test costing save, delete, and review states.
- Test nutrition estimate save flow to Sanity.
- Test owner filters for costing and nutrition visibility.

## Data Quality

- Check that saved nutrition renders properly on recipe pages.
- Check that missing nutrition is shown gracefully.
- Check that costing summaries match expected saved records.
- Spot-check ingredient nutrition matches on several recipes.
- Spot-check sub-recipe costing behavior.

## Content And UX

- Check all main pages for layout issues on desktop.
- Check all main pages for layout issues on mobile.
- Check wording for manager-facing and chef-facing clarity.
- Check empty states, success states, and error states.
- Check image fallbacks and missing-data fallbacks.

## Operational Readiness

- Confirm production environment variables are complete.
- Confirm Sanity production dataset is correct.
- Confirm Supabase production tables and policies are correct.
- Confirm Stripe production keys are correct.
- Confirm app base URL and internal API origin are correct.
- Confirm logging and basic monitoring are in place.

## Final Verification

- Run `npm test`.
- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Perform one real owner smoke test in production-like environment.
- Perform one real subscriber smoke test in production-like environment.
