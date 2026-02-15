# Recipe Platform Web

Web dashboard and public browsing app for the recipe platform.

## Main Areas

- `/` Landing hero
- `/recipes` Signed-in recipe browsing
- `/signin` Supabase email/password sign-in
- `/owner` Owner recipe visibility controls
- `/owner/subscribers` Owner subscriber enterprise grant/revoke controls

## Global Navigation

`web/app/layout.tsx` provides a site-wide sticky header with:

- `All recipes` link to `/recipes` (sign-in required)
- `Owner area` link to `/owner` (shown only for `owner` role)
- `Subscribers` link for owner users
- `Sign in` or `Sign out` button (auth-aware)

## Auth Model

- Sign-in stores Supabase access token in cookie `sb-access-token`.
- API routes resolve current user through `web/lib/api/currentUser.ts`.
- Owner pages check role through `getServerAccessSession()` (`web/lib/api/serverSession.ts`).
- Sign-out uses server action `web/app/actions/auth.ts` to clear auth cookies.

See `docs/auth-role-flow.md` for full request-level flow.

## Environment Variables

Required for auth:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for owner subscriber admin APIs (server-only):

- `SUPABASE_SERVICE_ROLE_KEY`

Required for server-to-server API calls in production:

- `INTERNAL_API_ORIGIN`

Current recipe admin API-key path:

- `ADMIN_API_KEY`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
