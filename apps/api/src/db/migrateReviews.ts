import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(here, "migrations/002_review_upgrade.sql"), "utf8");
  const conn = await mysql.createConnection({
    ...config.db,
    multipleStatements: true,
  });
  console.log("Applying review upgrade to", config.db.database);
  await conn.query(sql);
  await conn.end();
  console.log("Review tables upgraded. Re-seed reviews with db:seed or the seed-reviews script.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
