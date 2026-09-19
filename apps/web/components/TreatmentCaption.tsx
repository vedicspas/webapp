export function TreatmentCaption({
  name,
  categoryName,
  className = "",
}: {
  name: string;
  categoryName?: string | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {name}
      {categoryName ? (
        <>
          {" - "}
          <span className="text-foreground/50">{categoryName}</span>
        </>
      ) : null}
    </span>
  );
}
