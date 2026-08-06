import Link from "next/link";
import { getMetaSafe, searchSpas } from "@/lib/api";
import { SpaCard } from "@/components/SpaCard";
import { HomeSearchBar } from "@/components/HomeSearchBar";

// Fully prerendered at build time, refreshed in the background every 5 minutes.
export const revalidate = 300;

export default async function HomePage() {
  const meta = await getMetaSafe();
  const featured = await searchSpas("sort=rating&page=1").catch(() => ({
    items: [] as Awaited<ReturnType<typeof searchSpas>>["items"],
    page: 1,
    pageSize: 12,
    total: 0,
  }));

  return (
    <div>
      <section className="bg-veda-800 px-4 pb-16 pt-12 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
            Find your place to heal
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-veda-100 sm:text-lg">
            Authentic Ayurvedic spas, panchakarma centers and wellness retreats — reviewed by
            travelers, bookable in minutes.
          </p>
          <div className="mt-6">
            <HomeSearchBar />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="mb-4 text-xl font-semibold text-veda-900">Popular destinations</h2>
        <div className="flex flex-wrap gap-2">
          {meta.cities.map((city) => (
            <Link
              key={city.id}
              href={`/spas?cityId=${city.id}`}
              className="rounded-full border border-veda-200 bg-white px-4 py-1.5 text-sm text-veda-800 shadow-sm hover:border-veda-400 hover:bg-veda-50"
            >
              {city.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <h2 className="mb-4 text-xl font-semibold text-veda-900">Treatments &amp; programs</h2>
        <div className="flex flex-wrap gap-2">
          {meta.treatmentCategories.map((cat) => (
            <Link
              key={cat.id}
              href={`/spas?categoryId=${cat.id}`}
              className="rounded-full bg-turmeric-100 px-4 py-1.5 text-sm text-turmeric-800 hover:bg-turmeric-200"
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-veda-900">Top rated centers</h2>
          <Link href="/spas" className="text-sm text-veda-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.items.slice(0, 6).map((spa) => (
            <SpaCard key={spa.id} spa={spa} />
          ))}
        </div>
      </section>
    </div>
  );
}
