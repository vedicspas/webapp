"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { compressImageForUpload } from "@/lib/compressImage";
import { resolvePhotoSrc } from "@/components/RemotePhoto";

export default function EditProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { call, authStatus } = useApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const user = session?.appUser;
  const isOwner = Boolean(user && user.username === username);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace(`/auth/signin?callbackUrl=/profile/${username}/edit`);
    }
  }, [authStatus, router, username]);

  useEffect(() => {
    if (!user || !isOwner) return;
    setName(user.name);
    setEmail(user.email);
    setPreview(user.avatarUrl);
  }, [isOwner, user]);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    e.target.value = "";
    if (!next) return;
    setError(null);
    if (next.size > 15 * 1024 * 1024) {
      setError("Profile photo is too large");
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    setBusy(true);
    setError(null);
    try {
      const data = new FormData();
      data.append("name", name.trim());
      if (file) {
        const compressed = await compressImageForUpload(file);
        data.append("avatar", compressed, compressed.name);
      }
      const result = await call<{ user: SessionUser }>("/users/me", { method: "PATCH", body: data });
      await update({ appUser: result.user });
      router.push(`/profile/${result.user.username}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile");
      setBusy(false);
    }
  }

  if (status === "loading" || authStatus === "loading") {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">Loading&hellip;</div>;
  }

  if (status === "authenticated" && user && !isOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-foreground/70">You can only edit your own profile.</p>
        <Link href={`/profile/${user.username}`} className="mt-3 inline-block text-sm text-veda-700 hover:underline">
          Go to your profile
        </Link>
      </div>
    );
  }

  if (!isOwner) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">Loading&hellip;</div>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Edit basic info</h1>
      <p className="mt-1 text-sm text-foreground/60">Update your name and profile photo. Email cannot be changed yet.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div className="flex items-center gap-4">
          <span className="relative inline-grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-veda-100 text-2xl font-medium text-veda-700">
            {preview ? (
              // Preview can be a blob URL; keep object-cover so it matches the circular crop.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.startsWith("blob:") ? preview : resolvePhotoSrc(preview)} alt="" className="h-full w-full object-cover" />
            ) : (
              (name.trim()[0] ?? "?").toUpperCase()
            )}
          </span>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-veda-300 px-4 py-2 text-sm font-medium text-veda-800 hover:bg-veda-50"
            >
              {preview ? "Change photo" : "Add photo"}
            </button>
            <p className="mt-1 text-xs text-foreground/50">JPEG, PNG, or WebP. We compress it before saving.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onPick}
            />
          </div>
        </div>

        <label className="block text-sm font-medium text-veda-900">
          Name
          <input
            required
            minLength={1}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm outline-none focus:border-veda-500"
          />
        </label>

        <label className="block text-sm font-medium text-veda-900">
          Email
          <input
            value={email}
            readOnly
            disabled
            className="mt-1 w-full rounded-lg border border-veda-100 bg-veda-50 px-3 py-2.5 text-sm text-foreground/70"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-full bg-veda-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-50"
          >
            {busy ? "Saving\u2026" : "Save"}
          </button>
          <Link href={`/profile/${username}`} className="text-sm text-foreground/60 hover:text-veda-800">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
