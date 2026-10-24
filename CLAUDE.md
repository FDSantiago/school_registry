# CLAUDE.md

## Purpose

School Registry is a standalone student/section REST API. It is "System 2" in a CIT 305 Systems Integration and
Architecture final project (TIP Manila): another team's application calls it over HTTP. It is demonstrated live,
so it must stay simple, reliable and easy to explain. It has its own repo, database, tests and README and must not
depend on any other project.

## Stack

Bun 1.4 (runtime, test runner, `Bun.SQL` MySQL client), TypeScript, Hono, zod, MySQL 8.4, Docker Compose. No frontend.

## Where commands run

Development happens in the dev container (`.devcontainer/`: Bun app container + MySQL). From the host, run commands with:

```sh
docker exec -u bun -w /workspaces/sia_school-registry sia_school-registry_devcontainer-app-1 <command>
```

MySQL 8.4 requires `?sslmode=require` on connection URLs (otherwise login fails with ERR_MYSQL_PUBLIC_KEY_RETRIEVAL_NOT_ALLOWED).

## Commands

- `bun run dev`: start with auto-reload on port 4000
- `bun run start`: start
- `bun run build` / `bun run typecheck`: `tsc --noEmit`
- `bun test`: tests (use `TEST_DATABASE_URL`, never the dev database)
- `bun run seed`: reset the database to the fictional seed data
- `docker compose up --build`: production-style run (API + MySQL)
- `bun run docs`: re-record docs/examples.json from a real run and regenerate the Postman collection + environment.
  docs/openapi.yaml is hand-written; tests/docs.test.ts fails if its examples drift from docs/examples.json
  or if docs/examples.json drifts from the app. After changing a response, run `bun run docs`, then update openapi.yaml.
- `bun run docs:lint`: Redocly lint of docs/openapi.yaml (config in redocly.yaml)
- `bun run postman`: run the Postman collection with newman against a running, freshly seeded server

## Data model

`students`: `student_id` (PK, `YYYY-NNNNN`, e.g. `2026-00123`), `first_name`, `last_name`, `course` (e.g. `BSIT`),
`year_level` (1-5), `section` (e.g. `IT3A`), `status` (`Active` | `Inactive` | `Graduated`), `created_at`, `updated_at`.
Seed data: about 40 clearly fictional students across 4-5 sections. No real personal data.

## API contract (base path `/api/v1`, JSON, snake_case)

| Method | Path | Key | Responses |
|---|---|---|---|
| GET | `/health` | none | 200 `{status, version, time}` |
| GET | `/api/v1/students/{student_id}` | read | 200 student (any status) / 404 |
| GET | `/api/v1/sections/{section}/students` | read | 200 `{section, count, students[]}` / 404 if empty. `?status=` filter. XML when `Accept: application/xml` or `?format=xml` |
| POST | `/api/v1/students` | admin | 201 + `Location` / 409 duplicate / 422 |
| PUT | `/api/v1/students/{student_id}` | admin | 200 / 404 / 422 (full update) |
| DELETE | `/api/v1/students/{student_id}` | admin | 204 / 404 |

- Auth: `X-API-Key` header. `REGISTRY_READ_KEY` for GET, `REGISTRY_ADMIN_KEY` for everything.
  Missing/unknown key: 401. Read key on a write endpoint: 403. Compare keys in constant time. Never log key values.
- One error shape everywhere: `{"error":{"code":"STRING_CODE","message":"human text","details":{...optional}}}`.
  400 malformed JSON, 401, 403, 404, 409, 415 wrong content type, 422 validation, 429 rate limit (with `Retry-After`),
  500 without leaking internals.
- `X-Request-Id`: generated if absent, echoed back, included in logs.
- One structured JSON log line per request: method, path, status, ms, request id.
- In-memory rate limit: 60 requests/minute per key.

## Decisions (agreed with the user)

- Section lookup ignores case (`it3a` = `IT3A`); sections are stored and returned in uppercase.
- A malformed `student_id` in the URL is just a 404 (it cannot exist); in a request body it is a 422.
- `?status=` with no matches in an existing section: 200 with `count: 0`. 404 only if the section has no students at all.
- `?format=` (json|xml) beats the `Accept` header. Errors are always JSON, even when XML was requested.
- POST/PUT bodies are strict: unknown fields are a 422. PUT may include `student_id` only if it equals the URL's.
- Order of checks: 401/403, then 429, then 415, 400, 422, then 404/409.
- Rate limit is a fixed 1-minute window per key (one key per role). `/health` and requests with no valid key are not counted.
- Error codes: MALFORMED_JSON, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STUDENT_NOT_FOUND, SECTION_NOT_FOUND,
  STUDENT_EXISTS, UNSUPPORTED_MEDIA_TYPE, VALIDATION_ERROR, RATE_LIMITED, INTERNAL_ERROR.

## Rules

- Small steps. Run the type-check and the tests after every step and fix problems before moving on.
- Keep it boring and explainable: no ORMs, no extra frameworks, no clever abstractions. Plain SQL in repository functions.
- Never invent test results or output. Anything shown (docs examples included) must come from a real run.
- No real personal data, no external network calls, no telemetry.
- Do not push or create remote repos. Commit locally after each deliverable with a clear message.
- If a requirement is ambiguous, ask one short question instead of guessing.
