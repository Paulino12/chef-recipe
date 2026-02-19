import { cn } from "@/lib/utils";

export function FavoriteStarIcon({
  filled,
  size = 72,
  className,
}: {
  filled: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, minWidth: size, minHeight: size, flexShrink: 0 }}
      className={cn(
        "block shrink-0 transition-colors cursor-pointer",
        filled ? "fill-amber-400 stroke-amber-500" : "fill-transparent stroke-current",
        className,
      )}
    >
      <path
        d="M12 3.25l2.71 5.5 6.07.88-4.39 4.28 1.04 6.04L12 17.1 6.57 19.95l1.04-6.04-4.39-4.28 6.07-.88L12 3.25z"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
