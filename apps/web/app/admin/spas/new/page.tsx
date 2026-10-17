"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { useMetaStore } from "@/stores/metaStore";
import { toast } from "@/stores/toastStore";

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export default function AdminAddClinicPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { call, authStatus } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const meta = useMetaStore((s) => s.meta);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [countryId, setCountryId] = useState(0);
  const [state, setState] = useState("");
  const [cityName, setCityName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  if (authStatus === "unauthenticated" || (session && !isAdmin)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        Admin access required.{" "}
        <Link href="/auth/signin" className="text-veda-600 underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-foreground/60">Loading…</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const latNum = lat.trim() === "" ? null : Number(lat);
      const lngNum = lng.trim() === "" ? null : Number(lng);
      const created = await call<{ id: number; slug: string }>("/admin/spas", {
        method: "POST",
        body: {
          name,
          shortDescription,
          description,
          addressLine,
          postalCode,
          countryId: countryId || null,
          state,
          cityName,
          lat: latNum != null && Number.isFinite(latNum) ? latNum : null,
          lng: lngNum != null && Number.isFinite(lngNum) ? lngNum : null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null,
          isPublished,
        },
      });
      toast("Clinic added.");
      router.push(created.slug ? `/spas/${created.slug}` : "/admin");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add clinic", "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Add a clinic</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Creates an unclaimed public listing. Clinic owners can later claim it from the listing page.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
        <label className={label}>
          Name
          <input required className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={label}>
          Short description
          <input
            required
            maxLength={300}
            className={input}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
          />
        </label>
        <label className={label}>
          Description
          <textarea
            required
            rows={5}
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className={label}>
          Address
          <input required className={input} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Country
            <select className={input} value={countryId || ""} onChange={(e) => setCountryId(Number(e.target.value))}>
              <option value="">Select a country</option>
              {(meta?.countries ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            State
            <input className={input} value={state} onChange={(e) => setState(e.target.value)} />
          </label>
          <label className={label}>
            City
            <input className={input} value={cityName} onChange={(e) => setCityName(e.target.value)} />
          </label>
          <label className={label}>
            Pin
            <input className={input} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </label>
          <label className={label}>
            Latitude
            <input className={input} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Optional" />
          </label>
          <label className={label}>
            Longitude
            <input className={input} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Optional" />
          </label>
          <label className={label}>
            Phone
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className={label}>
            Public email
            <input type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        <label className={label}>
          Website
          <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Publish listing
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add clinic"}
        </button>
      </form>
    </div>
  );
}
