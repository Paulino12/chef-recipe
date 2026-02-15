"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side sign-out used by the global header.
 * We clear auth cookies used by this app's server auth resolution and go home.
 */
export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.set("sb-access-token", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  cookieStore.set("sb-refresh-token", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });

  redirect("/");
}
