// Regenerates the documentation examples from a real run:
//   1. starts the real app over HTTP (on a spare port) against TEST_DATABASE_URL, reseeded
//   2. sends every documented request and records exactly what came back -> docs/examples.json
//   3. builds the Postman collection and environment from those recordings
// docs/openapi.yaml is written by hand; tests/docs.test.ts checks its examples against docs/examples.json.
//   bun run docs
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { connect } from "../src/db/connection";
import { runMigrations } from "../src/db/migrate";
import { resetAndSeed } from "../src/db/seed";

const DOCS = new URL("../docs/", import.meta.url).pathname;
const WRONG_KEY = "not-a-real-key-0000000000";

type Key = "read" | "admin" | "wrong";
type ExampleRequest = {
  name: string; // id used by openapi.yaml and the docs test
  title: string; // Postman request name
  folder: string;
  method: string;
  path: string;
  key?: Key;
  accept?: string;
  body?: unknown; // objects are sent as JSON; strings are sent as-is
  contentType?: string;
};

export type Captured = {
  name: string;
  title: string;
  folder: string;
  request: { method: string; path: string; headers: Record<string, string>; body?: string };
  response: { status: number; headers: Record<string, string>; body: unknown };
};

const demoStudent = {
  student_id: "2026-00999",
  first_name: "Demo",
  last_name: "Student",
  course: "BSIT",
  year_level: 1,
  section: "IT1A",
  status: "Active",
};
const { student_id: _, ...demoUpdate } = { ...demoStudent, year_level: 2, section: "IT2B", status: "Inactive" };

// In this order: later requests depend on earlier ones (create -> update -> delete).
const REQUESTS: ExampleRequest[] = [
  { name: "health", title: "Health check", folder: "Health", method: "GET", path: "/health" },

  { name: "get_student", title: "Get student", folder: "Students", method: "GET", path: "/api/v1/students/2024-00309", key: "read" },
  { name: "get_student_graduated", title: "Get student (graduated, still returned)", folder: "Students", method: "GET", path: "/api/v1/students/2023-00501", key: "read" },
  { name: "get_student_not_found", title: "Get student - 404 not found", folder: "Students", method: "GET", path: "/api/v1/students/2026-99999", key: "read" },
  { name: "missing_api_key", title: "Get student - 401 missing key", folder: "Auth errors", method: "GET", path: "/api/v1/students/2024-00309" },
  { name: "invalid_api_key", title: "Get student - 401 invalid key", folder: "Auth errors", method: "GET", path: "/api/v1/students/2024-00309", key: "wrong" },

  { name: "roster", title: "Section roster (JSON)", folder: "Sections", method: "GET", path: "/api/v1/sections/IT3A/students", key: "read" },
  { name: "roster_status_filter", title: "Section roster - status filter, any-case section", folder: "Sections", method: "GET", path: "/api/v1/sections/it1a/students?status=Inactive", key: "read" },
  { name: "roster_xml", title: "Section roster (XML via Accept header)", folder: "Sections", method: "GET", path: "/api/v1/sections/CS4A/students?status=Graduated", key: "read", accept: "application/xml" },
  { name: "roster_xml_format", title: "Section roster (XML via ?format=xml)", folder: "Sections", method: "GET", path: "/api/v1/sections/IT3A/students?format=xml", key: "read" },
  { name: "roster_not_found", title: "Section roster - 404 unknown section", folder: "Sections", method: "GET", path: "/api/v1/sections/ZZ9Z/students", key: "read" },
  { name: "roster_invalid_status", title: "Section roster - 422 invalid status", folder: "Sections", method: "GET", path: "/api/v1/sections/IT1A/students?status=Dropped", key: "read" },

  { name: "create_student", title: "Create student", folder: "Admin: create, update, delete", method: "POST", path: "/api/v1/students", key: "admin", body: demoStudent },
  { name: "create_student_duplicate", title: "Create student - 409 duplicate", folder: "Admin: create, update, delete", method: "POST", path: "/api/v1/students", key: "admin", body: demoStudent },
  { name: "create_student_read_key", title: "Create student - 403 read key", folder: "Auth errors", method: "POST", path: "/api/v1/students", key: "read", body: demoStudent },
  { name: "create_student_invalid", title: "Create student - 422 validation", folder: "Admin: create, update, delete", method: "POST", path: "/api/v1/students", key: "admin", body: { student_id: "26-999", first_name: "Demo", last_name: "", course: "BSIT", year_level: 7, section: "IT1A" } },
  { name: "create_student_wrong_content_type", title: "Create student - 415 wrong content type", folder: "Admin: create, update, delete", method: "POST", path: "/api/v1/students", key: "admin", body: JSON.stringify(demoStudent), contentType: "text/plain" },
  { name: "create_student_malformed_json", title: "Create student - 400 malformed JSON", folder: "Admin: create, update, delete", method: "POST", path: "/api/v1/students", key: "admin", body: '{"student_id": "2026-00999", "first_name": ' },
  { name: "update_student", title: "Update student (full replace)", folder: "Admin: create, update, delete", method: "PUT", path: "/api/v1/students/2026-00999", key: "admin", body: demoUpdate },
  { name: "update_student_id_mismatch", title: "Update student - 422 student_id mismatch", folder: "Admin: create, update, delete", method: "PUT", path: "/api/v1/students/2026-00999", key: "admin", body: { ...demoUpdate, student_id: "2026-00998" } },
  { name: "update_student_not_found", title: "Update student - 404 not found", folder: "Admin: create, update, delete", method: "PUT", path: "/api/v1/students/2026-99999", key: "admin", body: demoUpdate },
  { name: "delete_student", title: "Delete student", folder: "Admin: create, update, delete", method: "DELETE", path: "/api/v1/students/2026-00999", key: "admin" },
  { name: "delete_student_not_found", title: "Delete student - 404 not found", folder: "Admin: create, update, delete", method: "DELETE", path: "/api/v1/students/2026-00999", key: "admin" },

  { name: "route_not_found", title: "Unknown route - 404", folder: "Auth errors", method: "GET", path: "/api/v1/teachers", key: "read" },
];

