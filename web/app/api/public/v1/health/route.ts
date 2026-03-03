import { jsonSuccess } from "@/lib/api/public/http";

export async function GET() {
  return jsonSuccess({
    data: {
      ok: true,
      version: "v1",
    },
  });
}
