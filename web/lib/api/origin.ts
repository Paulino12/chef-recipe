const DEV_INTERNAL_ORIGIN = "http://127.0.0.1:3000";

/**
 * Canonical origin for server-to-server fetches inside Next.js server components/actions.
 * In dev we default to localhost; in production this must be set explicitly.
 */
export function getInternalApiOrigin() {
  const configured = process.env.INTERNAL_API_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing INTERNAL_API_ORIGIN");
  }

  return DEV_INTERNAL_ORIGIN;
}
