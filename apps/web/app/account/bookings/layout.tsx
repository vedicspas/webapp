import type { Metadata } from "next";

export const metadata: Metadata = { title: "My bookings" };

export default function AccountBookingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
