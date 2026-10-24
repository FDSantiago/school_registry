import type { Db } from "./connection";

export const STUDENT_STATUSES = ["Active", "Inactive", "Graduated"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

// What the API sends and receives: snake_case, timestamps as ISO 8601 strings (UTC).
export type Student = {
  student_id: string;
  first_name: string;
  last_name: string;
  course: string;
  year_level: number;
  section: string;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
};

export type NewStudent = Omit<Student, "created_at" | "updated_at">;
export type StudentUpdate = Omit<NewStudent, "student_id">;

// Thrown by createStudent when the student_id already exists (MySQL error 1062).
export class DuplicateStudentError extends Error {
  constructor(public readonly studentId: string) {
    super(`Student ${studentId} already exists`);
    this.name = "DuplicateStudentError";
  }
}

const MYSQL_DUPLICATE_ENTRY = 1062;

type StudentRow = Omit<Student, "created_at" | "updated_at"> & { created_at: Date; updated_at: Date };

function toStudent(row: StudentRow): Student {
  return {
    student_id: row.student_id,
    first_name: row.first_name,
    last_name: row.last_name,
    course: row.course,
    year_level: row.year_level,
    section: row.section,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function getStudent(sql: Db, studentId: string): Promise<Student | null> {
  const rows: StudentRow[] = await sql`SELECT * FROM students WHERE student_id = ${studentId}`;
  return rows[0] ? toStudent(rows[0]) : null;
}

// Students in one section, sorted by last name, first name, then student_id.
// The comparison ignores case (MySQL's default collation), so "it3a" finds "IT3A".
export async function listStudentsBySection(sql: Db, section: string): Promise<Student[]> {
  const rows: StudentRow[] = await sql`
    SELECT * FROM students WHERE section = ${section}
    ORDER BY last_name, first_name, student_id`;
  return rows.map(toStudent);
}

export async function createStudent(sql: Db, s: NewStudent): Promise<Student> {
  try {
    await sql`
      INSERT INTO students (student_id, first_name, last_name, course, year_level, section, status)
      VALUES (${s.student_id}, ${s.first_name}, ${s.last_name}, ${s.course}, ${s.year_level}, ${s.section}, ${s.status})`;
  } catch (err) {
    if ((err as { errno?: number }).errno === MYSQL_DUPLICATE_ENTRY) throw new DuplicateStudentError(s.student_id);
    throw err;
  }
  return (await getStudent(sql, s.student_id))!;
}

// Full update. Returns null if the student does not exist.
export async function updateStudent(sql: Db, studentId: string, s: StudentUpdate): Promise<Student | null> {
  await sql`
    UPDATE students
    SET first_name = ${s.first_name}, last_name = ${s.last_name}, course = ${s.course},
        year_level = ${s.year_level}, section = ${s.section}, status = ${s.status},
        updated_at = CURRENT_TIMESTAMP(3)
    WHERE student_id = ${studentId}`;
  // Not using affectedRows: MySQL reports 0 when the new values equal the old ones.
  return getStudent(sql, studentId);
}

// Returns true if a student was deleted, false if there was none with that id.
export async function deleteStudent(sql: Db, studentId: string): Promise<boolean> {
  const result = await sql`DELETE FROM students WHERE student_id = ${studentId}`;
  return result.affectedRows > 0;
}
