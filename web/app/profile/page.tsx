import Link from "next/link";
import { redirect } from "next/navigation";

import { MotionReveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { isStripeConfigured } from "@/lib/api/stripe";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { pickFirstQueryParam } from "@/lib/searchParams";

import {
  openStripePortalFromProfileAction,
  sendPasswordResetAction,
  startStripeCheckoutFromProfileAction,
  updateProfileAction,
} from "./actions";

type ProfileSearchParams = {
  error?: string | string[];
  success?: string | string[];
};

function statusVariant(status: string | null) {
  if (status === "active" || status === "trialing") return "success" as const;
  if (status === "past_due" || status === "paused") return "secondary" as const;
  return "outline" as const;
}

function successMessage(code: string) {
  if (code === "profile_saved") return "Profile saved.";
  if (code === "password_reset_sent") return "Password reset email sent.";
  return "";
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<ProfileSearchParams>;
}) {
  const session = await getServerAccessSession();
  if (!session) redirect("/signin?next=%2Fprofile");

  const sp = await searchParams;
  const error = (pickFirstQueryParam(sp.error) ?? "").trim();
  const success = successMessage((pickFirstQueryParam(sp.success) ?? "").trim());

  const isOwner = session.user.role === "owner";
  const stripeConfigured = isStripeConfigured();
  const checkoutConfigured = stripeConfigured && Boolean(process.env.STRIPE_PUBLIC_PRICE_ID?.trim());
  const hasStripeSubscription = session.entitlements.has_stripe_subscription;
  const hasBillingCustomer = session.entitlements.has_billing_customer;
  const managedStripeStatus = hasStripeSubscription
    ? session.entitlements.subscription_status
    : null;
  const hasManagedStripePlan =
    managedStripeStatus === "trialing" ||
    managedStripeStatus === "active" ||
    managedStripeStatus === "past_due" ||
    managedStripeStatus === "paused";
  const canStartSubscription = !hasManagedStripePlan;
  const displayName = session.user.display_name ?? "";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <MotionReveal>
        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <Card className="surface-panel border-white/40">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Profile</Badge>
              <Badge variant="outline">{session.user.role}</Badge>
            </div>
            <CardTitle className="text-3xl">Account settings</CardTitle>
            <CardDescription>
              Update the display name shown in app surfaces and manage security actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={updateProfileAction} className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="display_name" className="block text-sm font-medium">
                  Display name
                </label>
                <Input
                  id="display_name"
                  name="display_name"
                  defaultValue={displayName}
                  maxLength={80}
                  placeholder="How your name appears in the app"
                />
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Email: {session.user.email}</p>
                <p>Public access: {session.entitlements.can_view_public ? "enabled" : "disabled"}</p>
                <p>Enterprise access: {session.entitlements.can_view_enterprise ? "enabled" : "disabled"}</p>
              </div>

              <FormSubmitButton pendingText="Saving...">Save profile</FormSubmitButton>
            </form>

            <form action={sendPasswordResetAction}>
              <FormSubmitButton type="submit" variant="outline" pendingText="Sending...">
                Send password reset email
              </FormSubmitButton>
            </form>

            {success ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                {success}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
            ) : null}
          </CardContent>
        </Card>

        {isOwner ? (
          <MotionReveal delay={0.08}>
            <Card className="surface-panel border-white/40">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Owner Access</Badge>
              </div>
              <CardTitle className="text-2xl">No subscription required</CardTitle>
              <CardDescription>
                Owner accounts have full public and enterprise recipe access by role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                Subscriber billing plans do not apply to owner accounts.
              </div>
              <Link href="/owner" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open owner area
              </Link>
              <Link href="/recipes" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Go to recipes
              </Link>
            </CardContent>
            </Card>
          </MotionReveal>
        ) : (
          <MotionReveal delay={0.08}>
            <Card className="surface-panel border-white/40">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Billing</Badge>
                <Badge variant={statusVariant(session.entitlements.subscription_status)}>
                  Status: {session.entitlements.subscription_status ?? "none"}
                </Badge>
              </div>
              <CardTitle className="text-2xl">Public recipes plan</CardTitle>
              <CardDescription>
                GBP 4.95 / month after 3-day free trial. Cancel anytime, including during trial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                Enterprise access is owner-granted and not part of the paid public subscription.
              </div>

              {!stripeConfigured ? (
                <p className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
                  Stripe configuration is incomplete. Set `STRIPE_SECRET_KEY`.
                </p>
              ) : (
                <>
                  {!checkoutConfigured && canStartSubscription ? (
                    <p className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
                      Stripe checkout is not fully configured. Set `STRIPE_PUBLIC_PRICE_ID`.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {canStartSubscription && checkoutConfigured ? (
                      <form action={startStripeCheckoutFromProfileAction}>
                        <FormSubmitButton pendingText="Redirecting...">
                          Start subscription
                        </FormSubmitButton>
                      </form>
                    ) : null}
                    {hasBillingCustomer ? (
                      <form action={openStripePortalFromProfileAction}>
                        <FormSubmitButton variant="outline" pendingText="Opening...">
                          Manage billing
                        </FormSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </>
              )}

              <Link href="/recipes" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Go to recipes
              </Link>
            </CardContent>
            </Card>
          </MotionReveal>
        )}
        </section>
      </MotionReveal>
    </main>
  );
}
