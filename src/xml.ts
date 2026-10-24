import type { Student } from "./db/students.repo";

export type Roster = { section: string; count: number; students: Student[] };

// The five characters XML treats specially.
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Same structure as the JSON roster, one element per field.
export function rosterToXml(roster: Roster): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<roster>`,
    `  <section>${escapeXml(roster.section)}</section>`,
    `  <count>${roster.count}</count>`,
    `  <students>`,
  ];
  for (const student of roster.students) {
    lines.push(`    <student>`);
    for (const [field, value] of Object.entries(student)) {
      lines.push(`      <${field}>${escapeXml(String(value))}</${field}>`);
    }
    lines.push(`    </student>`);
  }
  lines.push(`  </students>`, `</roster>`);
  return lines.join("\n") + "\n";
}
