"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MotionReveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DismissibleNotice } from "@/components/ui/dismissible-notice";
import { Input } from "@/components/ui/input";
import {
  clearServerAuthSession,
  createSupabaseBrowserClient,
  isSupabaseBrowserConfigured,
} from "@/lib/supabase/browserClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setSessionReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!supabase || !isSupabaseBrowserConfigured()) {
      setError("Missing Supabase env config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    if (password.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Unable to update password.");
        return;
      }

      await clearServerAuthSession();
      await supabase.auth.signOut();
      setMessage("Password updated. Redirecting to sign in.");
      window.setTimeout(() => {
        router.push("/signin?reset=success");
      }, 1200);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:px-6">
      <MotionReveal>
        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">Set new password</CardTitle>
            <CardDescription>
              Use the reset link from your email, then choose a new password for your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sessionReady ? (
              <DismissibleNotice variant="neutral" className="p-4">
                Open this page from the password reset email. If the link expired, request a new reset from{" "}
                <Link href="/signin" className="link-hover font-medium text-foreground">
                  sign in
                </Link>
                .
              </DismissibleNotice>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="password">
                    New password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="confirmPassword">
                    Confirm password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    required
                    autoComplete="new-password"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
                    {loading ? <ButtonSpinner /> : null}
                    {loading ? "Saving..." : "Update password"}
                  </Button>
                  <Link href="/signin" className="link-hover text-sm">
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}

            {message ? <DismissibleNotice variant="success">{message}</DismissibleNotice> : null}
            {error ? <DismissibleNotice variant="error">{error}</DismissibleNotice> : null}
          </CardContent>
        </Card>
      </MotionReveal>
    </main>
  );
}
