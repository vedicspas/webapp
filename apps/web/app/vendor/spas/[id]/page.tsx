"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { useMetaStore } from "@/stores/metaStore";
import { PAYMENT_MODE_LABELS, WEEKDAYS, ON_REQUEST_LABELS } from "@/lib/format";
import { RemotePhoto } from "@/components/RemotePhoto";
import { DollarInput, PostfixInput } from "@/components/AffixedInput";
import { TagInput } from "@/components/TagInput";
import { toast } from "@/stores/toastStore";
import { easeScrollTo } from "@/lib/smoothScroll";
import { DateField } from "@/components/DateField";
import type { OnRequestFlag, StaticMeta } from "@vedic/shared";

interface RetreatSlot {
  id: number;
  startDate: string;
  capacity: number;
}

interface VendorTreatment {
  id?: number;
  clientKey?: string;
  categoryId: number;
  kind: "session" | "retreat";
  name: string;
  description: string;
  durationMinutes: number | null;
  nights: number | null;
  priceMinor: number;
  isActive: boolean;
  slots: RetreatSlot[];
  newStartDate: string;
  newCapacity: number;
}

function blankTreatment(categoryId: number): VendorTreatment {
  return {
    clientKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryId,
    kind: "session",
    name: "",
    description: "",
    durationMinutes: 60,
    nights: null,
    priceMinor: 5000,
    isActive: true,
    slots: [],
    newStartDate: "",
    newCapacity: 8,
  };
}

function treatmentReadyToSave(t: VendorTreatment): string | null {
  if (t.name.trim().length < 3) return "Enter a treatment name (at least 3 characters).";
  if (t.kind === "session" && (!t.durationMinutes || t.durationMinutes < 15)) {
    return "Enter a duration of at least 15 minutes.";
  }
  if (t.kind === "retreat" && (!t.nights || t.nights < 1)) {
    return "Enter the number of nights.";
  }
  return null;
}

function treatmentFinished(t: VendorTreatment): boolean {
  return Boolean(t.id) && treatmentReadyToSave(t) === null;
}

interface VendorPhoto {
  id: number;
  url: string;
  title: string;
  alt: string;
  sortOrder: number;
}

interface PendingPhoto {
  key: string;
  file: File;
  title: string;
  preview: string;
}

interface SpaForm {
  name: string;
  shortDescription: string;
  description: string;
  addressLine: string;
  postalCode: string;
  countryId: number;
  state: string;
  cityName: string;
  lat: number;
  lng: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  shopifyCollectionHandle: string | null;
  paymentModeCode: "full_prepay" | "deposit" | "booking_fee" | "pay_at_spa";
  depositBps: number | null;
  bookingFeeMinor: number | null;
  currencyCode: string;
  isPublished: boolean;
  languages: string[];
  dietaryOptions: string[];
  airportPickup: OnRequestFlag | null;
  accommodationTypeIds: number[];
  accommodationOther: string;
  amenityIds: number[];
  accessibility: string;
  familyAccommodation: OnRequestFlag | null;
}

async function refreshStayMeta(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  try {
    const live = await fetch(`${url}/meta`, { cache: "no-store" }).then((r) => r.json() as Promise<StaticMeta>);
    if (Array.isArray(live?.accommodationTypes) && live.accommodationTypes.length > 0) {
      useMetaStore.getState().hydrate(live);
    }
  } catch {
    // Keep layout meta if the refresh fails.
  }
}

const EMPTY: SpaForm = {
  name: "",
  shortDescription: "",
  description: "",
  addressLine: "",
  postalCode: "",
  countryId: 0,
  state: "",
  cityName: "",
  lat: 0,
  lng: 0,
  phone: null,
  email: null,
  website: null,
  shopifyCollectionHandle: null,
  paymentModeCode: "pay_at_spa",
  depositBps: 2000,
  bookingFeeMinor: 500,
  currencyCode: "USD",
  isPublished: false,
  languages: [],
  dietaryOptions: [],
  airportPickup: null,
  accommodationTypeIds: [],
  accommodationOther: "",
  amenityIds: [],
  accessibility: "",
  familyAccommodation: null,
};

