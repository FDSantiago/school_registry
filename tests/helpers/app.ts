import { createApp } from "../../src/app";
import type { Db } from "../../src/db/connection";

export const READ_KEY = "test-read-key-0123456789";
export const ADMIN_KEY = "test-admin-key-0123456789";

// The app wired to the test database. Log lines are collected in `logs` instead of printed.
export function makeApp(db: Db, options: { rateLimitPerMinute?: number; now?: () => number } = {}) {
  const logs: string[] = [];
  const app = createApp({
    db,
    config: { readKey: READ_KEY, adminKey: ADMIN_KEY, rateLimitPerMinute: options.rateLimitPerMinute ?? 1000 },
    log: (line) => logs.push(line),
    now: options.now,
  });
  return { app, logs };
}

export function sendJson(method: string, body: unknown, key = ADMIN_KEY): RequestInit {
  return {
    method,
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

export const withKey = (key: string, extra: Record<string, string> = {}): RequestInit => ({
  headers: { "X-API-Key": key, ...extra },
});

export const validStudent = {
  student_id: "2026-00123",
  first_name: "Juan",
  last_name: "Tamad",
  course: "BSIT",
  year_level: 3,
  section: "IT3A",
  status: "Active",
};
