import { describe, expect, it, vi } from "vitest";
import { buildDemoAnalytics, demoHouses } from "@/lib/demo/analytics";

describe("fictional demonstration", () => {
  it("filters every dataset by fictional dorm and keeps totals consistent", () => {
    const all = buildDemoAnalytics("2026-10-19", "2026-10-25", "");
    expect(all.admin).toBe(false);
    expect(all.rosterCount).toBe(96);
    let total = 0;
    for (const house of demoHouses) {
      const data = buildDemoAnalytics(
        "2026-10-19",
        "2026-10-25",
        String(house.id),
      );
      total += data.pastoral!.total;
      expect(data.rosterCount).toBe(24);
      for (const row of [
        ...data.pastoral!.records,
        ...data.watch!.episodes,
        ...data.rest!.visits,
        ...data.warnings!.students,
      ]) {
        expect(row.dormId).toBe(house.id);
        expect(row.studentId).toBeGreaterThan(90000);
      }
      expect(data.pastoral!.days.reduce((n, v) => n + v.count, 0)).toBe(
        data.pastoral!.total,
      );
      expect(data.pastoral!.categories.reduce((n, v) => n + v.count, 0)).toBe(
        data.pastoral!.total,
      );
      expect(
        data.warnings!.students.filter((s) => s.dueNow).length,
      ).toBeGreaterThan(0);
      expect(data.watch!.metrics.served).toBeGreaterThan(0);
      expect(data.rest!.summary.totalHours).toBeGreaterThan(0);
    }
    expect(total).toBe(all.pastoral!.total);
  });
  it("uses a fixed clock, clips historical stays and rejects out-of-fixture requests", () => {
    const data = buildDemoAnalytics("2026-10-26", "2026-10-30", "");
    expect(data.rest!.now!.health).toBe(3);
    expect(data.rest!.now!.room).toBe(1);
    expect(
      buildDemoAnalytics("2026-10-19", "2026-10-25", "").rest!.now,
    ).toBeNull();
    expect(
      data.pastoral!.records.every(
        (r) => r.date <= data.end && r.date >= data.start,
      ),
    ).toBe(true);
    expect(() => buildDemoAnalytics("2026-10-19", "2026-10-25", "374")).toThrow(
      "fictional",
    );
    expect(() => buildDemoAnalytics("2026-08-01", "2026-10-25", "")).toThrow(
      "history starts",
    );
    expect(() => buildDemoAnalytics("2026-10-19", "2026-10-31", "")).toThrow();
  });
  it("is deterministic without network access", () => {
    const fetch = vi.fn(() => {
      throw new Error("Demo attempted network");
    });
    vi.stubGlobal("fetch", fetch);
    try {
      expect(buildDemoAnalytics("2026-10-19", "2026-10-25", "9001")).toEqual(
        buildDemoAnalytics("2026-10-19", "2026-10-25", "9001"),
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