const input = "w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export default function VendorSpaEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const { call, token, authStatus } = useApi();
  const meta = useMetaStore((s) => s.meta);

  const [form, setForm] = useState<SpaForm>(EMPTY);
  const [listingSlug, setListingSlug] = useState<string | null>(null);
  const [treatments, setTreatments] = useState<VendorTreatment[]>([]);
  const lastTreatmentRef = useRef<HTMLDivElement>(null);
  const scrollToNewTreatment = useRef(false);
  const [photos, setPhotos] = useState<VendorPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [hours, setHours] = useState(
    Array.from({ length: 7 }, (_, weekday) => ({ weekday, openTime: "09:00", closeTime: "18:00", closed: false }))
  );
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [clinicCode, setClinicCode] = useState<string | null>(null);

  const set = (patch: Partial<SpaForm>) => setForm((f) => ({ ...f, ...patch }));

  async function refreshPublicSpaPage(slug: string | null) {
    if (!slug) return;
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => {});
  }

  const load = useCallback(async () => {
    await refreshStayMeta();
    const data = await call<{
      slug?: string;
      clinicCode?: string;
      treatments: Array<Omit<VendorTreatment, "newStartDate" | "newCapacity" | "slots"> & { slots?: RetreatSlot[] }>;
      photos: VendorPhoto[];
      openHours: { weekday: number; openTime: string; closeTime: string }[];
      languages?: { id: number; name: string }[];
      dietaryOptions?: { id: number; name: string }[];
      accommodationTypes?: { id: number; name: string }[];
      accommodationOther?: string | null;
      amenityIds?: number[];
      airportPickup?: OnRequestFlag | null;
      familyAccommodation?: OnRequestFlag | null;
      accessibility?: string | null;
      name: string;
      shortDescription: string;
      description: string;
      addressLine: string;
      postalCode: string;
      countryId: number | null;
      state: string;
      cityName: string;
      lat: number;
      lng: number;
      phone: string | null;
      email: string | null;
      website: string | null;
      shopifyCollectionHandle: string | null;
      paymentModeCode: SpaForm["paymentModeCode"];
      depositBps: number | null;
      bookingFeeMinor: number | null;
      currencyCode: string;
      isPublished: boolean;
    }>(`/vendor/spas/${id}`);
    setForm({
      ...EMPTY,
      ...data,
      countryId: data.countryId ?? 0,
      state: data.state ?? "",
      cityName: data.cityName ?? "",
      depositBps: data.depositBps ?? 2000,
      bookingFeeMinor: data.bookingFeeMinor ?? 500,
      languages: (data.languages ?? []).map((l) => l.name),
      dietaryOptions: (data.dietaryOptions ?? []).map((d) => d.name),
      airportPickup: data.airportPickup ?? null,
      accommodationTypeIds: (data.accommodationTypes ?? []).map((t) => t.id),
      accommodationOther: data.accommodationOther ?? "",
      amenityIds: data.amenityIds ?? [],
      accessibility: data.accessibility ?? "",
      familyAccommodation: data.familyAccommodation ?? null,
    });
    setListingSlug(data.slug ?? null);
    setClinicCode(data.clinicCode ?? null);
    setTreatments(
      data.treatments.map((t) => ({
        ...t,
        isActive: Boolean(t.isActive),
        slots: t.slots ?? [],
        newStartDate: "",
        newCapacity: 8,
      }))
    );
    setPhotos(
      (data.photos ?? []).map((p) => ({
        ...p,
        title: p.title || p.alt || "",
        alt: p.alt || p.title || "",
      }))
    );
    setHours(
      Array.from({ length: 7 }, (_, weekday) => {
        const h = data.openHours.find((x) => x.weekday === weekday);
        return h
          ? { weekday, openTime: h.openTime, closeTime: h.closeTime, closed: false }
          : { weekday, openTime: "09:00", closeTime: "18:00", closed: true };
      })
    );
    setLoaded(true);
  }, [call, id]);

  useEffect(() => {
    // All state updates inside load() happen after awaited fetches, not
    // synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token && !isNew) load().catch(() => router.push("/vendor"));
  }, [token, isNew, load, router]);

  useEffect(() => {
    if (!isNew) return;
    void refreshStayMeta();
  }, [isNew]);

  async function save() {
    setBusy(true);
    try {
      const body = {
        ...form,
        depositBps: form.paymentModeCode === "deposit" ? form.depositBps : null,
        bookingFeeMinor: form.paymentModeCode === "booking_fee" ? form.bookingFeeMinor : null,
        shopifyCollectionHandle: form.shopifyCollectionHandle || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        languages: form.languages,
        dietaryOptions: form.dietaryOptions,
        airportPickup: form.airportPickup,
        accommodationTypeIds: form.accommodationTypeIds,
        accommodationOther: form.accommodationOther.trim() || null,
        amenityIds: form.amenityIds,
        accessibility: form.accessibility.trim() || null,
        familyAccommodation: form.familyAccommodation,
      };
      if (isNew) {
        const created = await call<{ id: number }>("/vendor/spas", { method: "POST", body });
        toast("Listing created.");
        router.push(`/vendor/spas/${created.id}`);
        return;
      }
      await call(`/vendor/spas/${id}`, { method: "PUT", body });
      await call(`/vendor/spas/${id}/hours`, {
        method: "PUT",
        body: hours.filter((h) => !h.closed).map(({ weekday, openTime, closeTime }) => ({ weekday, openTime, closeTime })),
      });
      toast("Saved.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function queuePhotos(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: PendingPhoto[] = Array.from(fileList).map((file) => ({
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

  async function uploadPending() {
    if (pendingPhotos.length === 0) return;
    setPhotoBusy(true);
    try {
      const uploaded: VendorPhoto[] = [];
      for (const item of pendingPhotos) {
        const data = new FormData();
        data.append("file", item.file);
        data.append("title", item.title.trim());
        const created = await call<{ id: number; url: string; title?: string; alt?: string }>(
          `/vendor/spas/${id}/photos`,
          { method: "POST", body: data }
        );
        const title = created.title || created.alt || item.title.trim();
        uploaded.push({
          id: created.id,
          url: created.url,
          title,
          alt: title,
          sortOrder: photos.length + uploaded.length,
        });
      }
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPendingPhotos([]);
      setPhotos((list) => [...list, ...uploaded]);
      toast(
        uploaded.length === 1
          ? "Photo uploaded. The first photo is used on search cards."
          : `${uploaded.length} photos uploaded. The first photo is used on search cards.`
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not upload photos", "error");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function savePhotoTitle(photoId: number, title: string) {
    try {
      await call(`/vendor/photos/${photoId}`, { method: "PATCH", body: { title } });
      setPhotos((list) =>
        list.map((p) => (p.id === photoId ? { ...p, title, alt: title } : p))
      );
      toast("Photo title saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update title", "error");
    }
  }

  async function removePhoto(photoId: number) {
    try {
      await call(`/vendor/photos/${photoId}`, { method: "DELETE" });
      setPhotos((list) => list.filter((p) => p.id !== photoId));
      toast("Photo removed.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove photo", "error");
    }
  }

  function addTreatment() {
    const last = treatments[treatments.length - 1];
    if (last && !treatmentFinished(last)) {
      const missing = treatmentReadyToSave(last);
      toast(
        missing
          ? `Finish the treatment above first. ${missing}`
          : "Save the treatment above before adding another.",
        "error"
      );
      const el = lastTreatmentRef.current;
      if (el) window.setTimeout(() => easeScrollTo(el), 80);
      return;
    }
    scrollToNewTreatment.current = true;
    setTreatments((list) => [...list, blankTreatment(meta.treatmentCategories[0]?.id ?? 1)]);
  }

  useEffect(() => {
    if (!scrollToNewTreatment.current) return;
    scrollToNewTreatment.current = false;
    const el = lastTreatmentRef.current;
    if (!el) return;
    const id = window.setTimeout(() => easeScrollTo(el), 80);
    return () => window.clearTimeout(id);
  }, [treatments.length]);

  async function saveTreatment(t: VendorTreatment, index: number) {
    const missing = treatmentReadyToSave(t);
    if (missing) {
      toast(missing, "error");
      return;
    }
    try {
      const body = {
        categoryId: t.categoryId,
        kind: t.kind,
        name: t.name.trim(),
        description: t.description,
        durationMinutes: t.kind === "session" ? t.durationMinutes : null,
        nights: t.kind === "retreat" ? t.nights : null,
        priceMinor: t.priceMinor,
        isActive: t.isActive,
      };
      if (t.id) {
        await call(`/vendor/treatments/${t.id}`, { method: "PUT", body });
      } else {
        const created = await call<{ id: number }>(`/vendor/spas/${id}/treatments`, { method: "POST", body });
        setTreatments((list) => list.map((x, i) => (i === index ? { ...x, id: created.id } : x)));
      }
      toast("Treatment saved.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Treatment save failed", "error");
    }
  }

  async function deleteTreatment(t: VendorTreatment, index: number) {
    const label = t.name.trim() || "this treatment";
    const warning = t.id
      ? `Delete “${label}”? This cannot be undone. If guests have already booked it, you will need to uncheck Active instead.`
      : `Discard “${label}”? It has not been saved yet.`;
    if (!window.confirm(warning)) return;

    if (!t.id) {
      setTreatments((list) => list.filter((_, i) => i !== index));
      toast("Treatment discarded.");
      return;
    }
    try {
      await call(`/vendor/treatments/${t.id}`, { method: "DELETE" });
      setTreatments((list) => list.filter((_, i) => i !== index));
      toast("Treatment deleted.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete treatment", "error");
    }
  }

  async function addRetreatSlot(t: VendorTreatment, index: number) {
    if (!t.id) {
      toast("Save the retreat first, then add start dates.", "error");
      return;
    }
    const startDate = t.newStartDate.trim();
    const capacity = Number(t.newCapacity);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      toast("Choose a start date.", "error");
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      toast("Capacity must be at least 1.", "error");
      return;
    }
    try {
      const created = await call<RetreatSlot>(`/vendor/treatments/${t.id}/retreat-slots`, {
        method: "POST",
        body: { startDate, capacity },
      });
      setTreatments((list) =>
        list.map((x, j) => {
          if (j !== index) return x;
          const slots = [...x.slots.filter((s) => s.startDate !== created.startDate), created].sort((a, b) =>
            a.startDate.localeCompare(b.startDate)
          );
          return { ...x, slots, newStartDate: "" };
        })
      );
      toast("Start date added.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add start date", "error");
    }
  }

  async function removeRetreatSlot(t: VendorTreatment, index: number, slot: RetreatSlot) {
    if (!t.id) return;
    if (!window.confirm(`Remove the ${slot.startDate} start date?`)) return;
    try {
      await call(`/vendor/treatments/${t.id}/retreat-slots/${slot.id}`, { method: "DELETE" });
      setTreatments((list) =>
        list.map((x, j) => (j === index ? { ...x, slots: x.slots.filter((s) => s.id !== slot.id) } : x))
      );
      toast("Start date removed.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove start date", "error");
    }
  }

  if (authStatus === "unauthenticated") {
    router.push("/auth/signin");
    return null;
  }
  if (!loaded) return <div className="mx-auto max-w-3xl px-4 py-10 text-foreground/60">Loading&hellip;</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">{isNew ? "New spa listing" : `Edit: ${form.name}`}</h1>
      {clinicCode ? (
        <p className="mt-1 text-sm text-foreground/60">
          Clinic ID: <span className="font-medium text-veda-800">{clinicCode}</span>
        </p>
      ) : isNew ? (
        <p className="mt-1 text-sm text-foreground/60">A unique clinic ID (AA + 4 digits) is assigned when you create this listing.</p>
      ) : null}

      <section className="mt-6 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
        <h2 className="font-semibold text-veda-900">Listing details</h2>
        <label className={label}>
          Name
          <input className={input} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className={label}>
          Short description (shown on cards)
          <input
            className={input}
            maxLength={300}
            value={form.shortDescription}
            onChange={(e) => set({ shortDescription: e.target.value })}
          />
        </label>
        <label className={label}>
          Full description
          <textarea
            className={input}
            rows={5}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Country
            <select
              className={input}
              value={form.countryId || ""}
              onChange={(e) => set({ countryId: Number(e.target.value) })}
            >
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
            <input className={input} value={form.state} onChange={(e) => set({ state: e.target.value })} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Address
            <input className={input} value={form.addressLine} onChange={(e) => set({ addressLine: e.target.value })} />
          </label>
          <label className={label}>
            City
            <input className={input} value={form.cityName} onChange={(e) => set({ cityName: e.target.value })} />
          </label>
          <label className={label}>
            Pin
            <input className={input} value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
          </label>
          <label className={label}>
            Latitude
            <input
              className={input}
              type="number"
              step="0.000001"
              value={form.lat}
              onChange={(e) => set({ lat: Number(e.target.value) })}
            />
          </label>
          <label className={label}>
            Longitude
            <input
              className={input}
              type="number"
              step="0.000001"
              value={form.lng}
              onChange={(e) => set({ lng: Number(e.target.value) })}
            />
          </label>
          <label className={label}>
            Phone
            <input className={input} value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
          </label>
          <label className={label}>
            Public email
            <input className={input} value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="mt-5 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
        <h2 className="font-semibold text-veda-900">Amenities</h2>
        <p className="text-sm text-foreground/60">
          Optional. Shown as chips on your public listing. Select every amenity guests can use.
        </p>
        <div className="flex flex-wrap gap-2">
          {(meta.amenities ?? []).map((a) => {
            const on = form.amenityIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  set({
                    amenityIds: on
                      ? form.amenityIds.filter((id) => id !== a.id)
                      : [...form.amenityIds, a.id],
                  })
                }
                className={`rounded-full px-3 py-1.5 text-sm ${
                  on
                    ? "bg-veda-600 text-white"
                    : "border border-veda-200 text-veda-800 hover:bg-veda-50"
                }`}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
        <h2 className="font-semibold text-veda-900">Stay &amp; access</h2>
        <p className="text-sm text-foreground/60">Optional. Shown on your public listing when filled in.</p>
        <label className={label}>
          Languages spoken
          <TagInput
            values={form.languages}
            onChange={(languages) => set({ languages })}
            suggestions={(meta.languages ?? []).map((l) => l.name)}
            placeholder="Type a language"
          />
        </label>
        <label className={label}>
          Airport pickup
          <select
            className={input}
            value={form.airportPickup ?? ""}
            onChange={(e) =>
              set({ airportPickup: (e.target.value || null) as OnRequestFlag | null })
            }
          >
            <option value="">Not specified</option>
            <option value="on_request">{ON_REQUEST_LABELS.on_request}</option>
            <option value="not_available">{ON_REQUEST_LABELS.not_available}</option>
          </select>
        </label>
        <label className={label}>
          Accommodation type
          <TagInput
            values={(meta.accommodationTypes ?? [])
              .filter((t) => form.accommodationTypeIds.includes(t.id))
              .map((t) => t.name)}
            onChange={(names) => {
              const picked = names
                .map((name) =>
                  (meta.accommodationTypes ?? []).find(
                    (t) => t.name.toLowerCase() === name.toLowerCase()
                  )
                )
                .filter((t): t is NonNullable<typeof t> => Boolean(t))
                .map((t) => t.id);
              set({ accommodationTypeIds: picked });
            }}
            suggestions={(meta.accommodationTypes ?? []).map((t) => t.name)}
            placeholder="Choose one or more types"
            allowCreate={false}
          />
        </label>
        <label className={label}>
          Other accommodation (this listing only)
          <input
            className={input}
            maxLength={200}
            value={form.accommodationOther}
            onChange={(e) => set({ accommodationOther: e.target.value })}
            placeholder="e.g. Not in clinic, but available nearby"
          />
        </label>
        <label className={label}>
          Dietary options
          <TagInput
            values={form.dietaryOptions}
            onChange={(dietaryOptions) => set({ dietaryOptions })}
            suggestions={(meta.dietaryOptions ?? []).map((d) => d.name)}
            placeholder="Type a diet"
          />
        </label>
        <label className={label}>
          Accessibility
          <textarea
            className={input}
            rows={3}
            value={form.accessibility}
            onChange={(e) => set({ accessibility: e.target.value })}
            placeholder="Wheelchair access, ground-floor rooms, grab bars…"
          />
        </label>
        <label className={label}>
          Family or companion accommodation
          <select
            className={input}
            value={form.familyAccommodation ?? ""}
            onChange={(e) =>
              set({ familyAccommodation: (e.target.value || null) as OnRequestFlag | null })
            }
          >
            <option value="">Not specified</option>
            <option value="on_request">{ON_REQUEST_LABELS.on_request}</option>
            <option value="not_available">{ON_REQUEST_LABELS.not_available}</option>
          </select>
        </label>
      </section>

      {!isNew ? (
        <section className="mt-5 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Photos</h2>
          <p className="text-sm text-foreground/60">
            Select one or more JPEG, PNG, WebP, or GIF files (up to 8&nbsp;MB each). Give each
            image a short title — it appears on your public listing. Files are stored on this
            server, not as database blobs. The first photo is the search-card cover.
          </p>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p, i) => (
                <div key={p.id} className="overflow-hidden rounded-xl border border-veda-100">
                  <div className="relative aspect-[4/3] bg-veda-50">
                    <RemotePhoto src={p.url} alt={p.title || p.alt || form.name} className="h-full w-full object-cover" />
                    {i === 0 ? (
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                        Cover
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1.5 p-2">
                    <input
                      className={input}
                      value={p.title}
                      maxLength={200}
                      placeholder="Image title"
                      onChange={(e) =>
                        setPhotos((list) =>
                          list.map((x) =>
                            x.id === p.id ? { ...x, title: e.target.value, alt: e.target.value } : x
                          )
                        )
                      }
                      onBlur={(e) => void savePhotoTitle(p.id, e.target.value.trim())}
                    />
                    <button
                      type="button"
                      onClick={() => void removePhoto(p.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-veda-50 px-3 py-2 text-sm text-foreground/60">No photos yet.</p>
          )}
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
                    <button
                      type="button"
                      onClick={() => dropPending(p.key)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <input
              key={fileInputKey}
              className={input}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => queuePhotos(e.target.files)}
            />
            <button
              type="button"
              onClick={() => void uploadPending()}
              disabled={pendingPhotos.length === 0 || photoBusy}
              className="rounded-full bg-veda-700 px-4 py-2 text-sm text-white hover:bg-veda-600 disabled:opacity-50"
            >
              {photoBusy
                ? "Uploading\u2026"
                : pendingPhotos.length > 1
                  ? `Upload ${pendingPhotos.length} photos`
                  : "Upload photo"}
            </button>
          </div>
        </section>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-veda-200 bg-veda-50 px-4 py-3 text-sm text-foreground/70">
          Create the listing first, then you can add photos from this page.
        </p>
      )}

      <section className="mt-5 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
        <h2 className="font-semibold text-veda-900">Payments</h2>
        <label className={label}>
          How do guests pay?
          <select
            className={input}
            value={form.paymentModeCode}
            onChange={(e) => set({ paymentModeCode: e.target.value as SpaForm["paymentModeCode"] })}
          >
            {meta.paymentModes.map((m) => (
              <option key={m.id} value={m.code}>
                {PAYMENT_MODE_LABELS[m.code]}
              </option>
            ))}
          </select>
        </label>
        {form.paymentModeCode === "deposit" ? (
          <label className={label}>
            Deposit percentage
            <select
              className={input}
              value={form.depositBps ?? 2000}
              onChange={(e) => set({ depositBps: Number(e.target.value) })}
            >
              {[1000, 1500, 2000, 2500, 3000, 5000].map((bps) => (
                <option key={bps} value={bps}>
                  {bps / 100}%
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {form.paymentModeCode === "booking_fee" ? (
          <label className={label}>
            Booking fee
            <DollarInput
              valueMinor={form.bookingFeeMinor ?? 500}
              onChangeMinor={(minor) => set({ bookingFeeMinor: minor })}
              aria-label="Booking fee"
            />
          </label>
        ) : null}
      </section>

      <section className="mt-5 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
        <h2 className="font-semibold text-veda-900">Shop (Shopify)</h2>
        <label className={label}>
          Shopify collection handle for this spa&rsquo;s products
          <input
            className={input}
            placeholder="e.g. ganga-veda"
            value={form.shopifyCollectionHandle ?? ""}
            onChange={(e) => set({ shopifyCollectionHandle: e.target.value })}
          />
        </label>
        <p className="text-xs text-foreground/60">
          Products from this collection appear on your public spa page. See SHOPIFY_SETUP.md.
        </p>
      </section>

      {!isNew ? (
        <section className="mt-5 space-y-3 rounded-2xl border border-veda-100 bg-white p-5">
          <h2 className="font-semibold text-veda-900">Opening hours</h2>
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
      ) : null}

      {!isNew ? (
        <section className="mt-5 space-y-4 rounded-2xl border border-veda-100 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-veda-900">Treatments &amp; retreats</h2>
            <button
              type="button"
              className="rounded-full border border-veda-300 px-3 py-1 text-sm hover:bg-veda-50"
              onClick={addTreatment}
            >
              + Add
            </button>
          </div>
          <p className="text-sm text-foreground/60">
            Save each treatment before adding another. Delete asks for confirmation first.
          </p>
          {treatments.map((t, i) => (
            <div
              key={t.id ?? t.clientKey ?? `new-${i}`}
              ref={i === treatments.length - 1 ? lastTreatmentRef : undefined}
              className="space-y-2 rounded-xl border border-veda-100 p-3"
            >
              <div className="grid items-start gap-2 sm:grid-cols-2">
                <label className={label}>
                  Treatment name
                  <input
                    className={input}
                    placeholder="Treatment name"
                    value={t.name}
                    onChange={(e) =>
                      setTreatments((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                </label>
                <label className={label}>
                  Treatment category
                  <select
                    className={input}
                    value={t.categoryId}
                    onChange={(e) =>
                      setTreatments((list) =>
                        list.map((x, j) => (j === i ? { ...x, categoryId: Number(e.target.value) } : x))
                      )
                    }
                  >
                    {meta.treatmentCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  Type
                  <select
                    className={input}
                    value={t.kind}
                    onChange={(e) => {
                      const kind = e.target.value as "session" | "retreat";
                      setTreatments((list) =>
                        list.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                kind,
                                durationMinutes: kind === "session" ? x.durationMinutes || 60 : null,
                                nights: kind === "retreat" ? x.nights || 3 : null,
                              }
                            : x
                        )
                      );
                    }}
                  >
                    <option value="session">Session (time slot)</option>
                    <option value="retreat">Retreat (multi-day)</option>
                  </select>
                </label>
                {t.kind === "session" ? (
                  <div>
                    <span className="mb-1 block text-sm font-medium">Duration</span>
                    <PostfixInput
                      suffix="Minutes"
                      placeholder="60"
                      value={t.durationMinutes}
                      onChangeValue={(n) =>
                        setTreatments((list) =>
                          list.map((x, j) => (j === i ? { ...x, durationMinutes: n } : x))
                        )
                      }
                      aria-label="Duration in minutes"
                    />
                  </div>
                ) : (
                  <div>
                    <span className="mb-1 block text-sm font-medium">Length</span>
                    <PostfixInput
                      suffix="Nights"
                      placeholder="3"
                      value={t.nights}
                      onChangeValue={(n) =>
                        setTreatments((list) =>
                          list.map((x, j) => (j === i ? { ...x, nights: n } : x))
                        )
                      }
                      aria-label="Length in nights"
                    />
                  </div>
                )}
                <div>
                  <span className="mb-1 block text-sm font-medium">Amount</span>
                  <DollarInput
                    valueMinor={t.priceMinor}
                    onChangeMinor={(minor) =>
                      setTreatments((list) =>
                        list.map((x, j) => (j === i ? { ...x, priceMinor: minor } : x))
                      )
                    }
                    aria-label="Amount"
                  />
                </div>
                <label className="flex h-[42px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.isActive}
                    onChange={(e) =>
                      setTreatments((list) =>
                        list.map((x, j) => (j === i ? { ...x, isActive: e.target.checked } : x))
                      )
                    }
                  />
                  Active
                </label>
              </div>
              {t.kind === "retreat" ? (
                <div className="rounded-lg border border-veda-100 bg-veda-50/40 p-3">
                  <p className="text-sm font-medium">Start dates</p>
                  <p className="mt-0.5 text-xs text-foreground/55">
                    Guests pick one of these dates on the listing. Capacity is how many people can start that day.
                  </p>
                  {!t.id ? (
                    <p className="mt-2 text-sm text-foreground/60">Save this retreat first, then add start dates.</p>
                  ) : (
                    <>
                      {t.slots.length === 0 ? (
                        <p className="mt-2 text-sm text-foreground/60">No start dates yet.</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {t.slots.map((slot) => (
                            <li key={slot.id} className="flex items-center justify-between gap-2 text-sm">
                              <span>
                                {slot.startDate} · {slot.capacity} spot{slot.capacity === 1 ? "" : "s"}
                              </span>
                              <button
                                type="button"
                                onClick={() => void removeRetreatSlot(t, i, slot)}
                                className="text-red-700 hover:underline"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto]">
                        <label className={label}>
                          Date
                          <DateField
                            value={t.newStartDate}
                            minDate="today"
                            onChange={(next) =>
                              setTreatments((list) =>
                                list.map((x, j) => (j === i ? { ...x, newStartDate: next } : x))
                              )
                            }
                          />
                        </label>
                        <label className={label}>
                          Capacity
                          <input
                            type="number"
                            min={1}
                            max={500}
                            className={input}
                            value={t.newCapacity}
                            onChange={(e) =>
                              setTreatments((list) =>
                                list.map((x, j) =>
                                  j === i ? { ...x, newCapacity: Number(e.target.value) || 0 } : x
                                )
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void addRetreatSlot(t, i)}
                          className="rounded-full border border-veda-300 px-4 py-2 text-sm hover:bg-veda-50"
                        >
                          Add date
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveTreatment(t, i)}
                  className="rounded-full bg-veda-700 px-4 py-1.5 text-sm text-white hover:bg-veda-600"
                >
                  Save treatment
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTreatment(t, i)}
                  className="rounded-full border border-red-200 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <div className="sticky bottom-4 mt-6 flex items-center gap-3 rounded-2xl border border-veda-200 bg-white p-4 shadow-lg">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => set({ isPublished: e.target.checked })}
          />
          Published
        </label>
        <button
          onClick={save}
          disabled={busy || !form.name || !form.countryId || !form.cityName.trim()}
          className="ml-auto rounded-full bg-turmeric-400 px-6 py-2 font-semibold text-veda-900 hover:bg-turmeric-300 disabled:opacity-50"
        >
          {busy ? "Saving\u2026" : isNew ? "Create listing" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
