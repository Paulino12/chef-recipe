# RapidAPI Publishing

## What was added
- External read-only routes under `/api/public/v1`
- A dedicated OpenAPI file at `docs/public-api.openapi.json`
- Optional proxy-secret validation via `PUBLIC_API_PROXY_SECRET`

## Recommended environment variables
- `PUBLIC_API_ENABLED=true`
- `PUBLIC_API_PROXY_SECRET=<shared secret only RapidAPI forwards>`
- `APP_BASE_URL=https://your-production-domain`

## Before publishing
1. Deploy the web app with the new `/api/public/v1/*` routes.
2. Set `PUBLIC_API_PROXY_SECRET` in production.
3. In RapidAPI Studio, add a request transformation that injects:
   - Header name: `x-rapidapi-proxy-secret`
   - Header value: the same secret
   - Scope: every request to your API
4. Confirm these URLs work from production:
   - `/api/public/v1/health`
   - `/api/public/v1/recipes`
   - `/api/public/v1/recipes/rn_<RN>`

## RapidAPI provider steps
1. Create a new API in the RapidAPI provider dashboard.
2. Import `docs/public-api.openapi.json`.
3. Set the base URL to your deployed web origin.
4. Add the request transformation so traffic reaching your origin carries the shared secret.
5. Configure plans:
   - Free: search and metadata endpoints only
   - Pro: full recipe detail access
   - Business: higher monthly quota and priority support
6. Add example requests for:
   - recipe search
   - allergen filtering
   - nutrition filtering
   - single recipe lookup
7. Publish privately first, verify logs and quotas, then make the API public.

## Suggested launch examples
### Search
`GET /api/public/v1/recipes?q=lemon&collection=Dining`

### Filter by allergens
`GET /api/public/v1/recipes?exclude_allergens=gluten,nuts`

### Filter by nutrition
`GET /api/public/v1/recipes?max_kcal=500&max_salt_g=1.2`

### Single recipe
`GET /api/public/v1/recipes/rn_12086068`
