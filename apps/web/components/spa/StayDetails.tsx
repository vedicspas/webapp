import type { ReactNode } from "react";
import type { NamedLookup, OnRequestFlag, SpaDetail } from "@vedic/shared";
import { ON_REQUEST_LABELS } from "@/lib/format";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start">
      <dt className="text-sm font-medium text-veda-800">{label}</dt>
      <dd className="text-sm text-foreground/80">{children}</dd>
    </div>
  );
}

function Tags({ items }: { items: NamedLookup[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.id} className="rounded-full bg-veda-100 px-2.5 py-0.5 text-sm text-veda-900">
          {item.name}
        </li>
      ))}
    </ul>
  );
}

function flagLabel(value: OnRequestFlag | null): string | null {
  return value ? ON_REQUEST_LABELS[value] : null;
}

export function StayDetails({ spa }: { spa: SpaDetail }) {
  const languages = spa.languages ?? [];
  const dietaryOptions = spa.dietaryOptions ?? [];
  const airport = flagLabel(spa.airportPickup ?? null);
  const family = flagLabel(spa.familyAccommodation ?? null);
  const hasStay =
    languages.length > 0 ||
    dietaryOptions.length > 0 ||
    airport ||
    spa.accommodationType ||
    spa.accessibility ||
    family;
  if (!hasStay) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-veda-900">Stay &amp; access</h2>
      <dl className="mt-3 space-y-3 rounded-2xl border border-veda-100 bg-white p-4">
        {languages.length > 0 ? (
          <Row label="Languages spoken">
            <Tags items={languages} />
          </Row>
        ) : null}
        {airport ? <Row label="Airport pickup">{airport}</Row> : null}
        {spa.accommodationType ? (
          <Row label="Accommodation type">{spa.accommodationType.name}</Row>
        ) : null}
        {dietaryOptions.length > 0 ? (
          <Row label="Dietary options">
            <Tags items={dietaryOptions} />
          </Row>
        ) : null}
        {spa.accessibility ? (
          <Row label="Accessibility">
            <p className="whitespace-pre-line">{spa.accessibility}</p>
          </Row>
        ) : null}
        {family ? <Row label="Family or companion accommodation">{family}</Row> : null}
      </dl>
    </section>
  );
}
