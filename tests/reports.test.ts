import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCompleteWeek,
  isDue,
  isReportsAdmin,
  parseRecipients,
  previousWeek,
  validateSubscription,
  safeReportCallback,
} from "@/lib/reports/config";
import { aggregateDorm } from "@/lib/reports/analytics";
import { escapeHtml, renderReport } from "@/lib/reports/render";
import { resolveDormSelection } from "@/lib/dorm-selection";
import type {
  OrahPastoralRecord,
  OrahStudent,
  OrahLocationRecord,
} from "@/types/orah";
import type { Subscription } from "@/lib/reports/types";
const s: Subscription = {
  id: "savoy",
  name: "Savoy review",
  dormId: 374,
  dormName: "Savoy",
  recipients: ["head@las.ch"],
  warnings: true,
  analytics: true,
  expanded: false,
  enabled: true,
  weekday: 1,
  updatedAt: "",
  updatedBy: "admin@las.ch",
};
afterEach(() => vi.unstubAllEnvs());
describe("Report settings and weekly windows", () => {
  it("denies admin access unless explicitly allowlisted", () => {
    vi.stubEnv("REPORTS_ADMIN_EMAILS", "");
    expect(isReportsAdmin("admin@las.ch")).toBe(false);
    vi.stubEnv("REPORTS_ADMIN_EMAILS", " Admin@las.ch ");
    expect(isReportsAdmin("admin@LAS.ch")).toBe(true);
    expect(isReportsAdmin("other@las.ch")).toBe(false);
  });
  it("normalizes recipients and rejects outside domains and header injection", () => {
    vi.stubEnv("ALLOWED_DOMAIN", "las.ch");
    expect(parseRecipients(" A@las.ch, a@las.ch\nb@las.ch ")).toEqual([
      "a@las.ch",
      "b@las.ch",
    ]);
    for (const value of [
      "a@las.ch.evil.com",
      "a@gmail.com",
      "Name <a@las.ch>",
      "a@las.ch\nBcc: x@las.ch",
    ])
      expect(() => parseRecipients(value)).toThrow();
    expect(() =>
      parseRecipients(
        Array.from({ length: 26 }, (_, i) => `person${i}@las.ch`),
      ),
    ).toThrow();
  });
  it("validates dorm IDs and at least one report section", () => {
    const houses = [{ id: 374, name: "Savoy" }];
    expect(
      validateSubscription({ ...s, dormName: "Forged" }, houses, "admin@las.ch")
        .dormName,
    ).toBe("Savoy");
    for (const patch of [
      { dormId: 999 },
      { warnings: false, analytics: false },
      { weekday: 7 },
      { recipients: [] },
    ])
      expect(() =>
        validateSubscription({ ...s, ...patch }, houses, "admin@las.ch"),
      ).toThrow();
  });
  it("uses Zurich Monday boundaries across DST and year changes", () => {
    expect(previousWeek(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-19");
    expect(previousWeek(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-23");
    expect(previousWeek(new Date("2026-01-04T23:30:00Z"))).toBe("2025-12-29");
    expect(isDue(s, new Date("2026-10-25T23:30:00Z"))).toBe(true);
    expect(
      isDue({ ...s, enabled: false }, new Date("2026-10-26T06:00:00Z")),
    ).toBe(false);
    const now = new Date("2026-10-28T10:00:00Z");
    for (const key of ["2026-10-20", "2026-02-30", "2026-10-26", "not-a-date"])
      expect(isCompleteWeek(key, now)).toBe(false);
    expect(isCompleteWeek("2026-10-19", now)).toBe(true);
  });
});
describe("All dorm regression", () => {
  it("clearing selection includes every dorm and refreshed dorms", () => {
    const all = ["Beau-Reveil", "Savoy", "BEC-G"];
    expect([...resolveDormSelection(new Set(), all)]).toEqual(all);
    expect([...resolveDormSelection(new Set(["Savoy"]), all)]).toEqual([
      "Savoy",
    ]);
    expect([
      ...resolveDormSelection(new Set(), [...all, "Esplanade"]),
    ]).toContain("Esplanade");
    expect([...resolveDormSelection(new Set(), [])]).toEqual([]);
  });
});
describe("Dorm analytics", () => {
  const roster = [
    { id: 1, first_name: "Student", last_name: "One", house: { id: 374 } },
    { id: 2, first_name: "Other", house: { id: 373 } },
  ] as OrahStudent[];
  const p = (
    id: number,
    cat: string,
    date = "2026-10-20T10:00:00Z",
    student = 1,
    sensitive = false,
  ) =>
    ({
      id,
      date,
      student: { id: student },
      pastoral_category: { id: 1, name: cat },
      sensitive,
    }) as OrahPastoralRecord;
  const m = (
    id: number,
    type: "in" | "out",
    time = "2026-10-20T11:00:00Z",
    student = 1,
  ) =>
    ({
      id,
      type,
      record_time: time,
      student: { id: student },
      location: { id: 9, name: "Health Center" },
    }) as OrahLocationRecord;
  it("isolates dorms, removes sensitive records, fills zero days and deduplicates", () => {
    const a = aggregateDorm(
      [
        p(1, "Warning"),
        p(1, "Warning"),
        p(2, "Warning", undefined, 2),
        p(3, "Warning", undefined, 1, true),
        p(4, "Commendation"),
        p(5, "Warning", "2026-10-12T10:00:00Z"),
      ],
      [m(1, "in"), m(2, "out"), m(1, "in"), m(3, "in", undefined, 2)],
      roster,
      374,
      "2026-10-19",
      false,
      [9],
      [],
      "rest",
    );
    expect(a.total).toBe(1);
    expect(a.uniqueStudents).toBe(1);
    expect(a.categories).toEqual([{ label: "Warning", count: 1 }]);
    expect(a.daily).toHaveLength(7);
    expect(a.trend).toHaveLength(8);
    expect(a.trend.slice(-2).map((v) => v.count)).toEqual([1, 1]);
    expect(a.restCheckins).toBe(1);
    expect(a.restEvents).toHaveLength(2);
  });
  it("expanded scope adds other non-sensitive categories and obeys Swiss cutoff", () => {
    const a = aggregateDorm(
      [
        p(1, "Commendation"),
        p(2, "Warning", "2026-10-25T23:01:00Z"),
        p(3, "Secret", undefined, 1, true),
      ],
      [],
      roster,
      374,
      "2026-10-19",
      true,
      [],
      [],
      "rest",
    );
    expect(a.total).toBe(1);
    expect(a.categories[0].label).toBe("Commendation");
  });
});
it("escapes untrusted names in printable HTML", () => {
  expect(escapeHtml('<script>"&')).toBe("&lt;script&gt;&quot;&amp;");
  const html = renderReport(
    {
      name: "Review",
      dorm: "<script>alert(1)</script>",
      week: "2026-10-19",
      label: "19–25 October",
      generatedAt: "2026-10-26T06:00:00Z",
      expanded: false,
    },
    "https://duty.las.ch/api/reports/test",
  );
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("@media print");
});

it("preserves report sign-in links without open redirects", () => {
  expect(safeReportCallback("/api/reports/weekly-savoy-2026-10-19")).toBe(
    "/api/reports/weekly-savoy-2026-10-19",
  );
  for (const url of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/api/reports/a?redirect=https://evil.example",
  ])
    expect(safeReportCallback(url)).toBe("/");
});
