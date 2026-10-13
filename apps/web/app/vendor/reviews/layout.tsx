import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vendor reviews" };

export default function VendorReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
