import { resolvePhotoSrc } from "@/components/RemotePhoto";

export function UserAvatar({
  name,
  src,
  size,
  className = "",
}: {
  name: string;
  src?: string | null;
  size: number;
  className?: string;
}) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-veda-100 font-medium text-veda-700 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {src ? (
        // User photos are already compressed; load from the API so Docker/local hosts work.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolvePhotoSrc(src)} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
