import { execute, query } from "../db/pool.js";

export type SpaEditAction = "updated" | "photo_added" | "photo_removed";

export async function recordSpaAdminEdit(
  spaId: number,
  userId: number,
  action: SpaEditAction = "updated"
): Promise<void> {
  await execute("UPDATE spas SET updated_at = UTC_TIMESTAMP(), updated_by_user_id = ? WHERE id = ?", [
    userId,
    spaId,
  ]);
  await execute("INSERT INTO spa_edit_events (spa_id, action, created_by_user_id) VALUES (?,?,?)", [
    spaId,
    action,
    userId,
  ]);
}

export async function loadSpaEditLog(spaId: number, limit = 30): Promise<
  Array<{ id: number; action: SpaEditAction; createdAt: string; editorName: string }>
> {
  const rows = await query<{
    id: number;
    action: SpaEditAction;
    created_at: Date | string;
    editor_name: string | null;
  }>(
    `SELECT e.id, e.action, e.created_at, u.name AS editor_name
     FROM spa_edit_events e
     LEFT JOIN users u ON u.id = e.created_by_user_id
     WHERE e.spa_id = ?
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ${limit}`,
    [spaId]
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    createdAt: new Date(row.created_at).toISOString(),
    editorName: row.editor_name?.trim() || "Admin",
  }));
}
