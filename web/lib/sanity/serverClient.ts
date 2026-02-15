import { createClient } from "@sanity/client";

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
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION!,
    useCdn: false,
    token,
  });
}

/**
 * Server-only Sanity client for reads.
 */
export const sanityServer = createSanityClient(readToken);

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
