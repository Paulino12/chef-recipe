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

function getPostSignInStatus(nextPath: string) {
  if (nextPath.startsWith("/owner")) {
    return "Opening the owner area...";
  }

  if (nextPath.startsWith("/profile")) {
    return "Opening your account...";
  }

  return "Opening your recipes...";
}

function getReadableSupabaseAuthError(error: { message?: string }) {
  const message = error.message?.trim() || "";
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage === "failed to fetch" ||
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("network")
  ) {
    return "Supabase Auth is unreachable from this browser. Check that NEXT_PUBLIC_SUPABASE_URL points to the resumed project and that DNS/network access to the Supabase project host is working.";
  }

  return message || "Failed to sign in";
}

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirectingMessage, setRedirectingMessage] = useState("");
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
    setRedirectingMessage("");

    if (!supabase || !isSupabaseBrowserConfigured()) {
      setError("Missing Supabase env config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);
    let shouldReleaseLoading = true;
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(getReadableSupabaseAuthError(signInError));
        return;
      }

      if (!data.session?.access_token) {
        setError("Sign in succeeded but no access token was returned.");
        return;
      }

      await syncServerAuthSession(data.session);
      const requestedNext = searchParams.get("next")?.trim() ?? "";
      const nextPath = requestedNext.startsWith("/") ? requestedNext : "/recipes";
      setRedirectingMessage(`Signed in successfully. ${getPostSignInStatus(nextPath)}`);
      shouldReleaseLoading = false;
      router.push(nextPath);
      router.refresh();
    } finally {
      if (shouldReleaseLoading) {
        setLoading(false);
      }
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
                  disabled={loading}
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
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
                  {loading ? <ButtonSpinner /> : null}
                  {redirectingMessage
                    ? "Opening..."
                    : loading
                      ? "Signing in..."
                      : "Sign in"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || recoveryLoading}
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
                    disabled={loading || resendLoading}
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

            {redirectingMessage ? (
              <div className="flex items-start gap-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
                <ButtonSpinner className="mt-0.5 h-4 w-4" />
                <div className="space-y-1">
                  <p className="font-medium">Sign-in complete</p>
                  <p>{redirectingMessage}</p>
                </div>
              </div>
            ) : null}
            {!redirectingMessage && message ? (
              <DismissibleNotice variant="success">{message}</DismissibleNotice>
            ) : null}
            {error ? <DismissibleNotice variant="error">{error}</DismissibleNotice> : null}
          </CardContent>
        </Card>
      </MotionReveal>
    </main>
  );
}
