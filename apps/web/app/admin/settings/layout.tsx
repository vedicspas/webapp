import type { Metadata } from "next";

export const metadata: Metadata = { title: "Site settings" };

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
