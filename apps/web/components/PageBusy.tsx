export function PageBusy({ label }: { label: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-veda-200 border-t-veda-700"
        aria-hidden
      />
      <p className="mt-4 text-sm text-foreground/70" role="status">
        {label}
      </p>
    </div>
  );
}
