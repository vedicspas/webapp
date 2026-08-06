"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HomeSearchBar() {
  const [q, setQ] = useState("");
  const router = useRouter();

  return (
    <form
      className="mx-auto flex max-w-xl overflow-hidden rounded-full bg-white shadow-lg"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q ? `/spas?q=${encodeURIComponent(q)}` : "/spas");
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search spas, treatments, destinations..."
        className="w-full px-5 py-3.5 text-veda-900 outline-none"
      />
      <button
        type="submit"
        className="shrink-0 bg-turmeric-400 px-6 font-medium text-veda-900 hover:bg-turmeric-300"
      >
        Search
      </button>
    </form>
  );
}
