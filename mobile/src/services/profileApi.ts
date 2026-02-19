import { getJson, patchJson, postJson } from "../lib/http";
import { PasswordResetResponse, UpdateProfileResponse, UserProfile } from "../types/profile";

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchProfile(accessToken: string, signal?: AbortSignal): Promise<UserProfile> {
  return getJson<UserProfile>("/api/me/profile", {
    signal,
    headers: authHeaders(accessToken),
  });
}

export async function updateProfileDisplayName(
  accessToken: string,
  displayName: string | null,
): Promise<UpdateProfileResponse> {
  return patchJson<UpdateProfileResponse>(
    "/api/me/profile",
    {
      display_name: displayName,
    },
    {
      headers: authHeaders(accessToken),
    },
  );
}

export async function sendPasswordResetEmail(
  accessToken: string,
): Promise<PasswordResetResponse> {
  return postJson<PasswordResetResponse>(
    "/api/me/password/reset",
    {},
    {
      headers: authHeaders(accessToken),
    },
  );
}
