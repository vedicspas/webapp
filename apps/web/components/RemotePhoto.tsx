/** Vendor-supplied image URLs, including locally stored `/uploads/...` files. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export function resolvePhotoSrc(src: string): string {
  if (src.startsWith("/uploads/")) return `${API_URL}${src}`;
  return src;
}

export function RemotePhoto({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolvePhotoSrc(src)} alt={alt} className={className} />
  );
}
