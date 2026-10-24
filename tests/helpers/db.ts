import { connect, type Db } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";

// Opens the test database and makes sure the schema exists.
// Refuses to run against a database whose name does not end in "_test", so tests can never wipe real data.
export async function openTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) throw new Error(`Refusing to run tests against "${dbName}" (name must end in _test)`);
  const sql = connect(url);
  await runMigrations(sql);
  return sql;
}

export async function clearStudents(sql: Db): Promise<void> {
  await sql`DELETE FROM students`;
}
