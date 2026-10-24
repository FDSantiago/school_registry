# School Registry

A small student/section registry exposed as a REST API (JSON, plus XML for section rosters), protected by API keys.
It is **System 2** in the CIT 305 Systems Integration and Architecture final project (TIP Manila): another team's
application calls it over HTTP as an external consumer.

Stack: Bun 1.4, TypeScript, Hono, MySQL 8.4 or MariaDB 11 (tested on 11.8) (via Bun's built-in `Bun.SQL`), zod, `bun test`, Docker Compose.

> This README is a skeleton. Sections marked _(coming)_ are filled in as the project is built.

## Quick start

### Dev container (recommended)

1. Open the folder in VS Code and choose **Dev Containers: Reopen in Container**. This starts Bun and MySQL.
2. `cp .env.example .env`
3. `bun run dev`, then open <http://localhost:4000/health>

### Docker Compose

```sh
cp .env.example .env     # then change the two API keys
docker compose up --build
curl http://localhost:4000/health
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `4000` | HTTP port |
| `DATABASE_URL` | yes | | `mysql://` or `mariadb://` URL ending in the database name, e.g. `mysql://user:pass@host:3306/school_registry?sslmode=require` |
| `TEST_DATABASE_URL` | for tests | | Separate database used by `bun test` |
| `REGISTRY_READ_KEY` | yes | | API key for GET endpoints (16+ chars) |
| `REGISTRY_ADMIN_KEY` | yes | | API key for all endpoints (16+ chars, different from the read key) |
| `RATE_LIMIT_PER_MINUTE` | no | `60` | Requests per key per minute |
| `API_HOST_PORT` | no | `4000` | docker compose only: host port for the API (change it if VS Code is already forwarding 4000) |

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Start with auto-reload |
| `bun run start` | Start normally |
| `bun run build` | Type-check (Bun runs TypeScript directly, so nothing is compiled) |
| `bun run typecheck` | Type-check |
| `bun test` | Run the tests |
| `bun run seed` | Reset the database to the fictional seed data _(coming)_ |

## Endpoints _(coming)_

## Running the tests _(coming)_

## Resetting the seed data _(coming)_

## How a consumer integrates _(coming)_
