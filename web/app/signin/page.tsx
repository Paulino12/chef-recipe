"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/**
 * Minimal bridge for server-side auth resolution:
 * server routes read `sb-access-token` from cookies via `getCurrentUserFromRequest`.
 */
function setAccessTokenCookie(token: string) {
  document.cookie = `sb-access-token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => {
    // Client-side sign-in/out only; role access checks still happen on server APIs/pages.
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }, []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!supabase) {
      setError("Missing Supabase env config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Failed to sign in");
        return;
      }

      const token = data.session?.access_token;
      if (!token) {
        setError("Sign in succeeded but no access token was returned.");
        return;
      }

      setAccessTokenCookie(token);
      setMessage("Signed in successfully.");
      const requestedNext = searchParams.get("next")?.trim() ?? "";
      const nextPath = requestedNext.startsWith("/") ? requestedNext : "/";
      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:px-6">
      <Card className="surface-panel border-white/40">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl">Sign In</CardTitle>
          <CardDescription>
            Use your Supabase user credentials to access owner/subscriber API flows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
                autoComplete="current-password"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <Link href="/signup" className="inline-flex items-center text-sm underline-offset-4 hover:underline">
                Create account
              </Link>
              <Link href="/" className="inline-flex items-center text-sm underline-offset-4 hover:underline">
                Back to home
              </Link>
            </div>
          </form>

          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
