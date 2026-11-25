"use client";

import { useParams } from "next/navigation";
import { AdminClinicForm } from "@/components/admin/AdminClinicForm";

export default function AdminEditClinicPage() {
  const params = useParams<{ id: string }>();
  const spaId = Number(params.id);
  if (!Number.isInteger(spaId) || spaId <= 0) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-foreground/60">Invalid clinic.</div>;
  }
  return <AdminClinicForm mode="edit" spaId={spaId} />;
}
