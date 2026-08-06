import mysql from "mysql2/promise";
import { config } from "../config.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 10,
  namedPlaceholders: true,
  // All DATETIME values are stored and read as UTC.
  timezone: "Z",
  // Return DECIMAL as number (lat/lng); safe for our precision needs.
  decimalNumbers: true,
  supportBigNumbers: true,
});

export type Row = Record<string, unknown>;

export async function query<T = Row>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params as mysql.QueryOptions["values"]);
  return rows as T[];
}

export async function queryOne<T = Row>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params?: unknown[]): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params as (string | number | null)[]);
  return result as mysql.ResultSetHeader;
}
