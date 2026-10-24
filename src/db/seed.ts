// Fictional seed data: 40 students in 5 sections. Any resemblance to real people is coincidental.
//   bun run seed    -> deletes all students in DATABASE_URL and inserts these
import { connect, type Db } from "./connection";
import { runMigrations } from "./migrate";
import { createStudent, type NewStudent, type StudentStatus } from "./students.repo";

type SeedRow = [student_id: string, first_name: string, last_name: string, status?: StudentStatus];
type SeedSection = { section: string; course: string; year_level: number; students: SeedRow[] };

const SECTIONS: SeedSection[] = [
  {
    section: "IT1A", course: "BSIT", year_level: 1,
    students: [
      ["2026-00101", "Andrea", "Villanueva"],
      ["2026-00102", "Bea", "Santos"],
      ["2026-00103", "Carlo", "Reyes"],
      ["2026-00104", "Daniel", "Mendoza"],
      ["2026-00105", "Ella", "Bautista"],
      ["2026-00106", "Franco", "Aquino"],
      ["2026-00107", "Gia", "Navarro"],
      ["2026-00108", "Hannah", "Lim"],
      ["2026-00109", "Ivan", "Castillo", "Inactive"],
    ],
  },
  {
    section: "IT2B", course: "BSIT", year_level: 2,
    students: [
      ["2025-00201", "Jasmine", "Ramos"],
      ["2025-00202", "Kevin", "Ocampo"],
      ["2025-00203", "Lara", "Torres"],
      ["2025-00204", "Miguel", "Domingo"],
      ["2025-00205", "Nina", "Salazar"],
      ["2025-00206", "Oscar", "Valdez"],
      ["2025-00207", "Paula", "Gutierrez", "Inactive"],
      ["2025-00208", "Rafael", "Cruz"],
    ],
  },
  {
    section: "IT3A", course: "BSIT", year_level: 3,
    students: [
      ["2024-00301", "Sofia", "Dela Cruz"],
      ["2024-00302", "Tomas", "Garcia"],
      ["2024-00303", "Ursula", "Fernandez"],
      ["2024-00304", "Victor", "Pascual"],
      ["2024-00305", "Wendy", "Morales"],
      ["2024-00306", "Xavier", "Lopez"],
      ["2024-00307", "Yna", "Rivera"],
      ["2024-00308", "Zack", "Manalo"],
      ["2024-00309", "Ana Maria", "O'Reilly"],
    ],
  },
  {
    section: "CS2A", course: "BSCS", year_level: 2,
    students: [
      ["2025-00401", "Bianca", "Soriano"],
      ["2025-00402", "Cedric", "Flores"],
      ["2025-00403", "Diana", "Mercado"],
      ["2025-00404", "Enzo", "Javier"],
      ["2025-00405", "Faith", "Castro", "Inactive"],
      ["2025-00406", "Gabriel", "Roxas"],
      ["2025-00407", "Isabel", "Panganiban"],
    ],
  },
  {
    section: "CS4A", course: "BSCS", year_level: 4,
    students: [
      ["2023-00501", "Joaquin", "Tolentino", "Graduated"],
      ["2023-00502", "Katrina", "Agustin"],
      ["2023-00503", "Leo", "Samonte"],
      ["2023-00504", "Marites", "Ignacio"],
      ["2023-00505", "Nathan", "Vergara", "Graduated"],
      ["2023-00506", "Olivia", "Cabrera"],
      ["2023-00507", "Patrick", "Yap"],
    ],
  },
];

export const SEED_STUDENTS: NewStudent[] = SECTIONS.flatMap((sec) =>
  sec.students.map(([student_id, first_name, last_name, status = "Active"]) => ({
    student_id,
    first_name,
    last_name,
    course: sec.course,
    year_level: sec.year_level,
    section: sec.section,
    status,
  })),
);

// Replaces all students with the seed data, in one transaction (all or nothing).
export async function resetAndSeed(sql: Db): Promise<number> {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM students`;
    for (const s of SEED_STUDENTS) await createStudent(tx, s);
  });
  return SEED_STUDENTS.length;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = connect(url);
  await runMigrations(sql);
  const count = await resetAndSeed(sql);
  const bySection: Record<string, number> = {};
  for (const s of SEED_STUDENTS) bySection[s.section] = (bySection[s.section] ?? 0) + 1;
  console.log(`Seeded ${count} students:`, bySection);
  await sql.close();
}