const KEPT_HEADERS = ["content-type", "location", "retry-after"];

async function capture(baseUrl: string, keys: Record<Key, string>, ex: ExampleRequest): Promise<Captured> {
  const sent: Record<string, string> = {};
  const recorded: Record<string, string> = {};
  if (ex.key) {
    sent["X-API-Key"] = keys[ex.key];
    recorded["X-API-Key"] = ex.key === "wrong" ? WRONG_KEY : `{{${ex.key}Key}}`; // never write real keys to docs
  }
  if (ex.accept) sent["Accept"] = recorded["Accept"] = ex.accept;
  let body: string | undefined;
  if (ex.body !== undefined) {
    body = typeof ex.body === "string" ? ex.body : JSON.stringify(ex.body, null, 2);
    sent["Content-Type"] = recorded["Content-Type"] = ex.contentType ?? "application/json";
  }

  const res = await fetch(baseUrl + ex.path, { method: ex.method, headers: sent, body });
  const text = await res.text();
  const headers: Record<string, string> = {};
  for (const h of KEPT_HEADERS) {
    const v = res.headers.get(h);
    if (v !== null) headers[h] = v;
  }
  const isJson = (headers["content-type"] ?? "").includes("application/json");
  return {
    name: ex.name,
    title: ex.title,
    folder: ex.folder,
    request: { method: ex.method, path: ex.path, headers: recorded, ...(body !== undefined ? { body } : {}) },
    response: { status: res.status, headers, body: isJson ? JSON.parse(text) : text === "" ? null : text },
  };
}

// ---------------------------------------------------------------- capture

const config = loadConfig(process.env);
const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) throw new Error("TEST_DATABASE_URL is not set");
const keys: Record<Key, string> = { read: config.readKey, admin: config.adminKey, wrong: WRONG_KEY };
const quiet = () => {};

const db = connect(testDbUrl);
await runMigrations(db);
await resetAndSeed(db);

const server = Bun.serve({ port: 0, fetch: createApp({ db, config, log: quiet }).fetch });
const baseUrl = `http://localhost:${server.port}`;

