import type { Context } from "hono";
import { z } from "zod";
import { STUDENT_STATUSES } from "./db/students.repo";
import { ApiError } from "./errors";

// Control characters would make the XML output invalid, so names may not contain them.
const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;

const text = (max: number) =>
  z.string().trim().min(1, "must not be empty").max(max, `must be at most ${max} characters`)
    .regex(NO_CONTROL_CHARS, "must not contain control characters");

export const StudentIdSchema = z.string().regex(/^\d{4}-\d{5}$/, "must look like YYYY-NNNNN, e.g. 2026-00123");

const studentFields = {
  first_name: text(100),
  last_name: text(100),
  course: text(20),
  year_level: z.number().int("must be a whole number").min(1, "must be 1 to 5").max(5, "must be 1 to 5"),
  // Stored in uppercase so "it3a" and "IT3A" are the same section.
  section: z.string().trim().regex(/^[A-Za-z0-9-]{1,20}$/, "must be 1-20 letters, digits or dashes, e.g. IT3A")
    .transform((s) => s.toUpperCase()),
  status: z.enum(STUDENT_STATUSES),
};

// Strict: unknown fields (typos, created_at, ...) are rejected instead of silently ignored.
export const NewStudentSchema = z.strictObject({ student_id: StudentIdSchema, ...studentFields });

// PUT replaces every field. student_id may be sent, but must equal the one in the URL.
export const UpdateStudentSchema = z.strictObject({ student_id: StudentIdSchema.optional(), ...studentFields });

export const RosterQuerySchema = z.object({
  status: z.enum(STUDENT_STATUSES).optional(),
  format: z.enum(["json", "xml"]).optional(),
});

export function validationError(fields: { field: string; message: string }[]): ApiError {
  return new ApiError(422, "VALIDATION_ERROR", "The request has invalid or missing fields", { fields });
}

function check<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({ field: i.path.join(".") || "(body)", message: i.message })),
    );
  }
  return result.data;
}

// POST/PUT bodies: 415 if not JSON, 400 if the JSON is broken, 422 if it fails the schema.
export async function parseJsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const contentType = c.req.header("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  let body: unknown;
  try {
    body = JSON.parse(await c.req.text());
  } catch {
    throw new ApiError(400, "MALFORMED_JSON", "The request body is not valid JSON");
  }
  return check(schema, body);
}

export function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.output<T> {
  return check(schema, c.req.query());
}
