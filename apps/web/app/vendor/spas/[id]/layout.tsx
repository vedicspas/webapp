import type { Metadata } from "next";

export const metadata: Metadata = { title: "Spa listing" };

export default function VendorSpaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
