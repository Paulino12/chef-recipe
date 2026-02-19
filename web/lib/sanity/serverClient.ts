import { createClient } from "@sanity/client";
import { apiVersion, dataset, projectId } from "@/sanity/env";

function normalizeToken(token: string | undefined) {
  const value = token?.trim();
  return value ? value : undefined;
}

const tokenBySource = {
  SANITY_API_WRITE_TOKEN: normalizeToken(process.env.SANITY_API_WRITE_TOKEN),
  SANITY_API_TOKEN: normalizeToken(process.env.SANITY_API_TOKEN),
  SANITY_API_READ_TOKEN: normalizeToken(process.env.SANITY_API_READ_TOKEN),
} as const;

const readToken = tokenBySource.SANITY_API_READ_TOKEN ?? tokenBySource.SANITY_API_TOKEN;
const writeToken =
  tokenBySource.SANITY_API_WRITE_TOKEN ??
  tokenBySource.SANITY_API_TOKEN ??
  tokenBySource.SANITY_API_READ_TOKEN;

const writeTokenCandidates = [
  {
    source: "SANITY_API_WRITE_TOKEN",
    token: tokenBySource.SANITY_API_WRITE_TOKEN,
  },
  {
    source: "SANITY_API_TOKEN",
    token: tokenBySource.SANITY_API_TOKEN,
  },
  {
    source: "SANITY_API_READ_TOKEN",
    token: tokenBySource.SANITY_API_READ_TOKEN,
  },
].filter((entry): entry is { source: string; token: string } => Boolean(entry.token));

function createSanityClient(token: string | undefined) {
  return createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false,
    token,
  });
}

function isProjectHostMismatchError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("session does not match project host");
}

const sanityServerPublic = createSanityClient(undefined);
const sanityServerWithToken = createSanityClient(readToken);

/**
 * Server-only Sanity client for reads.
 */
export const sanityServer = {
  async fetch<T = unknown>(query: string, params?: unknown) {
    if (!readToken) {
      return params === undefined
        ? sanityServerPublic.fetch<T>(query)
        : sanityServerPublic.fetch<T>(query, params as never);
    }

    try {
      return params === undefined
        ? await sanityServerWithToken.fetch<T>(query)
        : await sanityServerWithToken.fetch<T>(query, params as never);
    } catch (error) {
      // Common when projectId is switched but old token remains in .env.local.
      // For published-content reads, gracefully fall back to tokenless client.
      if (isProjectHostMismatchError(error)) {
        return params === undefined
          ? sanityServerPublic.fetch<T>(query)
          : sanityServerPublic.fetch<T>(query, params as never);
      }
      throw error;
    }
  },
};

/**
 * Server-only Sanity client for writes.
 * Prefers a dedicated write token, but falls back for legacy env setups.
 */
export const sanityServerWrite = createSanityClient(writeToken);

export function getSanityWriteClients() {
  return writeTokenCandidates.map((entry) => ({
    source: entry.source,
    client: createSanityClient(entry.token),
  }));
}