const captured: Captured[] = [];
for (const ex of REQUESTS) captured.push(await capture(baseUrl, keys, ex));

// 429: keep calling with the read key until the real limit (RATE_LIMIT_PER_MINUTE) is hit.
const rateLimitedReq: ExampleRequest = { name: "rate_limited", title: "Get student - 429 rate limited", folder: "Students", method: "GET", path: "/api/v1/students/2024-00309", key: "read" };
let limited: Captured | undefined;
for (let i = 0; i <= config.rateLimitPerMinute + 1 && !limited; i++) {
  const c = await capture(baseUrl, keys, rateLimitedReq);
  if (c.response.status === 429) limited = c;
}
if (!limited) throw new Error("Did not reach the rate limit");
captured.push(limited);
await server.stop();

// 500: the same app pointed at a database that refuses connections.
const brokenDb = connect("mysql://registry:x@127.0.0.1:1/none?sslmode=require");
const broken = Bun.serve({ port: 0, fetch: createApp({ db: brokenDb, config, log: quiet }).fetch });
captured.push(
  await capture(`http://localhost:${broken.port}`, keys, {
    name: "internal_error", title: "Get student - 500 database unavailable", folder: "Students", method: "GET", path: "/api/v1/students/2024-00309", key: "read",
  }),
);
await broken.stop();
await db.close();

await Bun.write(DOCS + "examples.json", JSON.stringify(captured, null, 2) + "\n");

// ---------------------------------------------------------------- Postman

const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
  404: "Not Found", 409: "Conflict", 415: "Unsupported Media Type", 422: "Unprocessable Entity",
  429: "Too Many Requests", 500: "Internal Server Error",
};

function postmanRequest(c: Captured) {
  const [pathPart, queryPart] = c.request.path.split("?");
  return {
    method: c.request.method,
    header: Object.entries(c.request.headers).map(([key, value]) => ({ key, value })),
    ...(c.request.body !== undefined
      ? { body: { mode: "raw", raw: c.request.body, options: { raw: { language: c.request.headers["Content-Type"] === "application/json" ? "json" : "text" } } } }
      : {}),
    url: {
      raw: "{{baseUrl}}" + c.request.path,
      host: ["{{baseUrl}}"],
      path: pathPart!.split("/").filter(Boolean),
      ...(queryPart ? { query: queryPart.split("&").map((p) => ({ key: p.split("=")[0], value: p.split("=")[1] })) } : {}),
    },
  };
}

function savedExample(c: Captured) {
  const body = c.response.body === null ? "" : typeof c.response.body === "string" ? c.response.body : JSON.stringify(c.response.body, null, 2);
  const ct = c.response.headers["content-type"] ?? "";
  return {
    name: `${c.response.status} ${STATUS_TEXT[c.response.status]} (${c.name})`,
    originalRequest: postmanRequest(c),
    status: STATUS_TEXT[c.response.status],
    code: c.response.status,
    _postman_previewlanguage: ct.includes("xml") ? "xml" : ct.includes("json") ? "json" : "text",
    header: Object.entries(c.response.headers).map(([key, value]) => ({ key, value })),
    body,
  };
}

const q = (v: unknown) => JSON.stringify(v);

