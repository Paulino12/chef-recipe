import { NextRequest } from "next/server";

import { requirePublicApiAccess } from "@/lib/api/public/auth";
import { jsonError, jsonSuccess } from "@/lib/api/public/http";
import {
  PUBLIC_API_METADATA_CACHE_CONTROL,
  listPublicApiCollections,
} from "@/lib/api/public/recipes";

export async function GET(req: NextRequest) {
  const auth = requirePublicApiAccess(req);
  if (!auth.ok) {
    return jsonError(auth.code, auth.message, { status: auth.status });
  }

  const collections = await listPublicApiCollections();
  return jsonSuccess(
    { data: collections },
    {
      cacheControl: PUBLIC_API_METADATA_CACHE_CONTROL,
    },
  );
}
