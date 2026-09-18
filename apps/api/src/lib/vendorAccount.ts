import { execute, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";

/** Create a vendor row if needed and set the user role to vendor. */
export async function ensureVendorAccount(userId: number, businessName: string): Promise<void> {
  const existing = await queryOne<{ id: number }>("SELECT id FROM vendors WHERE user_id = ?", [userId]);
  if (!existing) {
    await execute("INSERT INTO vendors (user_id, business_name) VALUES (?,?)", [
      userId,
      businessName.slice(0, 160),
    ]);
  }
  await execute("UPDATE users SET role_id = ? WHERE id = ?", [
    staticCache.roleByCode("vendor")!.id,
    userId,
  ]);
}
