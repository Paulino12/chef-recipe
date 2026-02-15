import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getInternalApiOrigin } from "@/lib/api/origin";
import { getForwardAuthHeaders, getServerAccessSession } from "@/lib/api/serverSession";
import { cn } from "@/lib/utils";

import { grantEnterpriseAction, revokeEnterpriseAction } from "./actions";

type SubscriberItem = {
  user_id: string;
  email: string;
  subscription_status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  enterprise_granted: boolean;
  can_view_public: boolean;
  can_view_enterprise: boolean;
  updated_at: string;
};

type SubscribersPayload = {
  items: SubscriberItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  enterprise?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
};

const VALID_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "expired"] as const);

function pickFirst(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : 1;
}

function parsePageSize(value?: string) {
  const parsed = Number(value ?? "25");
  if (!Number.isFinite(parsed)) return 25;
  const integer = Math.floor(parsed);
  if (integer <= 0) return 25;
  return integer > 100 ? 100 : integer;
}

function parseStatus(value?: string) {
  if (!value) return "";
  return VALID_STATUSES.has(value as (typeof VALID_STATUSES extends Set<infer T> ? T : never))
    ? value
    : "";
}

function parseEnterprise(value?: string) {
  if (value === "true" || value === "false") return value;
  return "";
}

function buildHref(params: {
  q: string;
  status: string;
  enterprise: string;
  page: number;
  pageSize: number;
}) {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (params.status) next.set("status", params.status);
  if (params.enterprise) next.set("enterprise", params.enterprise);
  next.set("page", String(params.page));
  next.set("pageSize", String(params.pageSize));
  return `/owner/subscribers?${next.toString()}`;
}

async function loadSubscribers(
  params: {
    q: string;
    status: string;
    enterprise: string;
    page: number;
    pageSize: number;
  },
  authHeaders: { cookie?: string; authorization?: string },
) {
  // Forward auth headers so internal API sees the same signed-in user context.
  const url = new URL("/api/admin/subscribers", getInternalApiOrigin());
  if (params.q) url.searchParams.set("q", params.q);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.enterprise) url.searchParams.set("enterprise", params.enterprise);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("page_size", String(params.pageSize));

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
      ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
    },
  });

  if (!response.ok) {
    let reason = `request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) {
        reason = data.error;
      }
    } catch {
      // Keep fallback reason.
    }

    throw new Error(reason);
  }

  return (await response.json()) as SubscribersPayload;
}

export default async function OwnerSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Owner-only gate for subscriber management.
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fowner%2Fsubscribers");
  if (session.user.role !== "owner") redirect("/");

  // Needed for subsequent internal fetch to preserve identity.
  const authHeaders = await getForwardAuthHeaders();

  const sp = await searchParams;
  const q = (pickFirst(sp.q) ?? "").trim();
  const status = parseStatus((pickFirst(sp.status) ?? "").trim());
  const enterprise = parseEnterprise((pickFirst(sp.enterprise) ?? "").trim());
  const page = parsePage(pickFirst(sp.page));
  const pageSize = parsePageSize(pickFirst(sp.pageSize));

  const data = await loadSubscribers({ q, status, enterprise, page, pageSize }, authHeaders);

  const total = data.pagination.total;
  const from = total === 0 ? 0 : (data.pagination.page - 1) * data.pagination.page_size + 1;
  const to = total === 0 ? 0 : Math.min(data.pagination.page * data.pagination.page_size, total);
  const totalPages = Math.max(1, Math.ceil(total / data.pagination.page_size));

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
      <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Private Dashboard</Badge>
              <Badge variant="outline">Subscriber Access</Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl">Owner Subscriber Management</CardTitle>
              <CardDescription>
                Control enterprise access and review effective permissions.
              </CardDescription>
            </div>
            <form className="space-y-3" action="/owner/subscribers" method="get">
              <input type="hidden" name="page" value="1" />
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="q">
                    Search by email
                  </label>
                  <Input
                    id="q"
                    name="q"
                    defaultValue={q}
                    placeholder="e.g. alice@example.com"
                    className="bg-background/80"
                  />
                </div>
                <div className="md:w-44">
                  <label className="mb-2 block text-sm font-medium" htmlFor="status">
                    Subscription
                  </label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={status}
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    <option value="trialing">trialing</option>
                    <option value="active">active</option>
                    <option value="past_due">past_due</option>
                    <option value="canceled">canceled</option>
                    <option value="expired">expired</option>
                  </select>
                </div>
                <div className="md:w-40">
                  <label className="mb-2 block text-sm font-medium" htmlFor="enterprise">
                    Enterprise
                  </label>
                  <select
                    id="enterprise"
                    name="enterprise"
                    defaultValue={enterprise}
                    className="h-10 w-full rounded-md border border-input bg-background/80 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All</option>
                    <option value="true">granted</option>
                    <option value="false">not granted</option>
                  </select>
                </div>
                <Button type="submit" className="md:min-w-24">
                  Apply
                </Button>
              </div>
            </form>
          </CardHeader>
        </Card>

        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-2">
            <CardDescription>Current range</CardDescription>
            <CardTitle className="text-4xl">
              {from}-{to}
            </CardTitle>
            <CardDescription>of {total} subscribers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/owner" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              Back to recipe controls
            </Link>
            <Link href="/recipes" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              Back to public list
            </Link>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Subscriber</th>
                <th className="px-4 py-3 font-medium">Subscription</th>
                <th className="px-4 py-3 font-medium">Public Access</th>
                <th className="px-4 py-3 font-medium">Enterprise Access</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                    No subscribers found.
                  </td>
                </tr>
              ) : null}
              {data.items.map((item) => (
                <tr key={item.user_id} className="border-t align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.email}</p>
                    <p className="text-xs text-muted-foreground">ID {item.user_id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{item.subscription_status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.can_view_public ? "secondary" : "outline"}>
                      {item.can_view_public ? "yes" : "no"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.can_view_enterprise ? "secondary" : "outline"}>
                      {item.can_view_enterprise ? "yes" : "no"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <form action={grantEnterpriseAction}>
                        <input type="hidden" name="userId" value={item.user_id} />
                        <input type="hidden" name="reason" value="Owner dashboard grant" />
                        <Button
                          type="submit"
                          size="sm"
                          variant={item.enterprise_granted ? "success" : "outline"}
                        >
                          Grant
                        </Button>
                      </form>

                      <form action={revokeEnterpriseAction}>
                        <input type="hidden" name="userId" value={item.user_id} />
                        <input type="hidden" name="reason" value="Owner dashboard revoke" />
                        <Button
                          type="submit"
                          size="sm"
                          variant={!item.enterprise_granted ? "success" : "outline"}
                        >
                          Revoke
                        </Button>
                      </form>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Updated {new Date(item.updated_at).toLocaleString()}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Page <span className="font-medium text-foreground">{data.pagination.page}</span> of{" "}
          <span className="font-medium text-foreground">{totalPages}</span>
        </p>
        <div className="flex gap-2">
          {data.pagination.page > 1 ? (
            <Link
              href={buildHref({
                q,
                status,
                enterprise,
                page: data.pagination.page - 1,
                pageSize: data.pagination.page_size,
              })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none opacity-50",
              )}
            >
              Previous
            </span>
          )}

          {data.pagination.page < totalPages ? (
            <Link
              href={buildHref({
                q,
                status,
                enterprise,
                page: data.pagination.page + 1,
                pageSize: data.pagination.page_size,
              })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none opacity-50",
              )}
            >
              Next
            </span>
          )}
        </div>
      </div>
    </main>
  );
}


