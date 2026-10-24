import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "../src/db/connection";
import { runMigrations } from "../src/db/migrate";
import { resetAndSeed, SEED_STUDENTS } from "../src/db/seed";
import {
  createStudent,
  deleteStudent,
  DuplicateStudentError,
  getStudent,
  listStudentsBySection,
  updateStudent,
  type NewStudent,
} from "../src/db/students.repo";
import { clearStudents, openTestDb } from "./helpers/db";

let sql: Db;

beforeAll(async () => {
  sql = await openTestDb();
});
afterAll(async () => {
  await sql.close();
});
beforeEach(async () => {
  await clearStudents(sql);
});

const juan: NewStudent = {
  student_id: "2026-00123",
  first_name: "Juan",
  last_name: "Tamad",
  course: "BSIT",
  year_level: 3,
  section: "IT3A",
  status: "Active",
};

describe("migrations", () => {
  it("are recorded and not applied twice", async () => {
    expect(await runMigrations(sql)).toEqual([]);
    const rows: { name: string }[] = await sql`SELECT name FROM schema_migrations ORDER BY name`;
    expect(rows.map((r) => r.name)).toContain("001_create_students.sql");
  });
});

describe("createStudent / getStudent", () => {
  it("creates a student and reads it back with ISO timestamps", async () => {
    const created = await createStudent(sql, juan);
    expect(created).toEqual({ ...juan, created_at: expect.any(String), updated_at: expect.any(String) });
    expect(new Date(created.created_at).toISOString()).toBe(created.created_at);
    expect(await getStudent(sql, juan.student_id)).toEqual(created);
  });

  it("returns null for an unknown student", async () => {
    expect(await getStudent(sql, "2026-99999")).toBeNull();
  });

  it("throws DuplicateStudentError for an existing student_id", async () => {
    await createStudent(sql, juan);
    await expect(createStudent(sql, { ...juan, first_name: "Other" })).rejects.toBeInstanceOf(DuplicateStudentError);
  });

  it("is protected by database CHECK constraints", async () => {
    await expect(createStudent(sql, { ...juan, year_level: 9 })).rejects.toThrow("chk_students_year_level");
    await expect(createStudent(sql, { ...juan, student_id: "26-123" })).rejects.toThrow("chk_students_id_format");
  });

  it("stores names with special characters unchanged", async () => {
    const tricky = { ...juan, first_name: `A&B <"x">`, last_name: "O'Reilly" };
    await createStudent(sql, tricky);
    const got = await getStudent(sql, juan.student_id);
    expect(got?.first_name).toBe(tricky.first_name);
    expect(got?.last_name).toBe(tricky.last_name);
  });
});

describe("listStudentsBySection", () => {
  beforeEach(async () => {
    await createStudent(sql, { ...juan, student_id: "2026-00001", last_name: "Zamora" });
    await createStudent(sql, { ...juan, student_id: "2026-00002", last_name: "Abad", status: "Inactive" });
    await createStudent(sql, { ...juan, student_id: "2026-00003", last_name: "Mora" });
    await createStudent(sql, { ...juan, student_id: "2026-00004", section: "IT1A" });
  });

  it("lists only that section, sorted by last name", async () => {
    const list = await listStudentsBySection(sql, "IT3A");
    expect(list.map((s) => s.last_name)).toEqual(["Abad", "Mora", "Zamora"]);
  });

  it("ignores the case of the section name", async () => {
    const list = await listStudentsBySection(sql, "it3a");
    expect(list.map((s) => s.student_id)).toEqual(["2026-00002", "2026-00003", "2026-00001"]);
  });

  it("returns an empty list for a section with no students", async () => {
    expect(await listStudentsBySection(sql, "XX9Z")).toEqual([]);
  });
});

describe("updateStudent", () => {
  it("replaces all fields and bumps updated_at", async () => {
    const created = await createStudent(sql, juan);
    await Bun.sleep(5);
    const changes = { ...juan, first_name: "Juana", year_level: 4, section: "IT4A", status: "Graduated" as const };
    const { student_id: _, ...update } = changes;
    const updated = await updateStudent(sql, juan.student_id, update);
    expect(updated).toEqual({ ...changes, created_at: created.created_at, updated_at: expect.any(String) });
    expect(updated!.updated_at > created.updated_at).toBe(true);
  });

  it("returns the student even when nothing changed", async () => {
    const { student_id: _, ...same } = juan;
    await createStudent(sql, juan);
    expect((await updateStudent(sql, juan.student_id, same))?.first_name).toBe("Juan");
  });

  it("returns null for an unknown student", async () => {
    const { student_id: _, ...update } = juan;
    expect(await updateStudent(sql, "2026-99999", update)).toBeNull();
  });
});

describe("deleteStudent", () => {
  it("deletes an existing student and reports false the second time", async () => {
    await createStudent(sql, juan);
    expect(await deleteStudent(sql, juan.student_id)).toBe(true);
    expect(await getStudent(sql, juan.student_id)).toBeNull();
    expect(await deleteStudent(sql, juan.student_id)).toBe(false);
  });
});

describe("seed data", () => {
  it("has about 40 unique, well-formed students in 4-5 sections, mostly Active", () => {
    const ids = SEED_STUDENTS.map((s) => s.student_id);
    expect(ids.length).toBe(40);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^\d{4}-\d{5}$/);
    expect(new Set(SEED_STUDENTS.map((s) => s.section)).size).toBe(5);
    const statuses = SEED_STUDENTS.map((s) => s.status);
    expect(statuses.filter((s) => s === "Active").length).toBeGreaterThan(30);
    expect(statuses).toContain("Inactive");
    expect(statuses).toContain("Graduated");
  });

  it("resetAndSeed replaces existing rows with exactly the seed data", async () => {
    await createStudent(sql, { ...juan, student_id: "2026-99999" });
    expect(await resetAndSeed(sql)).toBe(40);
    const rows: { n: number }[] = await sql`SELECT COUNT(*) AS n FROM students`;
    expect(Number(rows[0]?.n)).toBe(40);
    expect(await getStudent(sql, "2026-99999")).toBeNull();
    expect((await getStudent(sql, "2024-00309"))?.last_name).toBe("O'Reilly");
  });
});
