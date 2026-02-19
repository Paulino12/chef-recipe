import { env } from "../config/env";

type QueryValue = string | number | boolean | undefined | null;

type RequestOptions = {
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type JsonMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type JsonRequestOptions = RequestOptions & {
  method?: JsonMethod;
  body?: unknown;
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

async function parseErrorMessage(response: Response) {
  const fallback = `Request failed with status ${response.status}`;
  const raw = await response.text();
  if (!raw) return fallback;

  try {
    const payload = JSON.parse(raw) as { error?: string; message?: string };
    return payload.error?.trim() || payload.message?.trim() || raw;
  } catch {
    return raw;
  }
}

export async function requestJson<T>(path: string, options?: JsonRequestOptions): Promise<T> {
  const method = options?.method ?? "GET";
  const body = options?.body === undefined ? undefined : JSON.stringify(options.body);
  const baseHeaders = options?.headers ?? {};
  const hasContentType = Object.keys(baseHeaders).some((key) => key.toLowerCase() === "content-type");

  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: body && !hasContentType ? { "content-type": "application/json", ...baseHeaders } : baseHeaders,
    body,
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  return requestJson<T>(path, { ...options, method: "GET" });
}

export async function postJson<T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, "query"> & { query?: Record<string, QueryValue> },
): Promise<T> {
  return requestJson<T>(path, { ...options, method: "POST", body });
}

export async function patchJson<T>(
  path: string,
  body?: unknown,
  options?: Omit<RequestOptions, "query"> & { query?: Record<string, QueryValue> },
): Promise<T> {
  return requestJson<T>(path, { ...options, method: "PATCH", body });
}
