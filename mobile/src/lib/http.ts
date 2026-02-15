import { env } from "../config/env";

type QueryValue = string | number | boolean | undefined | null;

type RequestOptions = {
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  if (!env.apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is missing. Add it in mobile/.env.");
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${env.apiBaseUrl}${cleanPath}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

export async function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(path, options?.query), {
    method: "GET",
    headers: options?.headers,
    signal: options?.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    const message = text || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}
