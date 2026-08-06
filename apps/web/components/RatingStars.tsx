export function RatingStars({
  rating,
  count,
  size = "sm",
}: {
  rating: number;
  count?: number;
  size?: "sm" | "lg";
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${size === "lg" ? "text-base" : "text-sm"}`}>
      <span aria-hidden className="text-turmeric-500 tracking-tight">
        {Array.from({ length: 5 }, (_, i) => (i < Math.round(rating) ? "\u2605" : "\u2606")).join("")}
      </span>
      <span className="font-medium">{rating > 0 ? rating.toFixed(1) : "New"}</span>
      {count !== undefined && count > 0 ? (
        <span className="text-foreground/60">({count})</span>
      ) : null}
    </span>
  );
}
