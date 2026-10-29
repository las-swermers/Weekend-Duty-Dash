import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/orah-resources", () => ({
  listPastoralTimeline: vi.fn(),
  listStudents: vi.fn(),
  listHouses: vi.fn(),
  buildStudentMap: (v: any[]) => new Map(v.map((s) => [s.id, s])),
  buildHouseMap: (v: any[]) => new Map(v.map((s) => [s.id, s.name])),
  studentDisplayName: () => ({ full: "Test Student", initials: "TS" }),
}));
vi.mock("@/lib/warnings-sheet", () => ({
  readConversations: vi.fn(),
  isWarningsSheetConfigured: () => true,
  warningsSheetUrl: () => null,
  conversationKey: (id: number, week: string) => `${id}|${week}`,
}));
import { getWarningsForWeek } from "@/lib/warnings";
import {
  listPastoralTimeline,
  listStudents,
  listHouses,
} from "@/lib/orah-resources";
import { readConversations } from "@/lib/warnings-sheet";
const record = (id: number, date: string) =>
  ({
    id,
    date,
    student: { id: 1 },
    pastoral_category: { name: "Warning" },
  }) as any;
beforeEach(() => {
  vi.stubEnv("WARNINGS_TERM_START", "2026-09-01");
  vi.mocked(listStudents).mockResolvedValue([
    { id: 1, house: { id: 374 } },
  ] as any);
  vi.mocked(listHouses).mockResolvedValue([{ id: 374, name: "Savoy" }] as any);
  vi.mocked(listPastoralTimeline).mockResolvedValue([
    record(1, "2026-10-12T10:00:00Z"),
    record(2, "2026-10-13T10:00:00Z"),
    record(3, "2026-10-14T10:00:00Z"),
    record(4, "2026-10-27T10:00:00Z"),
  ]);
  vi.mocked(readConversations).mockResolvedValue([]);
});
describe("Scheduled warning snapshots", () => {
  it("carries overdue students forward even with no new warnings", async () => {
    const r = await getWarningsForWeek({
      weekKey: "2026-10-19",
      dorm: "Savoy",
      asOfWeekEnd: true,
      includeOutstanding: true,
      strictConversations: true,
    });
    expect(r.students).toHaveLength(1);
    expect(r.students[0].warningsThisWeek).toHaveLength(0);
    expect(r.students[0].dueNow).toBe(true);
    expect(r.students[0].termWarningCount).toBe(3);
    expect(readConversations).toHaveBeenCalledWith(true);
  });
  it("does not let conversations after the cutoff rewrite a historical report", async () => {
    vi.mocked(readConversations).mockResolvedValue([
      {
        key: "1|2026-10-26",
        studentId: 1,
        status: "done",
        conversationDate: "2026-10-26T08:00:00Z",
      },
    ] as any);
    const r = await getWarningsForWeek({
      weekKey: "2026-10-19",
      asOfWeekEnd: true,
      includeOutstanding: true,
    });
    expect(r.students[0].dueNow).toBe(true);
    expect(r.students[0].conversationCount).toBe(0);
  });
  it("removes carry-forward once a conversation inside the cutoff is logged", async () => {
    vi.mocked(readConversations).mockResolvedValue([
      {
        key: "1|2026-10-19",
        studentId: 1,
        status: "done",
        conversationDate: "2026-10-22T08:00:00Z",
      },
    ] as any);
    const r = await getWarningsForWeek({
      weekKey: "2026-10-19",
      asOfWeekEnd: true,
      includeOutstanding: true,
    });
    expect(r.students).toHaveLength(0);
  });
  it("aborts delivery data assembly when the conversation store fails", async () => {
    vi.mocked(readConversations).mockRejectedValue(
      new Error("Sheets unavailable"),
    );
    await expect(
      getWarningsForWeek({ weekKey: "2026-10-19", strictConversations: true }),
    ).rejects.toThrow("Sheets unavailable");
  });
});
