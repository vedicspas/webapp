"use client";

const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

export function PaginationBar({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (total === 0 && !onPageSize) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-foreground/60">
        Page {page} of {totalPages} &middot; {total} result{total === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSize ? (
          <label className="flex items-center gap-2 text-foreground/70">
            Per page
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-lg border border-veda-200 bg-white px-2 py-1"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {totalPages > 1 ? (
          <>
            <button
              type="button"
              disabled={page <= 1}
              className="rounded-full border border-veda-300 px-4 py-1.5 disabled:opacity-40"
              onClick={() => onPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              className="rounded-full border border-veda-300 px-4 py-1.5 disabled:opacity-40"
              onClick={() => onPage(page + 1)}
            >
              Next
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
