import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/orah", () => ({ isMockMode: () => false, orahCall: vi.fn() }));
vi.mock("@/lib/orah-resources", () => ({
  listHouses: vi.fn(),
  listStudents: vi.fn(),
  listPastoralTimeline: vi.fn(),
  listLocationRecordTimeline: vi.fn(),
  resolveHealthCenterLocationIds: vi.fn(),
  studentDisplayName: (s: { first_name: string }) => ({
    full: s.first_name,
    initials: "T",
  }),
}));
vi.mock("@/lib/warnings", () => ({ getWarningsForWeek: vi.fn() }));
vi.mock("@/lib/analytics/tracking", () => ({
  defaultCategories: ["Saturday Clipboard"],
  getTracking: vi.fn(),
  getTargets: vi.fn(),
}));
import {
  listHouses,
  listStudents,
  listPastoralTimeline,
  listLocationRecordTimeline,
  resolveHealthCenterLocationIds,
} from "@/lib/orah-resources";
import { getWarningsForWeek } from "@/lib/warnings";
import { getTracking, getTargets } from "@/lib/analytics/tracking";
import { buildAnalytics } from "@/lib/analytics/data";
const start = "2026-10-19T00:00:00Z",
  end = "2026-10-25T22:59:59.999Z";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listHouses).mockResolvedValue([
    { id: 374, name: "Savoy" },
    { id: 741, name: "Beau-Reveil" },
  ] as never);
  vi.mocked(listStudents).mockResolvedValue([
    { id: 1, first_name: "A", house: { id: 374 } },
    { id: 2, first_name: "B", house: { id: 741 } },
  ] as never);
  vi.mocked(listPastoralTimeline).mockResolvedValue([
    {
      id: 1,
      student: { id: 1 },
      date: "2026-10-20T09:00:00Z",
      pastoral_category: { name: "Merit" },
    },
    {
      id: 2,
      student: { id: 2 },
      date: "2026-10-20T09:00:00Z",
      pastoral_category: { name: "Warning" },
    },
    {
      id: 3,
      student: { id: 1 },
      date: "2026-10-20T09:00:00Z",
      sensitive: true,
    },
  ] as never);
  vi.mocked(listLocationRecordTimeline).mockResolvedValue([]);
  vi.mocked(resolveHealthCenterLocationIds).mockResolvedValue({
    ids: [9],
    idToName: new Map(),
    via: "env-id",
  });
  vi.mocked(getTracking).mockResolvedValue(null);
  vi.mocked(getTargets).mockResolvedValue({ targets: {} });
  vi.mocked(getWarningsForWeek).mockResolvedValue({
    students: [],
    meta: { threshold: 3 },
  } as never);
});
it("isolates all sources by stable dorm id and excludes sensitive pastoral records", async () => {
  const d = await buildAnalytics(start, end, 374, false, true, false);
  expect(d.pastoral?.records.map((r) => r.id)).toEqual([1]);
  expect(d.rosterCount).toBe(1);
  expect(d.pastoral?.dorms).toHaveLength(1);
  expect(d.pastoral?.days).toHaveLength(7);
  expect(getWarningsForWeek).toHaveBeenCalledWith(
    expect.objectContaining({ dorm: "Savoy", cutoffISO: end }),
  );
});
it("All includes both dorms and current-roster rates", async () => {
  const d = await buildAnalytics(start, end, null, false, true, false);
  expect(d.pastoral?.total).toBe(2);
  expect(d.pastoral?.dorms.map((d) => d.per100)).toEqual([100, 100]);
});
it("marks source failures unavailable and honors independent conversation access", async () => {
  vi.mocked(listLocationRecordTimeline).mockRejectedValue(new Error("outage"));
  const d = await buildAnalytics(start, end, 374, false, false, false);
  expect(d.rest).toBeNull();
  expect(d.pastoral?.total).toBe(1);
  expect(d.warnings).toBeNull();
  expect(d.issues).toHaveLength(2);
  expect(getWarningsForWeek).not.toHaveBeenCalled();
});
