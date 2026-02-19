const DEV_INTERNAL_ORIGIN = "http://127.0.0.1:3000";

function normalizeOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  // Accept bare hostnames from platforms like Vercel's VERCEL_URL.
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Canonical origin for server-to-server fetches inside Next.js server components/actions.
 * Resolution order:
 * 1) INTERNAL_API_ORIGIN
 * 2) APP_BASE_URL
 * 3) VERCEL_URL (auto-populated on Vercel)
 * 4) localhost fallback for local dev
 */
export function getInternalApiOrigin() {
  const configured =
    normalizeOrigin(process.env.INTERNAL_API_ORIGIN) ||
    normalizeOrigin(process.env.APP_BASE_URL) ||
    normalizeOrigin(process.env.VERCEL_URL);
  if (configured) return configured;

  return DEV_INTERNAL_ORIGIN;
}
