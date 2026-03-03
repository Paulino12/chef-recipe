import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

type ResponseOptions = {
  status?: number;
  cacheControl?: string;
  requestId?: string;
};

function buildHeaders(cacheControl?: string) {
  const headers = new Headers();
  if (cacheControl) {
    headers.set("Cache-Control", cacheControl);
  }
  return headers;
}

export function createRequestId() {
  return randomUUID();
}

export function jsonSuccess<T extends Record<string, unknown>>(payload: T, options?: ResponseOptions) {
  const requestId = options?.requestId ?? createRequestId();
  return NextResponse.json(
    {
      ...payload,
      request_id: requestId,
    },
    {
      status: options?.status ?? 200,
      headers: buildHeaders(options?.cacheControl),
    },
  );
}

export function jsonError(
  code: string,
  message: string,
  options?: ResponseOptions,
) {
  const requestId = options?.requestId ?? createRequestId();
  return NextResponse.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
      },
    },
    {
      status: options?.status ?? 500,
      headers: buildHeaders(options?.cacheControl),
    },
  );
}