// A test script per request: status code, X-Request-Id, and the body's shape.
function testScript(c: Captured): string[] {
  const { status, body } = c.response;
  const lines = [
    `pm.test("Status is ${status}", () => pm.response.to.have.status(${status}));`,
    `pm.test("Has X-Request-Id header", () => pm.response.to.have.header("X-Request-Id"));`,
  ];
  if (status === 204) {
    lines.push(`pm.test("Body is empty", () => pm.expect(pm.response.text()).to.eql(""));`);
  } else if (typeof body === "string") {
    lines.push(
      `pm.test("Body is an XML roster", () => {`,
      `  pm.expect(pm.response.headers.get("Content-Type")).to.include("application/xml");`,
      `  const xml = pm.response.text();`,
      `  pm.expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).to.be.true;`,
      `  pm.expect(xml).to.include("<roster>").and.include("</roster>");`,
      `  const count = Number(xml.match(/<count>(\\d+)<\\/count>/)[1]);`,
      `  pm.expect((xml.match(/<student>/g) || []).length).to.eql(count);`,
      `});`,
    );
  } else if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error: { code: string; details?: unknown } }).error;
    lines.push(
      `pm.test("Error shape with code ${error.code}", () => {`,
      `  const e = pm.response.json().error;`,
      `  pm.expect(e).to.have.all.keys(${q(Object.keys(error))});`,
      `  pm.expect(e.code).to.eql(${q(error.code)});`,
      `  pm.expect(e.message).to.be.a("string");`,
      `});`,
    );
  } else if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    lines.push(
      `pm.test("Body has the expected fields", () => {`,
      `  const b = pm.response.json();`,
      `  pm.expect(b).to.have.all.keys(${q(Object.keys(b))});`,
    );
    if (Array.isArray(b.students)) {
      const studentKeys = ["student_id", "first_name", "last_name", "course", "year_level", "section", "status", "created_at", "updated_at"];
      lines.push(
        `  pm.expect(b.section).to.eql(${q(b.section)});`,
        `  pm.expect(b.students).to.be.an("array").with.lengthOf(b.count);`,
        `  b.students.forEach((s) => pm.expect(s).to.have.all.keys(${q(studentKeys)}));`,
      );
    } else if ("student_id" in b) {
      lines.push(`  pm.expect(b.student_id).to.eql(${q(b.student_id)});`, `  pm.expect(b.status).to.eql(${q(b.status)});`);
    } else if ("status" in b) {
      lines.push(`  pm.expect(b.status).to.eql(${q(b.status)});`);
    }
    lines.push(`});`);
  }
  if (c.response.headers.location) {
    lines.push(`pm.test("Location header points to the new student", () => pm.expect(pm.response.headers.get("Location")).to.eql(${q(c.response.headers.location)}));`);
  }
  return lines;
}

const byName = new Map(captured.map((c) => [c.name, c]));
const extraExamples: Record<string, string[]> = { get_student: ["rate_limited", "internal_error"] };

// Makes a collection run repeatable: removes the demo student if a previous run stopped half-way.
const setupItem = {
  name: "Setup: remove leftover demo student (204 or 404)",
  event: [{ listen: "test", script: { type: "text/javascript", exec: [`pm.test("Status is 204 or 404", () => pm.expect(pm.response.code).to.be.oneOf([204, 404]));`] } }],
  request: postmanRequest(byName.get("delete_student")!),
};

const folders = new Map<string, unknown[]>();
folders.set("Setup", [setupItem]);
for (const c of captured) {
  if (c.name === "rate_limited" || c.name === "internal_error") continue; // cannot be reproduced in a normal run; saved as examples
  const items = folders.get(c.folder) ?? [];
  items.push({
    name: c.title,
    event: [{ listen: "test", script: { type: "text/javascript", exec: testScript(c) } }],
    request: postmanRequest(c),
    response: [c, ...(extraExamples[c.name] ?? []).map((n) => byName.get(n)!)].map(savedExample),
  });
  folders.set(c.folder, items);
}

const collection = {
  info: {
    name: "School Registry API",
    description:
      "System 2 of the CIT 305 integration project. Select the \"School Registry (local)\" environment, run `bun run seed`, then run the whole collection in order. Examples were recorded from a real run (`bun run docs`).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [...folders].map(([name, item]) => ({ name, item })),
};

const environment = {
  name: "School Registry (local)",
  values: [
    { key: "baseUrl", value: "http://localhost:4000", type: "default", enabled: true },
    { key: "readKey", value: "change-me-read-key-0123456789", type: "secret", enabled: true },
    { key: "adminKey", value: "change-me-admin-key-0123456789", type: "secret", enabled: true },
  ],
  _postman_variable_scope: "environment",
};

await Bun.write(DOCS + "postman_collection.json", JSON.stringify(collection, null, 2) + "\n");
await Bun.write(DOCS + "postman_environment.json", JSON.stringify(environment, null, 2) + "\n");

console.log(`Captured ${captured.length} examples -> docs/examples.json`);
console.log(`Wrote docs/postman_collection.json (${[...folders.values()].flat().length} requests) and docs/postman_environment.json`);
