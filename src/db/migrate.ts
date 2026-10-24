import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./connection";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

// Applies every .sql file in migrations/ that has not been applied yet, in file-name order,
// and records each one in schema_migrations. Safe to run on every start.
export async function runMigrations(sql: Db): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )`;

  const rows: { name: string }[] = await sql`SELECT name FROM schema_migrations`;
  const done = new Set(rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
    applied.push(file);
  }
  return applied;
}
