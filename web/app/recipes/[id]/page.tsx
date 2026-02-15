import Link from "next/link";
import { redirect } from "next/navigation";
import { PortableText } from "next-sanity";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRecipeById } from "@/lib/recipes";
import { getServerAccessSession } from "@/lib/api/serverSession";
import { cn } from "@/lib/utils";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Direct recipe links also require authentication.
  const session = await getServerAccessSession();
  if (!session) {
    redirect(`/signin?next=${encodeURIComponent(`/recipes/${id}`)}`);
  }

  const recipe = await getRecipeById(id);

  if (!recipe) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle>Recipe not found</CardTitle>
            <CardDescription>
              The recipe may have been removed or the link may be invalid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/recipes" className={buttonVariants({ variant: "outline" })}>
              Back to recipes
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const method = recipe.method as unknown as
    | Array<{ _type?: string; [key: string]: unknown }>
    | { steps?: Array<{ number?: number; text?: string }>; text?: string };

  const portionWeight =
    recipe.portionNetWeightG ?? recipe.nutrition?.portionNetWeightG ?? null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <Link
        href="/recipes"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4")}
      >
        Back to list
      </Link>

      <Card className="surface-panel mb-6 border-white/40">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={recipe.visibility?.public ? "success" : "outline"}>
              Public {recipe.visibility?.public ? "ON" : "OFF"}
            </Badge>
            <Badge
              variant={recipe.visibility?.enterprise ? "secondary" : "outline"}
            >
              Enterprise {recipe.visibility?.enterprise ? "ON" : "OFF"}
            </Badge>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl">{recipe.title}</CardTitle>
            <CardDescription>
              {recipe.categoryPath?.join(" / ") || "Uncategorised"} | PLU{" "}
              {recipe.pluNumber}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Portions
            </p>
            <p className="mt-1 text-lg font-semibold">
              {recipe.portions ?? "-"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Portion Weight
            </p>
            <p className="mt-1 text-lg font-semibold">
              {portionWeight ? `${portionWeight} g` : "-"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Category
            </p>
            <p className="mt-1 text-sm font-medium">
              {recipe.categoryPath?.[0] ?? "Uncategorised"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Ingredients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recipe.ingredients?.length ? (
              <ul className="space-y-2">
                {recipe.ingredients.map(
                  (ingredient: Record<string, unknown>, index: number) => {
                    const amount =
                      ingredient.qty != null
                        ? `${ingredient.qty}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
                        : null;
                    return (
                      <li
                        key={`${ingredient.text}-${index}`}
                        className="rounded-md border border-border/70 bg-background/70 p-3 text-sm"
                      >
                        <p className="font-medium">
                          {String(ingredient.text) || ""}
                        </p>
                      </li>
                    );
                  },
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No ingredients listed for this recipe.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            {Array.isArray(method) ? (
              <PortableText
                value={
                  method as Array<{ _type: string; [key: string]: unknown }>
                }
                components={{
                  list: {
                    bullet: ({ children }) => (
                      <ul className="list-disc space-y-2 pl-6">{children}</ul>
                    ),
                    number: ({ children }) => (
                      <ol className="list-decimal space-y-2 pl-6">
                        {children}
                      </ol>
                    ),
                  },
                  listItem: {
                    bullet: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                    number: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                  },
                }}
              />
            ) : method.steps?.length ? (
              <ol className="space-y-3">
                {method.steps.map((step, index) => (
                  <li
                    key={`step-${index}`}
                    className="rounded-md border border-border/70 bg-background/60 p-3 text-sm"
                  >
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Step {step.number ?? index + 1}
                    </span>
                    <p>{step.text ?? ""}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {method.text || "No method provided."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
