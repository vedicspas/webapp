import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config.js";
import { ACCOMMODATION_NAMES, DIETARY_NAMES, LANGUAGE_NAMES } from "./lookups.js";

const here = dirname(fileURLToPath(import.meta.url));

async function run(conn: mysql.Connection, sql: string): Promise<void> {
  try {
    await conn.query(sql);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (
      code === "ER_DUP_FIELDNAME" ||
      code === "ER_TABLE_EXISTS_ERROR" ||
      code === "ER_FK_DUP_NAME" ||
      code === "ER_DUP_KEYNAME" ||
      code === "ER_CANT_DROP_FIELD_OR_KEY" ||
      code === "ER_CANT_CREATE_TABLE"
    ) {
      return;
    }
    throw err;
  }
}

function insertIgnore(table: string, names: string[]): string {
  const values = names.map((n) => `('${n.replace(/'/g, "''")}')`).join(", ");
  return `INSERT IGNORE INTO ${table} (name) VALUES ${values}`;
}

async function applyPatches(conn: mysql.Connection): Promise<void> {
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS languages (
      id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(80) NOT NULL UNIQUE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS dietary_options (
      id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(80) NOT NULL UNIQUE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS accommodation_types (
      id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(80) NOT NULL UNIQUE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS airport_pickup ENUM('on_request','not_available') NULL");
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS accommodation_type_id SMALLINT UNSIGNED NULL");
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS accessibility TEXT NULL");
  await run(
    conn,
    "ALTER TABLE spas ADD COLUMN IF NOT EXISTS family_accommodation ENUM('on_request','not_available') NULL"
  );
  await run(
    conn,
    `ALTER TABLE spas ADD CONSTRAINT fk_spa_accommodation
      FOREIGN KEY (accommodation_type_id) REFERENCES accommodation_types(id)`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_languages (
      spa_id BIGINT UNSIGNED NOT NULL,
      language_id SMALLINT UNSIGNED NOT NULL,
      PRIMARY KEY (spa_id, language_id),
      CONSTRAINT fk_sl_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
      CONSTRAINT fk_sl_lang FOREIGN KEY (language_id) REFERENCES languages(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_dietary_options (
      spa_id BIGINT UNSIGNED NOT NULL,
      dietary_option_id SMALLINT UNSIGNED NOT NULL,
      PRIMARY KEY (spa_id, dietary_option_id),
      CONSTRAINT fk_sdo_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
      CONSTRAINT fk_sdo_diet FOREIGN KEY (dietary_option_id) REFERENCES dietary_options(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await conn.query(insertIgnore("languages", LANGUAGE_NAMES));
  await conn.query(insertIgnore("dietary_options", DIETARY_NAMES));
  await conn.query(insertIgnore("accommodation_types", ACCOMMODATION_NAMES));
  console.log("Schema patches applied.");
}

async function main() {
  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  const conn = await mysql.createConnection({
    ...config.db,
    multipleStatements: true,
  });

  const [existing] = await conn.query("SHOW TABLES LIKE 'users'");
  if (Array.isArray(existing) && existing.length > 0) {
    console.log("Schema already present — applying additive patches only.");
    await applyPatches(conn);
    await conn.end();
    return;
  }

  console.log("Applying schema to", config.db.database);
  await conn.query(sql);
  await applyPatches(conn);
  await conn.end();
  console.log("Schema applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
