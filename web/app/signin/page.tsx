"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MotionReveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DismissibleNotice } from "@/components/ui/dismissible-notice";
import { Input } from "@/components/ui/input";
import {
  buildBrowserRedirectUrl,
  clearServerAuthSession,
  createSupabaseBrowserClient,
  isSupabaseBrowserConfigured,
  syncServerAuthSession,
} from "@/lib/supabase/browserClient";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const confirmed = searchParams.get("confirmed") === "1";
  const resetStatus = (searchParams.get("reset") ?? "").trim();
  const showResendConfirmation = confirmed;

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!supabase || !isSupabaseBrowserConfigured()) {
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

      if (!data.session?.access_token) {
        setError("Sign in succeeded but no access token was returned.");
        return;
      }

      await syncServerAuthSession(data.session);
      setMessage("Signed in successfully.");
      const requestedNext = searchParams.get("next")?.trim() ?? "";
      const nextPath = requestedNext.startsWith("/") ? requestedNext : "/";
      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMessage("");
    setError("");

    if (!supabase || !isSupabaseBrowserConfigured()) {
      setError("Missing Supabase env config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email address first, then request a password reset.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: buildBrowserRedirectUrl("/reset-password"),
      });
      if (resetError) {
        setError(resetError.message || "Failed to send password reset email");
        return;
      }
      await clearServerAuthSession();
      setMessage("Password reset email sent. Check your inbox for the secure reset link.");
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleResendConfirmation() {
    setMessage("");
    setError("");

    if (!supabase || !isSupabaseBrowserConfigured()) {
      setError("Missing Supabase env config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email address first, then resend the confirmation email.");
      return;
    }

    setResendLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: buildBrowserRedirectUrl("/signin?confirmed=1"),
        },
      });
      if (resendError) {
        setError(resendError.message || "Failed to resend confirmation email");
        return;
      }
      setMessage("Confirmation email sent again. Use the latest email to verify your account.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:px-6">
      <MotionReveal>
        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">Sign In</CardTitle>
            <CardDescription>
              Use your verified email and password to access thousands of recipes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {confirmed ? (
              <DismissibleNotice variant="success" clearQueryKeys={["confirmed"]}>
                Email confirmed. You can sign in now.
              </DismissibleNotice>
            ) : null}
            {resetStatus === "success" ? (
              <DismissibleNotice variant="success" clearQueryKeys={["reset"]}>
                Password updated. Sign in with your new password.
              </DismissibleNotice>
            ) : null}
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
                <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
                  {loading ? <ButtonSpinner /> : null}
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={recoveryLoading}
                  aria-busy={recoveryLoading || undefined}
                  onClick={handleForgotPassword}
                >
                  {recoveryLoading ? <ButtonSpinner /> : null}
                  {recoveryLoading ? "Sending reset..." : "Forgot password?"}
                </Button>
                {showResendConfirmation ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={resendLoading}
                    aria-busy={resendLoading || undefined}
                    onClick={handleResendConfirmation}
                  >
                    {resendLoading ? <ButtonSpinner /> : null}
                    {resendLoading ? "Resending..." : "Resend confirmation"}
                  </Button>
                ) : null}
                <Link href="/signup" className="link-hover text-sm">
                  Create account
                </Link>
              </div>
            </form>

            {message ? <DismissibleNotice variant="success">{message}</DismissibleNotice> : null}
            {error ? <DismissibleNotice variant="error">{error}</DismissibleNotice> : null}
          </CardContent>
        </Card>
      </MotionReveal>
    </main>
  );
}
