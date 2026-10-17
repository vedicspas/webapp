import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config.js";
import { ACCOMMODATION_NAMES, DIETARY_NAMES, LANGUAGE_NAMES, countriesInsertSql } from "./lookups.js";

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
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS accessibility TEXT NULL");
  await run(
    conn,
    "ALTER TABLE spas ADD COLUMN IF NOT EXISTS family_accommodation ENUM('on_request','not_available') NULL"
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
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_accommodation_types (
      spa_id BIGINT UNSIGNED NOT NULL,
      accommodation_type_id SMALLINT UNSIGNED NOT NULL,
      PRIMARY KEY (spa_id, accommodation_type_id),
      CONSTRAINT fk_sat_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
      CONSTRAINT fk_sat_type FOREIGN KEY (accommodation_type_id) REFERENCES accommodation_types(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS accommodation_other VARCHAR(200) NULL");
  await conn.query(insertIgnore("languages", LANGUAGE_NAMES));
  await conn.query(insertIgnore("dietary_options", DIETARY_NAMES));
  await conn.query(insertIgnore("accommodation_types", ACCOMMODATION_NAMES));

  const [legacyAccCol] = await conn.query("SHOW COLUMNS FROM spas LIKE 'accommodation_type_id'");
  if (Array.isArray(legacyAccCol) && legacyAccCol.length > 0) {
    await conn.query(
      `INSERT IGNORE INTO spa_accommodation_types (spa_id, accommodation_type_id)
       SELECT id, accommodation_type_id FROM spas WHERE accommodation_type_id IS NOT NULL`
    );
    await run(conn, "ALTER TABLE spas DROP FOREIGN KEY fk_spa_accommodation");
    await run(conn, "ALTER TABLE spas DROP COLUMN accommodation_type_id");
  }

  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS clinic_code CHAR(6) NULL");
  const [spaRows] = await conn.query("SELECT id FROM spas WHERE clinic_code IS NULL OR clinic_code = ''");
  if (Array.isArray(spaRows)) {
    const used = new Set<string>();
    const [existingCodes] = await conn.query("SELECT clinic_code FROM spas WHERE clinic_code IS NOT NULL AND clinic_code <> ''");
    if (Array.isArray(existingCodes)) {
      for (const row of existingCodes as { clinic_code: string }[]) used.add(row.clinic_code);
    }
    function nextClinicCode(): string {
      for (let n = 0; n < 10000; n++) {
        const code = `AA${String(n).padStart(4, "0")}`;
        if (!used.has(code)) {
          used.add(code);
          return code;
        }
      }
      throw new Error("No clinic IDs remaining");
    }
    for (const row of spaRows as { id: number }[]) {
      const code = nextClinicCode();
      await conn.query("UPDATE spas SET clinic_code = ? WHERE id = ?", [code, row.id]);
    }
  }
  await run(conn, "ALTER TABLE spas MODIFY COLUMN clinic_code CHAR(6) NOT NULL");
  await run(conn, "ALTER TABLE spas ADD UNIQUE KEY uq_spa_clinic_code (clinic_code)");
  await run(conn, "ALTER TABLE bookings MODIFY COLUMN code VARCHAR(24) NOT NULL");

  const [bookingRows] = await conn.query(
    `SELECT b.id, b.code, b.created_at, s.clinic_code
     FROM bookings b JOIN spas s ON s.id = b.spa_id`
  );
  if (Array.isArray(bookingRows)) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const usedCodes = new Set(
      (bookingRows as { code: string }[])
        .map((r) => r.code)
        .filter((c) => /^[A-Z]{2}\d{4}-\d{6}-[A-Z0-9]{4}$/.test(c))
    );
    function stamp(d: Date): string {
      const y = d.getUTCFullYear() % 100;
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return `${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}`;
    }
    function suffix(): string {
      let s = "";
      for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }
    for (const row of bookingRows as { id: number; code: string; created_at: Date | string; clinic_code: string }[]) {
      if (/^[A-Z]{2}\d{4}-\d{6}-[A-Z0-9]{4}$/.test(row.code)) continue;
      const at = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      let next = "";
      for (let i = 0; i < 40; i++) {
        next = `${row.clinic_code}-${stamp(at)}-${suffix()}`;
        if (!usedCodes.has(next)) break;
      }
      usedCodes.add(next);
      await conn.query("UPDATE bookings SET code = ? WHERE id = ?", [next, row.id]);
    }
  }

  await conn.query(
    "INSERT IGNORE INTO treatment_categories (slug, name) VALUES ('other', 'Other')"
  );

  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS site_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value VARCHAR(500) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS contact_messages (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      subject VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_contact_created (created_at),
      KEY idx_contact_read (is_read),
      CONSTRAINT fk_contact_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(conn, "ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS is_read TINYINT(1) NOT NULL DEFAULT 0");
  await run(conn, "ALTER TABLE contact_messages ADD KEY idx_contact_read (is_read)");

  await conn.query(countriesInsertSql());
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS country_id SMALLINT UNSIGNED NULL");
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS state VARCHAR(100) NOT NULL DEFAULT ''");
  await run(conn, "ALTER TABLE spas ADD COLUMN IF NOT EXISTS city_name VARCHAR(100) NOT NULL DEFAULT ''");
  await conn.query(
    `UPDATE spas s JOIN cities c ON c.id = s.city_id
     SET s.city_name = IF(s.city_name = '', c.name, s.city_name),
         s.country_id = COALESCE(s.country_id, c.country_id)
     WHERE s.city_id IS NOT NULL`
  );
  await conn.query(
    `UPDATE spas SET state = CASE city_name
       WHEN 'Rishikesh' THEN 'Uttarakhand'
       WHEN 'Kochi' THEN 'Kerala'
       WHEN 'Goa' THEN 'Goa'
       WHEN 'Colombo' THEN 'Western Province'
       WHEN 'Ubud' THEN 'Bali'
       WHEN 'Sedona' THEN 'Arizona'
       ELSE state
     END
     WHERE state = '' AND city_name IN ('Rishikesh','Kochi','Goa','Colombo','Ubud','Sedona')`
  );
  await run(conn, "ALTER TABLE spas MODIFY COLUMN city_id INT UNSIGNED NULL");
  await run(
    conn,
    `ALTER TABLE spas ADD CONSTRAINT fk_spa_country
      FOREIGN KEY (country_id) REFERENCES countries(id)`
  );

  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS email_log (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      email_type VARCHAR(64) NOT NULL,
      to_email VARCHAR(255) NOT NULL,
      from_email VARCHAR(255) NOT NULL DEFAULT '',
      subject VARCHAR(255) NOT NULL,
      html_body MEDIUMTEXT NOT NULL,
      text_body TEXT NOT NULL,
      status ENUM('sent','skipped','failed') NOT NULL,
      error VARCHAR(500) NULL,
      KEY idx_email_log_sent (sent_at),
      KEY idx_email_log_to (to_email),
      KEY idx_email_log_type (email_type),
      KEY idx_email_log_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS email_unsubscribes (
      email VARCHAR(255) NOT NULL PRIMARY KEY,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await run(conn, "ALTER TABLE spas DROP FOREIGN KEY fk_spa_vendor");
  await run(conn, "ALTER TABLE spas MODIFY vendor_id BIGINT UNSIGNED NULL");
  await run(
    conn,
    `ALTER TABLE spas ADD CONSTRAINT fk_spa_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)`
  );
  await run(
    conn,
    `ALTER TABLE spas ADD COLUMN IF NOT EXISTS origin ENUM('vendor','admin','imported') NOT NULL DEFAULT 'vendor'`
  );
  await run(conn, "ALTER TABLE spas MODIFY lat DECIMAL(9,6) NULL");
  await run(conn, "ALTER TABLE spas MODIFY lng DECIMAL(9,6) NULL");
  await run(conn, "ALTER TABLE spas ADD KEY idx_spa_origin (origin)");

  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_claims (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      spa_id BIGINT UNSIGNED NOT NULL,
      vendor_id BIGINT UNSIGNED NOT NULL,
      status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
      contact_name VARCHAR(160) NOT NULL DEFAULT '',
      contact_email VARCHAR(255) NOT NULL DEFAULT '',
      contact_phone VARCHAR(32) NOT NULL DEFAULT '',
      relationship VARCHAR(80) NOT NULL DEFAULT '',
      notes TEXT NULL,
      document_path VARCHAR(500) NULL,
      document_name VARCHAR(255) NULL,
      document_mime VARCHAR(80) NULL,
      otp_verified_at DATETIME NULL,
      submitted_at DATETIME NULL,
      decided_at DATETIME NULL,
      decided_by_user_id BIGINT UNSIGNED NULL,
      rejection_note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_spa_claims_spa (spa_id, status),
      KEY idx_spa_claims_vendor (vendor_id, status),
      CONSTRAINT fk_spa_claim_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE,
      CONSTRAINT fk_spa_claim_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
      CONSTRAINT fk_spa_claim_decided_by FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_claim_otps (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      claim_id BIGINT UNSIGNED NOT NULL,
      email VARCHAR(255) NOT NULL,
      code CHAR(6) NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_claim_otps_claim (claim_id, created_at),
      CONSTRAINT fk_claim_otp_claim FOREIGN KEY (claim_id) REFERENCES spa_claims(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_claim_notes (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      claim_id BIGINT UNSIGNED NOT NULL,
      admin_user_id BIGINT UNSIGNED NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_claim_notes_claim (claim_id, created_at),
      CONSTRAINT fk_claim_note_claim FOREIGN KEY (claim_id) REFERENCES spa_claims(id) ON DELETE CASCADE,
      CONSTRAINT fk_claim_note_admin FOREIGN KEY (admin_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await run(
    conn,
    `CREATE TABLE IF NOT EXISTS spa_inquiries (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      spa_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(32) NULL,
      service ENUM('consultation','massage','general_enquiry') NULL,
      timeframe ENUM('this_week','this_month','exploring') NULL,
      share_consent TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_spa_inquiries_spa (spa_id, created_at),
      KEY idx_spa_inquiries_email (email),
      CONSTRAINT fk_spa_inquiry_spa FOREIGN KEY (spa_id) REFERENCES spas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

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
