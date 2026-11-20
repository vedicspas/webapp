"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { useMetaStore } from "@/stores/metaStore";
import { toast } from "@/stores/toastStore";
import { AmenitiesPicker } from "@/components/AmenitiesPicker";
import { TagInput } from "@/components/TagInput";
import { RemotePhoto } from "@/components/RemotePhoto";
import { ON_REQUEST_LABELS, WEEKDAYS } from "@/lib/format";
import type { OnRequestFlag } from "@vedic/shared";

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

type PendingPhoto = { key: string; file: File; title: string; preview: string };

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
  const [amenityIds, setAmenityIds] = useState<number[]>([]);
  const [amenitiesOtherOn, setAmenitiesOtherOn] = useState(false);
  const [amenitiesOther, setAmenitiesOther] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [dietaryOptions, setDietaryOptions] = useState<string[]>([]);
  const [airportPickup, setAirportPickup] = useState<OnRequestFlag | null>(null);
  const [accommodationTypeIds, setAccommodationTypeIds] = useState<number[]>([]);
  const [accommodationOther, setAccommodationOther] = useState("");
  const [accessibility, setAccessibility] = useState("");
  const [familyAccommodation, setFamilyAccommodation] = useState<OnRequestFlag | null>(null);
  const [treatmentNames, setTreatmentNames] = useState("");
  const [hours, setHours] = useState(
    Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: "09:00",
      closeTime: "18:00",
      closed: true,
    }))
  );
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

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

  function queuePhotos(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(),
      preview: URL.createObjectURL(file),
    }));
    setPendingPhotos((list) => [...list, ...next]);
    setFileInputKey((k) => k + 1);
  }

  function dropPending(key: string) {
    setPendingPhotos((list) => {
      const item = list.find((p) => p.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter((p) => p.key !== key);
    });
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
          amenityIds,
          amenitiesOther: amenitiesOtherOn ? amenitiesOther : "",
          treatmentNames,
          languages,
          dietaryOptions,
          airportPickup,
          accommodationTypeIds,
          accommodationOther: accommodationOther.trim() || null,
          accessibility: accessibility.trim() || null,
          familyAccommodation,
          openHours: hours
            .filter((h) => !h.closed)
            .map(({ weekday, openTime, closeTime }) => ({ weekday, openTime, closeTime })),
        },
      });
      for (const photo of pendingPhotos) {
        const data = new FormData();
        data.append("file", photo.file);
        data.append("title", photo.title.trim());
        await call(`/admin/spas/${created.id}/photos`, { method: "POST", body: data });
      }
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      toast("Clinic added.");
      router.push(created.slug ? `/spas/${created.slug}` : "/admin");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add clinic", "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Add a clinic</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Creates an unclaimed public listing. Clinic owners can later claim it from the listing page.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <section className="space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Basic details</h2>
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
        </section>

        <section className="space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Amenities</h2>
          <p className="text-sm text-foreground/60">
            Optional. Select chips, or Other for a comma-separated list that is not in the standard set.
          </p>
          <AmenitiesPicker
            amenityIds={amenityIds}
            onAmenityIdsChange={setAmenityIds}
            otherEnabled={amenitiesOtherOn}
            onOtherEnabledChange={setAmenitiesOtherOn}
            otherText={amenitiesOther}
            onOtherTextChange={setAmenitiesOther}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Stay &amp; access</h2>
          <p className="text-sm text-foreground/60">Optional. Shown on the public listing when filled in.</p>
          <div className={label}>
            <label htmlFor="admin-languages">Languages spoken</label>
            <TagInput
              id="admin-languages"
              values={languages}
              onChange={setLanguages}
              suggestions={(meta?.languages ?? []).map((l) => l.name)}
              placeholder="Type a language"
            />
          </div>
          <label className={label}>
            Airport pickup
            <select
              className={input}
              value={airportPickup ?? ""}
              onChange={(e) => setAirportPickup((e.target.value || null) as OnRequestFlag | null)}
            >
              <option value="">Not specified</option>
              <option value="on_request">{ON_REQUEST_LABELS.on_request}</option>
              <option value="not_available">{ON_REQUEST_LABELS.not_available}</option>
            </select>
          </label>
          <div className={label}>
            <label htmlFor="admin-accommodation-types">Accommodation type</label>
            <TagInput
              id="admin-accommodation-types"
              values={(meta?.accommodationTypes ?? [])
                .filter((t) => accommodationTypeIds.includes(t.id))
                .map((t) => t.name)}
              onChange={(names) => {
                const picked = names
                  .map((item) =>
                    (meta?.accommodationTypes ?? []).find((t) => t.name.toLowerCase() === item.toLowerCase())
                  )
                  .filter((t): t is NonNullable<typeof t> => Boolean(t))
                  .map((t) => t.id);
                setAccommodationTypeIds(picked);
              }}
              suggestions={(meta?.accommodationTypes ?? []).map((t) => t.name)}
              placeholder="Choose one or more types"
              allowCreate={false}
            />
          </div>
          <label className={label}>
            Other accommodation (this listing only)
            <input
              className={input}
              maxLength={200}
              value={accommodationOther}
              onChange={(e) => setAccommodationOther(e.target.value)}
              placeholder="e.g. Not in clinic, but available nearby"
            />
          </label>
          <div className={label}>
            <label htmlFor="admin-dietary-options">Dietary options</label>
            <TagInput
              id="admin-dietary-options"
              values={dietaryOptions}
              onChange={setDietaryOptions}
              suggestions={(meta?.dietaryOptions ?? []).map((d) => d.name)}
              placeholder="Type a diet"
            />
          </div>
          <label className={label}>
            Accessibility
            <textarea
              className={input}
              rows={3}
              value={accessibility}
              onChange={(e) => setAccessibility(e.target.value)}
              placeholder="Wheelchair access, ground-floor rooms, grab bars…"
            />
          </label>
          <label className={label}>
            Family or companion accommodation
            <select
              className={input}
              value={familyAccommodation ?? ""}
              onChange={(e) => setFamilyAccommodation((e.target.value || null) as OnRequestFlag | null)}
            >
              <option value="">Not specified</option>
              <option value="on_request">{ON_REQUEST_LABELS.on_request}</option>
              <option value="not_available">{ON_REQUEST_LABELS.not_available}</option>
            </select>
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Photos</h2>
          <p className="text-sm text-foreground/60">
            Optional. JPEG, PNG, WebP, or GIF (up to 8&nbsp;MB each). The first photo is the search-card cover.
          </p>
          {pendingPhotos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pendingPhotos.map((p) => (
                <div key={p.key} className="overflow-hidden rounded-xl border border-dashed border-veda-300 bg-veda-50">
                  <div className="relative aspect-[4/3]">
                    <RemotePhoto src={p.preview} alt={p.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-1.5 p-2">
                    <input
                      className={input}
                      value={p.title}
                      maxLength={200}
                      placeholder="Image title"
                      onChange={(e) =>
                        setPendingPhotos((list) =>
                          list.map((x) => (x.key === p.key ? { ...x, title: e.target.value } : x))
                        )
                      }
                    />
                    <button type="button" onClick={() => dropPending(p.key)} className="text-xs text-red-700 hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-veda-50 px-3 py-2 text-sm text-foreground/60">No photos yet.</p>
          )}
          <input
            key={fileInputKey}
            className={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => queuePhotos(e.target.files)}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Opening hours</h2>
          <p className="text-sm text-foreground/60">Optional. Leave days closed if unknown.</p>
          {hours.map((h, i) => (
            <div key={h.weekday} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24">{WEEKDAYS[h.weekday]}</span>
              <input
                type="checkbox"
                checked={!h.closed}
                onChange={(e) =>
                  setHours((list) => list.map((x, j) => (j === i ? { ...x, closed: !e.target.checked } : x)))
                }
              />
              {!h.closed ? (
                <>
                  <input
                    type="time"
                    value={h.openTime}
                    onChange={(e) =>
                      setHours((list) => list.map((x, j) => (j === i ? { ...x, openTime: e.target.value } : x)))
                    }
                    className="rounded border border-veda-200 px-2 py-1"
                  />
                  &ndash;
                  <input
                    type="time"
                    value={h.closeTime}
                    onChange={(e) =>
                      setHours((list) => list.map((x, j) => (j === i ? { ...x, closeTime: e.target.value } : x)))
                    }
                    className="rounded border border-veda-200 px-2 py-1"
                  />
                </>
              ) : (
                <span className="text-foreground/50">Closed</span>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Treatments &amp; retreats</h2>
          <p className="text-sm text-foreground/60">
            Optional. Paste a comma-separated name list. These show on the clinic page without prices. After a claim,
            the owner can add duration and pricing in their editor.
          </p>
          <label className={label}>
            Treatment names
            <textarea
              className={input}
              rows={6}
              value={treatmentNames}
              onChange={(e) => setTreatmentNames(e.target.value)}
              placeholder="Abhyangam, Sirodhara, Vasthi, Nasyam"
            />
          </label>
        </section>

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
