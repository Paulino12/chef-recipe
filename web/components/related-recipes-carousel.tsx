"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

type RelatedRecipeCarouselItem = {
  id: string;
  title: string;
  imageUrl?: string;
  categoryLabel: string;
  pluNumber: number;
  href: string;
  reasonLabel: string;
};

type RelatedRecipesCarouselProps = {
  items: RelatedRecipeCarouselItem[];
  className?: string;
};

export function RelatedRecipesCarousel({
  items,
  className,
}: RelatedRecipesCarouselProps) {
  return (
    <Card className={cn("mt-6 print:hidden", className)}>
      <Carousel
        opts={{
          align: "start",
          slidesToScroll: 1,
          containScroll: "trimSnaps",
        }}
      >
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              Similar recipes in: {items[0].categoryLabel}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative px-14 sm:px-16">
          <CarouselPrevious className="left-1 top-1/2 z-20 -translate-y-1/2" />
          <CarouselNext className="right-1 top-1/2 z-20 -translate-y-1/2" />
          <CarouselContent className="items-stretch">
            {items.map((item) => (
              <CarouselItem
                key={item.id}
                className="flex basis-full md:basis-1/2 xl:basis-1/3"
              >
                <Link href={item.href} className="group flex h-full w-full">
                  <Card className="flex h-full w-full flex-col overflow-hidden border-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-lg">
                    <div className="overflow-hidden border-b border-border/60 bg-muted/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          (item.imageUrl ?? "/recipe-placeholder.svg").trim() ||
                          "/recipe-placeholder.svg"
                        }
                        alt={item.title}
                        loading="lazy"
                        className="h-28 w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                      />
                    </div>
                    <CardContent className="flex flex-1 flex-col space-y-2 p-4">
                      {item.reasonLabel !== "Same category" ? (
                        <Badge variant="outline" className="text-[11px]">
                          {item.reasonLabel}
                        </Badge>
                      ) : null}
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                        {item.title}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {item.categoryLabel}
                      </p>
                      <p className="mt-auto text-xs text-muted-foreground">
                        RN {item.pluNumber}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
        </CardContent>
      </Carousel>
    </Card>
  );
}
