import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const publicAppBaseUrl =
  process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ??
  process.env.APP_BASE_URL?.trim() ??
  "";

export function isSupabaseBrowserConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function createSupabaseBrowserClient() {
  if (!isSupabaseBrowserConfigured()) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function buildBrowserRedirectUrl(pathname: string) {
  if (publicAppBaseUrl) {
    return new URL(pathname, publicAppBaseUrl).toString();
  }

  if (typeof window === "undefined") return pathname;
  return new URL(pathname, window.location.origin).toString();
}

export async function syncServerAuthSession(session: Session) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
    }),
  });

  if (!response.ok) {
    let message = `Unable to persist session (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) {
        message = data.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
}

export async function clearServerAuthSession() {
  await fetch("/api/auth/session", {
    method: "DELETE",
  });
}
