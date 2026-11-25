"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { useMetaStore } from "@/stores/metaStore";
import { toast } from "@/stores/toastStore";
import { AmenitiesPicker } from "@/components/AmenitiesPicker";
import { TagInput } from "@/components/TagInput";
import { RemotePhoto } from "@/components/RemotePhoto";
import {
  DuplicateClinicModal,
  duplicateMatchesFromError,
  type DuplicateClinicMatch,
} from "@/components/admin/DuplicateClinicModal";
import { ON_REQUEST_LABELS, WEEKDAYS, shortDate } from "@/lib/format";
import type { OnRequestFlag } from "@vedic/shared";

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

type PendingPhoto = { key: string; file: File; title: string; preview: string };
type SavedPhoto = { id: number; url: string; title: string };

type EditAction = "updated" | "photo_added" | "photo_removed";

const EDIT_ACTION_LABEL: Record<EditAction, string> = {
  updated: "Updated listing",
  photo_added: "Added photo",
  photo_removed: "Removed photo",
};

export type AdminClinicDetail = {
  id: number;
  slug: string;
  clinicCode: string;
  name: string;
  shortDescription: string;
  description: string;
  addressLine: string;
  postalCode: string;
  countryId: number | null;
  state: string;
  cityName: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  email: string;
  website: string;
  isPublished: boolean;
  amenityIds: number[];
  amenitiesOther: string[];
  listedTreatmentNames: string[];
  languages: { id: number; name: string }[];
  dietaryOptions: { id: number; name: string }[];
  airportPickup: OnRequestFlag | null;
  accommodationTypes: { id: number; name: string }[];
  accommodationOther: string | null;
  accessibility: string | null;
  familyAccommodation: OnRequestFlag | null;
  openHours: { weekday: number; openTime: string; closeTime: string }[];
  photos: SavedPhoto[];
  updatedAt: string | null;
  updatedByName: string | null;
  editLog: { id: number; action: EditAction; createdAt: string; editorName: string }[];
};

function blankHours() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    openTime: "09:00",
    closeTime: "18:00",
    closed: true,
  }));
}

function hoursFromOpen(openHours: AdminClinicDetail["openHours"]) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const found = openHours.find((h) => h.weekday === weekday);
    return {
      weekday,
      openTime: found?.openTime ?? "09:00",
      closeTime: found?.closeTime ?? "18:00",
      closed: !found,
    };
  });
}

