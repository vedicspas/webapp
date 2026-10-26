import { query } from "../db/pool.js";

export function maskFromWeekdays(days: unknown): number {
  if (!Array.isArray(days)) return 0;
  let mask = 0;
  for (const day of days) {
    const n = Number(day);
    if (Number.isInteger(n) && n >= 0 && n <= 6) mask |= 1 << n;
  }
  return mask;
}

export function weekdaysFromMask(mask: number | null | undefined): number[] {
  const value = Number(mask ?? 0) || 0;
  const days: number[] = [];
  for (let day = 0; day < 7; day++) {
    if (value & (1 << day)) days.push(day);
  }
  return days;
}

export function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function padTime(value: string): string {
  const part = value.slice(0, 8);
  return part.length === 5 ? `${part}:00` : part;
}

export interface ProgramBatchRow {
  id: number;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
}

export interface ProgramRunRow {
  id: number;
  treatmentId: number;
  startDate: string;
  endDate: string;
  batches: ProgramBatchRow[];
}

export async function loadProgramRuns(
  treatmentIds: number[],
  opts?: { upcomingOnly?: boolean; durationByTreatment?: Map<number, number>; cancelledStatusId?: number }
): Promise<Map<number, ProgramRunRow[]>> {
  const byTreatment = new Map<number, ProgramRunRow[]>();
  if (treatmentIds.length === 0) return byTreatment;

  const placeholders = treatmentIds.map(() => "?").join(",");
  const upcoming = opts?.upcomingOnly
    ? " AND r.start_date >= CURDATE()"
    : "";
  const runs = await query<{
    id: number;
    treatmentId: number;
    startDate: string;
  }>(
    `SELECT r.id, r.treatment_id AS treatmentId,
       DATE_FORMAT(r.start_date, '%Y-%m-%d') AS startDate
     FROM program_runs r
     WHERE r.treatment_id IN (${placeholders})${upcoming}
     ORDER BY r.start_date`,
    treatmentIds
  );
  if (runs.length === 0) return byTreatment;

  const runIds = runs.map((r) => r.id);
  const cancelled = opts?.cancelledStatusId;
  const batches = await query<{
    id: number;
    runId: number;
    label: string;
    startTime: string;
    endTime: string;
    capacity: number;
    booked: number;
  }>(
    cancelled != null
      ? `SELECT pb.id, pb.run_id AS runId, pb.label,
           TIME_FORMAT(pb.start_time, '%H:%i') AS startTime,
           TIME_FORMAT(pb.end_time, '%H:%i') AS endTime,
           pb.capacity,
           COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.program_batch_id = pb.id AND b.status_id != ?
           ), 0) AS booked
         FROM program_batches pb
         WHERE pb.run_id IN (${runIds.map(() => "?").join(",")})
         ORDER BY pb.start_time, pb.id`
      : `SELECT pb.id, pb.run_id AS runId, pb.label,
           TIME_FORMAT(pb.start_time, '%H:%i') AS startTime,
           TIME_FORMAT(pb.end_time, '%H:%i') AS endTime,
           pb.capacity, 0 AS booked
         FROM program_batches pb
         WHERE pb.run_id IN (${runIds.map(() => "?").join(",")})
         ORDER BY pb.start_time, pb.id`,
    cancelled != null ? [cancelled, ...runIds] : runIds
  );

  const batchesByRun = new Map<number, ProgramBatchRow[]>();
  for (const row of batches) {
    const list = batchesByRun.get(row.runId) ?? [];
    list.push({
      id: row.id,
      label: row.label ?? "",
      startTime: row.startTime,
      endTime: row.endTime,
      capacity: row.capacity,
      bookedCount: Number(row.booked),
    });
    batchesByRun.set(row.runId, list);
  }

  for (const run of runs) {
    const duration = opts?.durationByTreatment?.get(run.treatmentId) ?? 1;
    const mapped: ProgramRunRow = {
      id: run.id,
      treatmentId: run.treatmentId,
      startDate: run.startDate,
      endDate: addIsoDays(run.startDate, Math.max(1, duration) - 1),
      batches: batchesByRun.get(run.id) ?? [],
    };
    const list = byTreatment.get(run.treatmentId) ?? [];
    list.push(mapped);
    byTreatment.set(run.treatmentId, list);
  }
  return byTreatment;
}
