export type QueryParamValue = string | string[] | undefined;

export type HrefQueryValue = string | number | null | undefined | false;

const DEFAULT_ALLOWED_PAGE_SIZES = [10, 50, 100] as const;

export function pickFirstQueryParam(value?: QueryParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePageNumber(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : 1;
}

export function parsePageSizeNumber(
  value?: string,
  allowedSizes: readonly number[] = DEFAULT_ALLOWED_PAGE_SIZES,
  fallback = 10,
) {
  const parsed = Number(value ?? fallback);
  return allowedSizes.includes(parsed) ? parsed : fallback;
}

export function parseBoundedPageSize(
  value?: string,
  options?: {
    fallback?: number;
    min?: number;
    max?: number;
  },
) {
  const fallback = options?.fallback ?? 25;
  const min = options?.min ?? 1;
  const max = options?.max ?? 100;
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;

  const integer = Math.floor(parsed);
  if (integer < min) return fallback;
  return integer > max ? max : integer;
}

export function parseCategoryFilter(value?: string) {
  return value?.trim() ?? "";
}

// Shared helper for consistent URL state building across paginated list pages.
export function buildHrefWithQuery(pathname: string, query: Record<string, HrefQueryValue>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === false || value === "") continue;
    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