async function refreshPublicSpaPage(slug: string | null) {
  if (!slug) return;
  await fetch("/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  }).catch(() => {});
}

export function AdminClinicForm({ mode, spaId }: { mode: "create" | "edit"; spaId?: number }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { call, authStatus } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const meta = useMetaStore((s) => s.meta);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(mode === "create");
  const [clinicCode, setClinicCode] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [editLog, setEditLog] = useState<AdminClinicDetail["editLog"]>([]);
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
  const [hours, setHours] = useState(blankHours);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateClinicMatch[] | null>(null);

  const applyDetail = useCallback((data: AdminClinicDetail) => {
    setClinicCode(data.clinicCode);
    setSlug(data.slug);
    setUpdatedAt(data.updatedAt);
    setUpdatedByName(data.updatedByName);
    setEditLog(data.editLog ?? []);
    setName(data.name);
    setShortDescription(data.shortDescription);
    setDescription(data.description);
    setAddressLine(data.addressLine);
    setCountryId(data.countryId ?? 0);
    setState(data.state ?? "");
    setCityName(data.cityName ?? "");
    setPostalCode(data.postalCode ?? "");
    setLat(data.lat == null ? "" : String(data.lat));
    setLng(data.lng == null ? "" : String(data.lng));
    setPhone(data.phone ?? "");
    setEmail(data.email ?? "");
    setWebsite(data.website ?? "");
    setIsPublished(data.isPublished);
    setAmenityIds(data.amenityIds ?? []);
    setAmenitiesOtherOn((data.amenitiesOther ?? []).length > 0);
    setAmenitiesOther((data.amenitiesOther ?? []).join(", "));
    setLanguages((data.languages ?? []).map((l) => l.name));
    setDietaryOptions((data.dietaryOptions ?? []).map((d) => d.name));
    setAirportPickup(data.airportPickup ?? null);
    setAccommodationTypeIds((data.accommodationTypes ?? []).map((t) => t.id));
    setAccommodationOther(data.accommodationOther ?? "");
    setAccessibility(data.accessibility ?? "");
    setFamilyAccommodation(data.familyAccommodation ?? null);
    setTreatmentNames((data.listedTreatmentNames ?? []).join(", "));
    setHours(hoursFromOpen(data.openHours ?? []));
    setSavedPhotos(data.photos ?? []);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !spaId || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await call<AdminClinicDetail>(`/admin/spas/${spaId}`);
        if (cancelled) return;
        applyDetail(data);
        setReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load clinic");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, spaId, isAdmin, call, applyDetail]);

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

  if (status === "loading" || (mode === "edit" && !ready && !loadError)) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-foreground/60">Loading…</div>;
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm">
          <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
            Admin dashboard
          </Link>
        </p>
        <p className="mt-4 text-foreground/70">{loadError}</p>
      </div>
    );
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

  async function removeSavedPhoto(photoId: number) {
    try {
      await call(`/admin/photos/${photoId}`, { method: "DELETE" });
      setSavedPhotos((list) => list.filter((p) => p.id !== photoId));
      toast("Photo removed.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove photo", "error");
    }
  }

  function clinicBody(confirmDuplicate: boolean) {
    const latNum = lat.trim() === "" ? null : Number(lat);
    const lngNum = lng.trim() === "" ? null : Number(lng);
    return {
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
      confirmDuplicate,
    };
  }

  async function uploadPending(id: number) {
    for (const photo of pendingPhotos) {
      const data = new FormData();
      data.append("file", photo.file);
      data.append("title", photo.title.trim());
      await call(`/admin/spas/${id}/photos`, { method: "POST", body: data });
    }
    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
  }

  async function saveClinic(confirmDuplicate = false) {
    setBusy(true);
    try {
      if (mode === "create") {
        const created = await call<{ id: number; slug: string }>("/admin/spas", {
          method: "POST",
          body: clinicBody(confirmDuplicate),
        });
        await uploadPending(created.id);
        toast("Clinic added.");
        router.push(created.slug ? `/spas/${created.slug}` : "/admin");
        return;
      }
      if (!spaId) throw new Error("Missing clinic");
      const updated = await call<{ ok: true; slug: string }>(`/admin/spas/${spaId}`, {
        method: "PUT",
        body: clinicBody(confirmDuplicate),
      });
      await uploadPending(spaId);
      await refreshPublicSpaPage(updated.slug);
      const fresh = await call<AdminClinicDetail>(`/admin/spas/${spaId}`);
      applyDetail(fresh);
      toast("Clinic updated.");
      setDuplicateMatches(null);
    } catch (err) {
      if (!confirmDuplicate) {
        const matches = duplicateMatchesFromError(err);
        if (matches) {
          setDuplicateMatches(matches);
          setBusy(false);
          return;
        }
      }
      toast(err instanceof Error ? err.message : mode === "create" ? "Could not add clinic" : "Could not save clinic", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await saveClinic(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">
        {mode === "create" ? "Add a clinic" : "Edit clinic"}
      </h1>
      {mode === "create" ? (
        <p className="mt-2 text-sm text-foreground/60">
          Creates an unclaimed public listing. Clinic owners can later claim it from the listing page.
        </p>
      ) : (
        <p className="mt-2 text-sm text-foreground/60">
          {clinicCode ? `Clinic ID ${clinicCode}` : "Unclaimed listing"}
          {slug ? (
            <>
              {" "}
              &middot;{" "}
              <Link href={`/spas/${slug}`} className="text-veda-700 underline">
                View listing
              </Link>
            </>
          ) : null}
          {updatedAt ? (
            <>
              {" "}
              &middot; Last edited {shortDate(updatedAt)}
              {updatedByName ? ` by ${updatedByName}` : ""}
            </>
          ) : (
            " · Not edited since it was added"
          )}
        </p>
      )}
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
          {savedPhotos.length > 0 || pendingPhotos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {savedPhotos.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border border-veda-200 bg-white">
                  <div className="relative aspect-[4/3]">
                    <RemotePhoto src={p.url} alt={p.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-1.5 p-2">
                    <p className="truncate text-xs text-foreground/70">{p.title || "Photo"}</p>
                    <button
                      type="button"
                      onClick={() => void removeSavedPhoto(p.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
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

        {mode === "edit" && editLog.length > 0 ? (
          <section className="space-y-2 rounded-2xl border border-veda-100 bg-white p-5">
            <h2 className="font-semibold text-veda-900">Edit log</h2>
            <ul className="space-y-1 text-sm text-foreground/70">
              {editLog.map((event) => (
                <li key={event.id}>
                  {EDIT_ACTION_LABEL[event.action]} · {shortDate(event.createdAt)} · {event.editorName}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : mode === "create" ? "Add clinic" : "Save changes"}
        </button>
      </form>
      <DuplicateClinicModal
        matches={duplicateMatches}
        busy={busy}
        onConfirmDifferent={() => void saveClinic(true)}
        onCancel={() => setDuplicateMatches(null)}
      />
    </div>
  );
}
