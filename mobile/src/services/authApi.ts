import { env } from "../config/env";

type SupabaseTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

type SupabaseSignUpResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string | null;
  } | null;
};

export type SignUpResult = {
  accessToken: string | null;
  requiresEmailConfirmation: boolean;
};

function requireSupabaseConfig() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase mobile auth config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.",
    );
  }
}

function buildSupabaseHeaders() {
  return {
    apikey: env.supabaseAnonKey,
    authorization: `Bearer ${env.supabaseAnonKey}`,
    "content-type": "application/json",
  };
}

async function parseSupabaseError(response: Response) {
  let message = `Auth request failed (${response.status})`;
  try {
    const payload = (await response.json()) as {
      error_description?: string;
      msg?: string;
      error?: string;
      message?: string;
    };
    message =
      payload.error_description?.trim() ||
      payload.msg?.trim() ||
      payload.message?.trim() ||
      payload.error?.trim() ||
      message;
  } catch {
    // Keep fallback message.
  }

  return message;
}

export async function signInWithPassword(email: string, password: string): Promise<string> {
  requireSupabaseConfig();

  const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: buildSupabaseHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }

  const payload = (await response.json()) as SupabaseTokenResponse;
  const accessToken = payload.access_token?.trim() ?? "";
  if (!accessToken) {
    throw new Error("Sign in succeeded but access token is missing.");
  }

  return accessToken;
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  requireSupabaseConfig();

  const response = await fetch(`${env.supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: buildSupabaseHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }

  const payload = (await response.json()) as SupabaseSignUpResponse;
  const accessToken = payload.access_token?.trim() ?? null;

  return {
    accessToken,
    requiresEmailConfirmation: !accessToken,
  };
}
