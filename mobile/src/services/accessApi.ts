import { getJson } from "../lib/http";
import { AccessSession } from "../types/access";

export async function fetchAccessSession(
  accessToken: string,
  signal?: AbortSignal,
): Promise<AccessSession> {
  return getJson<AccessSession>("/api/me/access", {
    signal,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}
