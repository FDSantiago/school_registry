import { describe, expect, it } from "bun:test";
import { escapeXml, rosterToXml } from "../src/xml";

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });

  it("escapes & first so existing entities are not double-decoded", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });
});

describe("rosterToXml", () => {
  it("produces the exact document for one student", () => {
    const xml = rosterToXml({
      section: "IT3A",
      count: 1,
      students: [
        {
          student_id: "2024-00309",
          first_name: "Ana Maria",
          last_name: "O'Reilly",
          course: "BSIT",
          year_level: 3,
          section: "IT3A",
          status: "Active",
          created_at: "2026-10-24T00:00:00.000Z",
          updated_at: "2026-10-24T00:00:00.000Z",
        },
      ],
    });
    expect(xml).toBe(
      [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<roster>`,
        `  <section>IT3A</section>`,
        `  <count>1</count>`,
        `  <students>`,
        `    <student>`,
        `      <student_id>2024-00309</student_id>`,
        `      <first_name>Ana Maria</first_name>`,
        `      <last_name>O&apos;Reilly</last_name>`,
        `      <course>BSIT</course>`,
        `      <year_level>3</year_level>`,
        `      <section>IT3A</section>`,
        `      <status>Active</status>`,
        `      <created_at>2026-10-24T00:00:00.000Z</created_at>`,
        `      <updated_at>2026-10-24T00:00:00.000Z</updated_at>`,
        `    </student>`,
        `  </students>`,
        `</roster>`,
        ``,
      ].join("\n"),
    );
  });
});
