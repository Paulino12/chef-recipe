"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MotionReveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildBrowserRedirectUrl,
  createSupabaseBrowserClient,
  isSupabaseBrowserConfigured,
  syncServerAuthSession,
} from "@/lib/supabase/browserClient";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!supabase || !isSupabaseBrowserConfigured()) {
      setError(
        "Missing Supabase env config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: buildBrowserRedirectUrl("/signin?confirmed=1"),
        },
      });

      if (signUpError) {
        setError(signUpError.message || "Failed to sign up");
        return;
      }

      if (data.session?.access_token) {
        await syncServerAuthSession(data.session);
        setMessage("Account created and signed in.");
        router.push("/recipes");
        router.refresh();
        return;
      }

      setMessage(
        "Account created. Check your email to confirm your address, then return here to sign in.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:px-6">
      <MotionReveal>
        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">Create Account</CardTitle>
            <CardDescription>
              Start as a subscriber. We will email you a confirmation link
              before the account is fully active.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSignUp} className="space-y-4">
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
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create account"}
                </Button>
                <Link href="/signin" className="link-hover text-sm">
                  Already have an account?
                </Link>
              </div>
            </form>

            {message ? (
              <p className="text-sm text-emerald-700">{message}</p>
            ) : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </CardContent>
        </Card>
      </MotionReveal>
    </main>
  );
}
