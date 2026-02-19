"use server";

import { redirect } from "next/navigation";

import { getInternalApiOrigin } from "@/lib/api/origin";
import { getForwardAuthHeaders, getServerAccessSession } from "@/lib/api/serverSession";

type CheckoutResponse = {
  checkout_url: string | null;
};

type PortalResponse = {
  portal_url: string | null;
};

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function getErrorMessage(status: number, payload: unknown) {
  const fallback = `request failed (${status})`;
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

async function parseApiPayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: raw };
  }
}

export async function startStripeCheckoutAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fbilling");

  const rawPriceId = String(formData.get("priceId") ?? "").trim();
  const authHeaders = await getForwardAuthHeaders();
  const endpoint = new URL("/api/billing/stripe/checkout-session", getInternalApiOrigin()).toString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
        ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
      },
      body: JSON.stringify({ priceId: rawPriceId || undefined }),
    });

    const payload = (await parseApiPayload(response)) as CheckoutResponse | { error?: string } | null;
    if (!response.ok) {
      const message = getErrorMessage(response.status, payload);
      redirect(`/billing?error=${encodeURIComponent(message)}`);
    }

    const checkoutUrl = (payload as CheckoutResponse).checkout_url?.trim() || "";
    if (!checkoutUrl) {
      redirect(
        `/billing?error=${encodeURIComponent(
          "Checkout session created without a redirect URL.",
        )}`,
      );
    }

    redirect(checkoutUrl);
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unable to start checkout.";
    redirect(`/billing?error=${encodeURIComponent(message)}`);
  }
}

export async function openStripePortalAction() {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fbilling");

  const authHeaders = await getForwardAuthHeaders();
  const endpoint = new URL("/api/billing/stripe/portal-session", getInternalApiOrigin()).toString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
        ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
      },
    });

    const payload = (await parseApiPayload(response)) as PortalResponse | { error?: string } | null;
    if (!response.ok) {
      const message = getErrorMessage(response.status, payload);
      redirect(`/billing?error=${encodeURIComponent(message)}`);
    }

    const portalUrl = (payload as PortalResponse).portal_url?.trim() || "";
    if (!portalUrl) {
      redirect(
        `/billing?error=${encodeURIComponent(
          "Billing portal session created without a redirect URL.",
        )}`,
      );
    }

    redirect(portalUrl);
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unable to open billing portal.";
    redirect(`/billing?error=${encodeURIComponent(message)}`);
  }
}
