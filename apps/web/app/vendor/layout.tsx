import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vendor dashboard" };

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
