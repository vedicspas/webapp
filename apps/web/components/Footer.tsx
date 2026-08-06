import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 bg-veda-950 text-veda-200">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="mb-2 text-base font-semibold text-white">VedaFinder</p>
          <p>
            Discover, review and book authentic Ayurvedic spas, panchakarma centers and wellness
            retreats around the world.
          </p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">Explore</p>
          <ul className="space-y-1">
            <li><Link href="/spas" className="hover:text-white">All spas</Link></li>
            <li><Link href="/spas?sort=rating" className="hover:text-white">Top rated</Link></li>
            <li><Link href="/wishlist" className="hover:text-white">Your wishlist</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">For spa owners</p>
          <ul className="space-y-1">
            <li><Link href="/vendor" className="hover:text-white">Vendor dashboard</Link></li>
            <li><Link href="/vendor/register" className="hover:text-white">List your spa</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-xs text-veda-400">
        &copy; {new Date().getFullYear()} VedaFinder
      </p>
    </footer>
  );
}
