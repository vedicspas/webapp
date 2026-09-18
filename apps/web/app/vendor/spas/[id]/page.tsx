"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { useMetaStore } from "@/stores/metaStore";
import { PAYMENT_MODE_LABELS, WEEKDAYS } from "@/lib/format";
import { RemotePhoto } from "@/components/RemotePhoto";

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
  cityId: number;
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
}

const EMPTY: SpaForm = {
  name: "",
  shortDescription: "",
  description: "",
  addressLine: "",
  postalCode: "",
  cityId: 0,
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
  const [photos, setPhotos] = useState<VendorPhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [hours, setHours] = useState(
    Array.from({ length: 7 }, (_, weekday) => ({ weekday, openTime: "09:00", closeTime: "18:00", closed: false }))
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

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
    const data = await call<
      SpaForm & {
        slug?: string;
        treatments: VendorTreatment[];
        photos: VendorPhoto[];
        openHours: { weekday: number; openTime: string; closeTime: string }[];
      }
    >(`/vendor/spas/${id}`);
    setForm({ ...data, depositBps: data.depositBps ?? 2000, bookingFeeMinor: data.bookingFeeMinor ?? 500 });
    setListingSlug(data.slug ?? null);
    setTreatments(data.treatments.map((t) => ({ ...t, isActive: Boolean(t.isActive) })));
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

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        ...form,
        depositBps: form.paymentModeCode === "deposit" ? form.depositBps : null,
        bookingFeeMinor: form.paymentModeCode === "booking_fee" ? form.bookingFeeMinor : null,
        shopifyCollectionHandle: form.shopifyCollectionHandle || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
      };
      if (isNew) {
        const created = await call<{ id: number }>("/vendor/spas", { method: "POST", body });
        router.push(`/vendor/spas/${created.id}`);
        return;
      }
      await call(`/vendor/spas/${id}`, { method: "PUT", body });
      await call(`/vendor/spas/${id}/hours`, {
        method: "PUT",
        body: hours.filter((h) => !h.closed).map(({ weekday, openTime, closeTime }) => ({ weekday, openTime, closeTime })),
      });
      setMessage("Saved.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
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
    setMessage(null);
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
      setMessage(
        uploaded.length === 1
          ? "Photo uploaded. The first photo is used on search cards."
          : `${uploaded.length} photos uploaded. The first photo is used on search cards.`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not upload photos");
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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update title");
    }
  }

  async function removePhoto(photoId: number) {
    try {
      await call(`/vendor/photos/${photoId}`, { method: "DELETE" });
      setPhotos((list) => list.filter((p) => p.id !== photoId));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove photo");
    }
  }

  function addTreatment() {
    const last = treatments[treatments.length - 1];
    if (last && !treatmentFinished(last)) {
      const missing = treatmentReadyToSave(last);
      setMessage(
        missing
          ? `Finish the treatment above first. ${missing}`
          : "Save the treatment above before adding another."
      );
      return;
    }
    setMessage(null);
    setTreatments((list) => [...list, blankTreatment(meta.treatmentCategories[0]?.id ?? 1)]);
  }

  async function saveTreatment(t: VendorTreatment, index: number) {
    const missing = treatmentReadyToSave(t);
    if (missing) {
      setMessage(missing);
      return;
    }
    try {
      const body = {
        ...t,
        name: t.name.trim(),
        durationMinutes: t.kind === "session" ? t.durationMinutes : null,
        nights: t.kind === "retreat" ? t.nights : null,
      };
      if (t.id) {
        await call(`/vendor/treatments/${t.id}`, { method: "PUT", body });
      } else {
        const created = await call<{ id: number }>(`/vendor/spas/${id}/treatments`, { method: "POST", body });
        setTreatments((list) => list.map((x, i) => (i === index ? { ...x, id: created.id } : x)));
      }
      setMessage("Treatment saved.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Treatment save failed");
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
      setMessage("Treatment discarded.");
      return;
    }
    try {
      await call(`/vendor/treatments/${t.id}`, { method: "DELETE" });
      setTreatments((list) => list.filter((_, i) => i !== index));
      setMessage("Treatment deleted.");
      await refreshPublicSpaPage(listingSlug);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete treatment");
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
            City
            <select
              className={input}
              value={form.cityId || ""}
              onChange={(e) => {
                const cityId = Number(e.target.value);
                const city = meta.cities.find((c) => c.id === cityId);
                set({ cityId, lat: form.lat || city?.lat || 0, lng: form.lng || city?.lng || 0 });
              }}
            >
              <option value="">Select a city</option>
              {meta.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Address
            <input className={input} value={form.addressLine} onChange={(e) => set({ addressLine: e.target.value })} />
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
            Booking fee (in cents, e.g. 500 = $5)
            <input
              className={input}
              type="number"
              min={100}
              value={form.bookingFeeMinor ?? 500}
              onChange={(e) => set({ bookingFeeMinor: Number(e.target.value) })}
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
            <div key={t.id ?? t.clientKey ?? `new-${i}`} className="space-y-2 rounded-xl border border-veda-100 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className={input}
                  placeholder="Treatment name"
                  value={t.name}
                  onChange={(e) =>
                    setTreatments((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
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
                <select
                  className={input}
                  value={t.kind}
                  onChange={(e) =>
                    setTreatments((list) =>
                      list.map((x, j) => (j === i ? { ...x, kind: e.target.value as "session" } : x))
                    )
                  }
                >
                  <option value="session">Session (time slot)</option>
                  <option value="retreat">Retreat (multi-day)</option>
                </select>
                {t.kind === "session" ? (
                  <input
                    className={input}
                    type="number"
                    placeholder="Duration (minutes)"
                    value={t.durationMinutes ?? ""}
                    onChange={(e) =>
                      setTreatments((list) =>
                        list.map((x, j) => (j === i ? { ...x, durationMinutes: Number(e.target.value) } : x))
                      )
                    }
                  />
                ) : (
                  <input
                    className={input}
                    type="number"
                    placeholder="Nights"
                    value={t.nights ?? ""}
                    onChange={(e) =>
                      setTreatments((list) =>
                        list.map((x, j) => (j === i ? { ...x, nights: Number(e.target.value) } : x))
                      )
                    }
                  />
                )}
                <input
                  className={input}
                  type="number"
                  placeholder="Price in cents (e.g. 4500 = $45)"
                  value={t.priceMinor}
                  onChange={(e) =>
                    setTreatments((list) =>
                      list.map((x, j) => (j === i ? { ...x, priceMinor: Number(e.target.value) } : x))
                    )
                  }
                />
                <label className="flex items-center gap-2 text-sm">
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
          disabled={busy || !form.name || !form.cityId}
          className="ml-auto rounded-full bg-turmeric-400 px-6 py-2 font-semibold text-veda-900 hover:bg-turmeric-300 disabled:opacity-50"
        >
          {busy ? "Saving\u2026" : isNew ? "Create listing" : "Save changes"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-veda-700">{message}</p> : null}
    </div>
  );
}
