import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RatingStars } from "@/components/RatingStars";
import { shortDate } from "@/lib/format";

export const revalidate = 120;

interface Profile {
  user: {
    id: number;
    username: string;
    name: string;
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
  };
  reviews: {
    id: number;
    rating: number;
    title: string;
    body: string;
    createdAt: string;
    spaName: string;
    spaSlug: string;
  }[];
}

async function loadProfile(username: string): Promise<Profile> {
  try {
    return await api<Profile>(`/users/${username}`, { revalidate: 120 });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/profile/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: PageProps<"/profile/[username]">) {
  const { username } = await params;
  const profile = await loadProfile(username);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-4">
        {profile.user.avatarUrl ? (
          <Image
            src={profile.user.avatarUrl}
            alt=""
            width={72}
            height={72}
            className="rounded-full"
          />
        ) : (
          <span className="grid h-18 w-18 place-items-center rounded-full bg-veda-100 text-2xl text-veda-700">
            {profile.user.name[0]}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-veda-900">{profile.user.name}</h1>
          <p className="text-sm text-foreground/60">
            @{profile.user.username} &middot; member since {shortDate(profile.user.createdAt)}
          </p>
        </div>
      </div>

      {profile.user.bio ? <p className="mt-4 text-foreground/80">{profile.user.bio}</p> : null}

      <h2 className="mt-8 text-lg font-semibold text-veda-900">
        Reviews ({profile.reviews.length})
      </h2>
      <div className="mt-3 space-y-4">
        {profile.reviews.length === 0 ? (
          <p className="text-sm text-foreground/60">No reviews yet.</p>
        ) : null}
        {profile.reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-veda-100 bg-white p-4">
            <Link
              href={`/spas/${review.spaSlug}`}
              className="text-sm font-medium text-veda-600 hover:underline"
            >
              {review.spaName}
            </Link>
            <div className="mt-1">
              <RatingStars rating={review.rating} />
            </div>
            <h3 className="mt-1 font-medium text-veda-900">{review.title}</h3>
            <p className="mt-1 text-sm text-foreground/80">{review.body}</p>
            <p className="mt-2 text-xs text-foreground/50">{shortDate(review.createdAt)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
