import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig(process.env);
const app = createApp();

const server = Bun.serve({ port: config.port, fetch: app.fetch });
console.log(JSON.stringify({ level: "info", msg: "server started", port: server.port }));

// docker stop sends SIGTERM: finish open requests, then exit.
process.on("SIGTERM", async () => {
  await server.stop();
  process.exit(0);
});
