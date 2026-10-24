import { Hono, type Context } from "hono";
import type { Db } from "../db/connection";
import { listStudentsBySection } from "../db/students.repo";
import { ApiError } from "../errors";
import type { AppEnv } from "../types";
import { parseQuery, RosterQuerySchema } from "../validation";
import { rosterToXml } from "../xml";

// ?format= wins; otherwise XML only if the Accept header asks for it. JSON is the default.
function wantsXml(c: Context, format: "json" | "xml" | undefined): boolean {
  if (format) return format === "xml";
  const accept = c.req.header("accept") ?? "";
  return accept.includes("application/xml") || accept.includes("text/xml");
}

export function sectionRoutes(db: Db) {
  const routes = new Hono<AppEnv>();

  routes.get("/sections/:section/students", async (c) => {
    const { status, format } = parseQuery(c, RosterQuerySchema);
    const section = c.req.param("section").toUpperCase();

    // 404 only when the section has nobody at all; a status filter with no matches is a valid, empty roster.
    const all = await listStudentsBySection(db, section);
    if (all.length === 0) throw new ApiError(404, "SECTION_NOT_FOUND", `No students found in section ${section}`);

    const students = status ? all.filter((s) => s.status === status) : all;
    const roster = { section, count: students.length, students };

    c.header("Vary", "Accept");
    if (wantsXml(c, format)) {
      return c.body(rosterToXml(roster), 200, { "Content-Type": "application/xml; charset=utf-8" });
    }
    return c.json(roster);
  });

  return routes;
}
