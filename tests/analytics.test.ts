import { describe, expect, it } from "vitest";
import {
  observeWatchlist,
  durationBounds,
  watchMetrics,
  waitingHours,
  type Episode,
} from "@/lib/analytics/watchlist";
import { restVisits, restSummary } from "@/lib/analytics/rest";
import { analyticsRange } from "@/lib/analytics/range";
import type { OrahPastoralRecord, OrahLocationRecord } from "@/types/orah";
const category = "Saturday Clipboard";
const at = (day: number, hour = 12) =>
  `2026-10-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const record = (active: boolean, other: Partial<OrahPastoralRecord> = {}) =>
  ({
    id: 1,
    student: { id: 1 },
    date: at(18),
    created_at: at(18),
    updated_at: at(18),
    watchlist: active,
    pastoral_category: { id: 1, name: category },
    sensitive: false,
    ...other,
  }) as OrahPastoralRecord;
describe("watchlist observations", () => {
  it("establishes unknown baseline starts and does not backfill from edited_at", () => {
    const a = observeWatchlist(null, [record(true)], at(19), [category]);
    const b = observeWatchlist(
      a,
      [record(false, { updated_at: at(25) })],
      at(20),
      [category],
    );
    expect(b.episodes[0]).toMatchObject({
      startAfter: null,
      startBy: at(19),
      endAfter: at(19),
      endBy: at(20),
      outcome: "served",
    });
    expect(durationBounds(b.episodes[0])).toBeNull();
  });
  it("bounds addition and removal, then creates a distinct repeated episode", () => {
    let a = observeWatchlist(null, [record(false)], at(19), [category]);
    a = observeWatchlist(a, [record(true)], at(20), [category]);
    a = observeWatchlist(a, [record(true, { updated_at: at(21) })], at(21), [
      category,
    ]);
    a = observeWatchlist(a, [record(false)], at(22), [category]);
    expect(durationBounds(a.episodes[0])).toEqual({
      minHours: 24,
      maxHours: 72,
    });
    a = observeWatchlist(a, [record(true)], at(23), [category]);
    expect(a.episodes).toHaveLength(2);
    expect(a.episodes[1].startAfter).toBe(at(22));
  });
  it("preserves missing cases without manufacturing extra waiting time", () => {
    const a = observeWatchlist(null, [record(true)], at(19), [category]);
    const b = observeWatchlist(a, [], at(25), [category]);
    expect(b.episodes[0].endBy).toBeUndefined();
    expect(waitingHours(b.episodes[0], at(25))).toBe(0);
    expect(
      watchMetrics(b.episodes, at(19), at(25), { [category]: 24 }).overdue,
    ).toBe(0);
  });
  it("removes persisted sensitive episodes and keeps custom history after target removal", () => {
    const a = observeWatchlist(null, [record(true)], at(19), [category]);
    expect(
      observeWatchlist(a, [record(false)], at(20), []).episodes[0].endBy,
    ).toBe(at(20));
    expect(
      observeWatchlist(a, [record(true, { sensitive: true })], at(20), [
        category,
      ]).episodes,
    ).toEqual([]);
  });
  it("excludes possible automatic expirations", () => {
    const a = observeWatchlist(
      null,
      [record(true, { watchlist_expiry: at(20) })],
      at(19),
      [category],
    );
    const b = observeWatchlist(a, [record(false)], at(21), [category]);
    const m = watchMetrics(b.episodes, at(19), at(22), {});
    expect(m.served).toBe(0);
    expect(m.expiryPossible).toBe(1);
  });
  it("uses scan start as conservative lower bound", () => {
    const a = observeWatchlist(
      null,
      [record(false)],
      at(19, 13),
      [category],
      at(19),
    );
    const b = observeWatchlist(
      a,
      [record(true)],
      at(20, 13),
      [category],
      at(20),
    );
    expect(b.episodes[0].startAfter).toBe(at(19));
  });
  it("does not treat observed baseline flags as new additions", () => {
    const a = observeWatchlist(null, [record(true)], at(19), [category]);
    expect(watchMetrics(a.episodes, at(18), at(20), {}).added).toBe(0);
  });
  it("keeps uncertain targets out of the denominator and respects historical cutoffs", () => {
    const e: Episode = {
      id: "e",
      recordId: 1,
      studentId: 1,
      category,
      incidentAt: at(18),
      startAfter: at(19),
      startBy: at(20),
      endAfter: at(21),
      endBy: at(22),
      outcome: "served",
    };
    const m = watchMetrics([e], at(18), at(23), { [category]: 48 });
    expect(m).toMatchObject({
      uncertain: 1,
      withinPercent: null,
      measured: 1,
      medianMinHours: 24,
      medianMaxHours: 72,
    });
    expect(watchMetrics([e], at(18), at(21), {}).open).toHaveLength(1);
    expect(watchMetrics([e], at(18), at(21), {}).served).toBe(0);
  });
});
const movement = (
  id: number,
  type: OrahLocationRecord["type"],
  time: string,
  locationId = 9,
  studentId = 1,
) =>
  ({
    id,
    type,
    record_time: time,
    student: { id: studentId },
    location: {
      id: locationId,
      name: locationId === 9 ? "Health Center" : "Room",
    },
  }) as OrahLocationRecord;
describe("rest intervals", () => {
  const parse = (
    rows: OrahLocationRecord[],
    current: OrahLocationRecord[] = [],
  ) => restVisits(rows, at(20, 0), at(21, 0), [9], [], "rest", current);
  it("clips overnight paired durations to the window and deduplicates", () => {
    const a = movement(1, "in", at(19, 23)),
      b = movement(2, "out", at(20, 2));
    const v = parse([a, a, b]);
    expect(v).toHaveLength(1);
    expect(v[0].minutes).toBe(120);
    expect(restSummary(v)).toMatchObject({
      totalHours: 2,
      medianMinutes: 180,
      paired: 1,
    });
  });
  it("excludes inferred departures from paired duration KPIs", () => {
    const v = parse([
      movement(1, "in", at(20, 8)),
      movement(2, "in", at(20, 10), 11),
    ]);
    expect(v[0]).toMatchObject({
      quality: "location-change",
      minutes: null,
      end: at(20, 10),
    });
    expect(restSummary(v)).toMatchObject({
      totalHours: 0,
      inferred: 1,
      paired: 0,
    });
  });
  it("does not pair an out for another location or fill an unknown start", () => {
    const v = restVisits(
      [movement(1, "in", at(20, 8)), movement(2, "out", at(20, 10), 10)],
      at(20, 0),
      at(21, 0),
      [9, 10],
      [],
      "rest",
    );
    expect(v.every((v) => v.minutes === null)).toBe(true);
    expect(v.some((v) => v.start === null)).toBe(true);
  });
  it("keeps current visits open without fabricating completion times", () => {
    const a = movement(1, "in", at(20, 8));
    const v = parse([a], [a]);
    expect(v[0]).toMatchObject({
      quality: "ongoing",
      end: null,
      minutes: null,
    });
  });
  it("handles transit and repeated check-ins without double-counting", () => {
    const v = parse([
      movement(1, "in", at(20, 8)),
      movement(2, "in", at(20, 9)),
      movement(3, "transit", at(20, 10)),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].quality).toBe("location-change");
  });
});
it("uses Swiss date boundaries over daylight saving and rejects impossible windows", () => {
  const r = analyticsRange("2026-10-25", "2026-10-25", new Date(at(30)));
  expect(r.start).toBe("2026-10-24T22:00:00.000Z");
  expect(r.end).toBe("2026-10-25T22:59:59.999Z");
  expect(() => analyticsRange("2026-02-30", "2026-03-01")).toThrow();
  expect(() => analyticsRange("2026-01-01", "2026-10-25")).toThrow();
  expect(() => analyticsRange("2026-10-30", "2026-10-29")).toThrow();
});

it("bounds a later removal by the last sighting even when an intervening scan lost the record", () => {
  let s = observeWatchlist(null, [record(false)], at(19), [category]);
  s = observeWatchlist(s, [record(true)], at(20), [category]);
  s = observeWatchlist(s, [], at(23), [category]);
  s = observeWatchlist(s, [record(false)], at(25), [category]);
  expect(s.episodes[0].endAfter).toBe(at(20));
  expect(durationBounds(s.episodes[0])).toEqual({ minHours: 0, maxHours: 144 });
});
