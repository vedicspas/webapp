import Link from "next/link";
import { shortDate, timeOfDay } from "@/lib/format";

export interface AdminInquiry {
  id: number;
  spaId: number;
  spaName?: string;
  slug?: string;
  clinicCode?: string;
  name: string;
  email: string;
  phone: string | null;
  serviceLabel: string | null;
  timeframeLabel: string | null;
  shareConsent: boolean;
  createdAt: string;
}

export function InquiryTable({
  items,
  showClinic = true,
  highlightId,
}: {
  items: AdminInquiry[];
  showClinic?: boolean;
  highlightId?: number | null;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-veda-100 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-veda-100 bg-veda-50 text-xs uppercase tracking-wide text-foreground/60">
          <tr>
            {showClinic ? <th className="px-4 py-3 font-medium">Clinic</th> : null}
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Phone</th>
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">Timeframe</th>
            <th className="px-4 py-3 font-medium">Consent</th>
            <th className="px-4 py-3 font-medium">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-veda-50 last:border-0 ${
                highlightId === row.id ? "bg-amber-50" : ""
              }`}
            >
              {showClinic ? (
                <td className="px-4 py-3 align-top">
                  {row.slug ? (
                    <Link href={`/spas/${row.slug}`} className="font-medium text-veda-900 hover:underline">
                      {row.spaName}
                    </Link>
                  ) : (
                    <span className="font-medium text-veda-900">{row.spaName}</span>
                  )}
                  {row.clinicCode ? <p className="text-xs text-foreground/60">{row.clinicCode}</p> : null}
                </td>
              ) : null}
              <td className="px-4 py-3 align-top">{row.name}</td>
              <td className="px-4 py-3 align-top break-all">{row.email}</td>
              <td className="px-4 py-3 align-top">{row.phone || "—"}</td>
              <td className="px-4 py-3 align-top">{row.serviceLabel || "—"}</td>
              <td className="px-4 py-3 align-top">{row.timeframeLabel || "—"}</td>
              <td className="px-4 py-3 align-top">{row.shareConsent ? "Yes" : "No"}</td>
              <td className="px-4 py-3 align-top whitespace-nowrap">
                {shortDate(row.createdAt)} {timeOfDay(row.createdAt)}
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={showClinic ? 8 : 7} className="px-4 py-8 text-center text-foreground/50">
                No inquiries yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
