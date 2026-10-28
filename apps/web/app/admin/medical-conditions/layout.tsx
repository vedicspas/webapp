import type { Metadata } from "next";

export const metadata: Metadata = { title: "Medical conditions" };

export default function AdminMedicalConditionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
