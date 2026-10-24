import { createApp } from "./app";
import { loadConfig } from "./config";
import { connect } from "./db/connection";
import { runMigrations } from "./db/migrate";

const config = loadConfig(process.env);

// Create or update the schema before accepting requests.
const sql = connect(config.databaseUrl);
const applied = await runMigrations(sql);
if (applied.length > 0) console.log(JSON.stringify({ level: "info", msg: "migrations applied", migrations: applied }));

const app = createApp({ db: sql, config });

const server = Bun.serve({ port: config.port, fetch: app.fetch });
console.log(JSON.stringify({ level: "info", msg: "server started", port: server.port }));

// docker stop sends SIGTERM: finish open requests, close the database pool, then exit.
process.on("SIGTERM", async () => {
  await server.stop();
  await sql.close();
  process.exit(0);
});
