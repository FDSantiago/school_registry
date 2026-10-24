import { SQL } from "bun";

export type Db = SQL;

// Bun's built-in MySQL client. The URL decides the driver (mysql://) and the options (?sslmode=require).
export function connect(databaseUrl: string): Db {
  return new SQL(databaseUrl);
}
