import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

const databasePath = process.env.DATABASE_URL ?? "./data/fund-assistant.db";
const resolvedPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), databasePath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const sqlite = new Database(resolvedPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DbTransaction;
let migrated = false;

export function ensureDatabase() {
  if (!migrated) {
    migrate(db, {
      migrationsFolder: path.resolve(/* turbopackIgnore: true */ process.cwd(), "drizzle"),
    });
    migrated = true;
  }
  return db;
}

export function runInTransaction<T>(work: (tx: DbTransaction) => T): T {
  ensureDatabase();
  return db.transaction((tx) => work(tx));
}
