import type { Metadata } from "next";

export const metadata: Metadata = { title: "List a spa" };

export default function ListSpaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
