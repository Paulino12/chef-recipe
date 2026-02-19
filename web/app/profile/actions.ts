"use server";

import { redirect } from "next/navigation";

import { getInternalApiOrigin } from "@/lib/api/origin";
import { getForwardAuthHeaders, getServerAccessSession } from "@/lib/api/serverSession";

type ErrorPayload = { error?: string };
type CheckoutPayload = { checkout_url: string | null };
type PortalPayload = { portal_url: string | null };

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function getErrorMessage(status: number, payload: unknown) {
  const fallback = `request failed (${status})`;
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as ErrorPayload).error;
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

export async function updateProfileAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fprofile");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const authHeaders = await getForwardAuthHeaders();
  const endpoint = new URL("/api/me/profile", getInternalApiOrigin()).toString();

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
        ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
      },
      body: JSON.stringify({ display_name: displayName || null }),
    });

    const payload = await parseApiPayload(response);
    if (!response.ok) {
      const message = getErrorMessage(response.status, payload);
      redirect(`/profile?error=${encodeURIComponent(message)}`);
    }

    redirect("/profile?success=profile_saved");
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unable to update profile.";
    redirect(`/profile?error=${encodeURIComponent(message)}`);
  }
}

export async function sendPasswordResetAction() {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fprofile");

  const authHeaders = await getForwardAuthHeaders();
  const endpoint = new URL("/api/me/password/reset", getInternalApiOrigin()).toString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        ...(authHeaders.cookie ? { cookie: authHeaders.cookie } : {}),
        ...(authHeaders.authorization ? { authorization: authHeaders.authorization } : {}),
      },
    });
    const payload = await parseApiPayload(response);
    if (!response.ok) {
      const message = getErrorMessage(response.status, payload);
      redirect(`/profile?error=${encodeURIComponent(message)}`);
    }

    redirect("/profile?success=password_reset_sent");
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unable to send password reset.";
    redirect(`/profile?error=${encodeURIComponent(message)}`);
  }
}

export async function startStripeCheckoutFromProfileAction(formData: FormData) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fprofile");

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

    const payload = (await parseApiPayload(response)) as CheckoutPayload | ErrorPayload | null;
    if (!response.ok) {
      const message = getErrorMessage(response.status, payload);
      redirect(`/profile?error=${encodeURIComponent(message)}`);
    }

    const checkoutUrl = (payload as CheckoutPayload).checkout_url?.trim() || "";
    if (!checkoutUrl) {
      redirect(`/profile?error=${encodeURIComponent("Checkout URL was not returned by Stripe.")}`);
    }

    redirect(checkoutUrl);
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unable to start checkout.";
    redirect(`/profile?error=${encodeURIComponent(message)}`);
  }
}

export async function openStripePortalFromProfileAction() {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fprofile");

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

    const payload = (await parseApiPayload(response)) as PortalPayload | ErrorPayload | null;
    if (!response.ok) {
      const message = getErrorMessage(response.status, payload);
      redirect(`/profile?error=${encodeURIComponent(message)}`);
    }

    const portalUrl = (payload as PortalPayload).portal_url?.trim() || "";
    if (!portalUrl) {
      redirect(`/profile?error=${encodeURIComponent("Stripe billing portal URL was not returned.")}`);
    }

    redirect(portalUrl);
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unable to open billing portal.";
    redirect(`/profile?error=${encodeURIComponent(message)}`);
  }
}
