import { Hono } from "hono";
import type { Db } from "../db/connection";
import {
  createStudent,
  deleteStudent,
  DuplicateStudentError,
  getStudent,
  updateStudent,
} from "../db/students.repo";
import { ApiError } from "../errors";
import { requireAdmin } from "../middleware/auth";
import type { AppEnv } from "../types";
import { NewStudentSchema, parseJsonBody, UpdateStudentSchema, validationError } from "../validation";

function studentNotFound(studentId: string): ApiError {
  return new ApiError(404, "STUDENT_NOT_FOUND", `No student with id ${studentId}`);
}

export function studentRoutes(db: Db) {
  const routes = new Hono<AppEnv>();

  routes.get("/students/:student_id", async (c) => {
    const studentId = c.req.param("student_id");
    const student = await getStudent(db, studentId);
    if (!student) throw studentNotFound(studentId);
    return c.json(student);
  });

  routes.post("/students", requireAdmin, async (c) => {
    const input = await parseJsonBody(c, NewStudentSchema);
    try {
      const created = await createStudent(db, input);
      c.header("Location", `/api/v1/students/${created.student_id}`);
      return c.json(created, 201);
    } catch (err) {
      if (err instanceof DuplicateStudentError) {
        throw new ApiError(409, "STUDENT_EXISTS", err.message, { student_id: input.student_id });
      }
      throw err;
    }
  });

  routes.put("/students/:student_id", requireAdmin, async (c) => {
    const studentId = c.req.param("student_id");
    const { student_id: bodyId, ...update } = await parseJsonBody(c, UpdateStudentSchema);
    if (bodyId !== undefined && bodyId !== studentId) {
      throw validationError([{ field: "student_id", message: "must match the student_id in the URL (it cannot be changed)" }]);
    }
    const updated = await updateStudent(db, studentId, update);
    if (!updated) throw studentNotFound(studentId);
    return c.json(updated);
  });

  routes.delete("/students/:student_id", requireAdmin, async (c) => {
    const studentId = c.req.param("student_id");
    if (!(await deleteStudent(db, studentId))) throw studentNotFound(studentId);
    return c.body(null, 204);
  });

  return routes;
}
