import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { api, ApiError } from "@/lib/api";
import { RatingStars } from "@/components/RatingStars";
import { UserAvatar } from "@/components/UserAvatar";
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
    email?: string;
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

async function loadProfile(username: string, token?: string): Promise<Profile> {
  try {
    return await api<Profile>(`/users/${username}`, {
      ...(token ? { token, revalidate: false } : { revalidate: 120 }),
    });
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
  const session = await auth();
  const isOwner = session?.appUser?.username === username;
  const profile = await loadProfile(username, isOwner ? session?.apiToken : undefined);
  const email = profile.user.email ?? (isOwner ? session?.appUser?.email : undefined);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-4">
        <UserAvatar name={profile.user.name} src={profile.user.avatarUrl} size={72} />
        <div>
          <h1 className="text-2xl font-bold text-veda-900">{profile.user.name}</h1>
          <p className="text-sm text-foreground/60">
            @{profile.user.username} &middot; member since {shortDate(profile.user.createdAt)}
          </p>
          {email ? <p className="mt-1 text-sm text-foreground/70">{email}</p> : null}
          {isOwner ? (
            <Link
              href={`/profile/${profile.user.username}/edit`}
              className="mt-2 inline-block text-sm font-medium text-veda-700 hover:underline"
            >
              Edit basic info
            </Link>
          ) : null}
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
