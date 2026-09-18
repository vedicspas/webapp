import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  const conn = await mysql.createConnection({
    ...config.db,
    multipleStatements: true,
  });

  // schema.sql starts with DROP TABLE — never re-run against a live database
  // or docker compose rebuilds wipe seeded users and bookings.
  const [existing] = await conn.query("SHOW TABLES LIKE 'users'");
  if (Array.isArray(existing) && existing.length > 0) {
    console.log("Schema already present — skipping migrate.");
    await conn.end();
    return;
  }

  console.log("Applying schema to", config.db.database);
  await conn.query(sql);
  await conn.end();
  console.log("Schema applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
