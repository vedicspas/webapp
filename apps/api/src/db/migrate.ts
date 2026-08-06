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
  console.log("Applying schema to", config.db.database);
  await conn.query(sql);
  await conn.end();
  console.log("Schema applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
