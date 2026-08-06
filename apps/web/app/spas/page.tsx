import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchResults } from "@/components/SearchResults";

export const metadata: Metadata = { title: "Find Ayurvedic spas & retreats" };

export default function SpasPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10">Loading&hellip;</div>}>
      <SearchResults />
    </Suspense>
  );
}
