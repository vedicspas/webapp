import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getMetaSafe } from "@/lib/api";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VedaFinder - Ayurvedic Spas & Health Centers",
    template: "%s | VedaFinder",
  },
  description:
    "Discover, review and book authentic Ayurvedic spas, panchakarma centers and wellness retreats around the world.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const meta = await getMetaSafe();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers meta={meta}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
