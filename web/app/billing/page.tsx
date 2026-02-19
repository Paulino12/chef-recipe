import { redirect } from "next/navigation";
import { pickFirstQueryParam } from "@/lib/searchParams";

type BillingSearchParams = {
  error?: string | string[];
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<BillingSearchParams>;
}) {
  // Billing controls now live in /profile.
  const sp = await searchParams;
  const error = (pickFirstQueryParam(sp.error) ?? "").trim();
  if (error) {
    redirect(`/profile?error=${encodeURIComponent(error)}`);
  }
  redirect("/profile");
}
