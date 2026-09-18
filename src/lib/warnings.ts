// Server-side assembly for the weekly Warnings review.
//
// Pulls Orah "Infraction → Warning" pastoral records for a term window, joins
// them to students and houses, groups them per student, then folds in the
// dorm's conversation log from Google Sheets to work out escalation levels.
//
// Mirrors the shape of src/lib/pastoral.ts. Deliberately does NOT reuse
// /api/orah/pastoral-by-category: that route drops studentId, which both the
// per-student grouping and the sheet key need.

import {
  formatWeekLabel,
  isWeekKey,
  warningsCategories,
  weekKey as currentWeekKeyFor,
  weekKeyToRange,
  weekRange,
} from "@/lib/dates";
import { OrahError } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listPastoralTimeline,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";
import {
  conversationKey,
  isWarningsSheetConfigured,
  readConversations,
  warningsSheetUrl,
} from "@/lib/warnings-sheet";
import type { OrahPastoralRecord } from "@/types/orah";
import type {
  ConversationEntry,
  WarningRecord,
  WarningStudent,
  WarningsResponse,
} from "@/types/warnings";

const DEFAULT_THRESHOLD = 3;
const DEFAULT_LOOKBACK_DAYS = 120;

export function escalationThreshold(): number {
  const n = Number(process.env.WARNINGS_ESCALATION_THRESHOLD);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_THRESHOLD;
}

// Start of the accumulation window. An explicit WARNINGS_TERM_START wins so
// levels reset cleanly each term; otherwise fall back to a rolling lookback.
export function termStart(now: Date = new Date()): Date {
  const raw = process.env.WARNINGS_TERM_START?.trim();
  if (raw) {
    const parsed = Date.parse(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
    if (Number.isFinite(parsed) && parsed <= now.getTime()) {
      return new Date(parsed);
    }
  }
  const days = Number(process.env.WARNINGS_LOOKBACK_DAYS);
  const lookback =
    Number.isFinite(days) && days >= 1 ? Math.floor(days) : DEFAULT_LOOKBACK_DAYS;
  return new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000);
}

function toWarningRecord(r: OrahPastoralRecord): WarningRecord {
  return {
    id: r.id,
    date: r.date,
    description: (r.description ?? "").trim(),
    action: (r.action ?? "").trim(),
    note: (r.note ?? "").trim(),
    createdBy: r.created_by?.name ?? "—",
  };
}

// Newest first.
function byDateDesc(a: { date: string }, b: { date: string }): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

interface Levels {
  computedLevel: number;
  effectiveLevel: number;
  dueNow: boolean;
  warningsSinceLastConversation: number;
}

// Level rises by one each time a student accumulates `threshold` warnings
// with no conversation logged since the last one. A manual override in the
// sheet wins outright.
export function computeLevels(
  termWarnings: WarningRecord[],
  conversations: ConversationEntry[],
  threshold: number,
  levelOverride: number | null,
): Levels {
  const done = conversations
    .filter((c) => c.status === "done")
    .map((c) => c.conversationDate)
    .filter((d): d is string => Boolean(d))
    .sort();

  const lastAt = done.length > 0 ? done[done.length - 1]! : null;
  const since = lastAt
    ? termWarnings.filter((w) => w.date > lastAt).length
    : termWarnings.length;

  const dueNow = since >= threshold;
  const computedLevel = done.length + (dueNow ? 1 : 0);

  return {
    computedLevel,
    effectiveLevel: levelOverride ?? computedLevel,
    dueNow,
    warningsSinceLastConversation: since,
  };
}

export interface WarningsQuery {
  weekKey?: string | null;
  // Whole weeks back from the current one (-1 = last week). Ignored when
  // weekKey is supplied. Lets the client page through history without
  // needing the Zurich week maths in the browser bundle.
  offset?: number | null;
  dorm?: string | null;
}

export async function getWarningsForWeek(
  q: WarningsQuery = {},
): Promise<WarningsResponse> {
  const now = new Date();
  const currentKey = currentWeekKeyFor(now);

  let key: string;
  if (isWeekKey(q.weekKey)) {
    key = q.weekKey;
  } else if (typeof q.offset === "number" && Number.isFinite(q.offset)) {
    // Clamp: ~4 years back, never forward past the current week.
    const offset = Math.max(-208, Math.min(0, Math.trunc(q.offset)));
    key = currentWeekKeyFor(weekRange(now, offset).start);
  } else {
    key = currentKey;
  }

  let week;
  try {
    week = weekKeyToRange(key);
  } catch {
    throw new OrahError(400, `week must be a YYYY-MM-DD Monday, got "${key}"`);
  }

  // Fetch the whole term once — it's a superset of the requested week, and we
  // need the history anyway to work out levels.
  const start = termStart(now);
  const windowStart =
    week.start.getTime() < start.getTime() ? week.start : start;
  // A future week request shouldn't truncate the fetch.
  const windowEnd = week.end.getTime() > now.getTime() ? week.end : now;

  const [records, students, houses, conversations] = await Promise.all([
    listPastoralTimeline(windowStart.toISOString(), windowEnd.toISOString(), {
      revalidate: 60,
      pageSize: 200,
      maxPages: 80,
    }),
    listStudents(),
    listHouses(),
    readConversations().catch((err) => {
      // The sheet is the source of truth for conversations, but an outage
      // there must not take down the warnings list itself.
      console.error("[warnings] conversation read failed", err);
      return [] as ConversationEntry[];
    }),
  ]);

  const studentMap = buildStudentMap(students);
  const houseMap = buildHouseMap(houses);

  const targets = new Set(
    warningsCategories().map((c) => c.trim().toLowerCase()),
  );

  const weekStartMs = week.start.getTime();
  const weekEndMs = week.end.getTime();
  const dormFilter =
    q.dorm && q.dorm !== "all" ? q.dorm.trim().toLowerCase() : null;

  let sensitiveSuppressed = 0;

  interface Bucket {
    student: WarningStudent;
    term: WarningRecord[];
  }
  const buckets = new Map<number, Bucket>();
  const dorms = new Set<string>();

  for (const r of records) {
    const name = r.pastoral_category?.name?.trim().toLowerCase();
    if (!name || !targets.has(name)) continue;

    // Warnings are logged events, not tasks to serve — no watchlist filter.
    if (r.sensitive) {
      sensitiveSuppressed += 1;
      continue;
    }

    // Bucket on `date` (when it happened), not created_at (when it was
    // written up) — staff routinely log the morning after.
    const whenMs = Date.parse(r.date);
    if (!Number.isFinite(whenMs)) continue;

    const orahStudent = studentMap.get(r.student.id);
    const dorm = orahStudent?.house?.id
      ? houseMap.get(orahStudent.house.id) ?? "—"
      : "—";
    if (dorm && dorm !== "—") dorms.add(dorm);
    if (dormFilter && dorm.toLowerCase() !== dormFilter) continue;

    let bucket = buckets.get(r.student.id);
    if (!bucket) {
      const { full, initials } = studentDisplayName(orahStudent);
      bucket = {
        term: [],
        student: {
          studentId: r.student.id,
          name: full,
          initials,
          dorm,
          dormId: orahStudent?.house?.id ?? null,
          yearLevel: orahStudent?.year_level ?? null,
          warningsThisWeek: [],
          termWarningCount: 0,
          warningsSinceLastConversation: 0,
          lastConversationAt: null,
          conversationCount: 0,
          computedLevel: 0,
          levelOverride: null,
          effectiveLevel: 0,
          dueNow: false,
          conversation: null,
        },
      };
      buckets.set(r.student.id, bucket);
    }

    const rec = toWarningRecord(r);
    bucket.term.push(rec);
    if (whenMs >= weekStartMs && whenMs <= weekEndMs) {
      bucket.student.warningsThisWeek.push(rec);
    }
  }

  const byStudent = new Map<number, ConversationEntry[]>();
  for (const c of conversations) {
    const list = byStudent.get(c.studentId);
    if (list) list.push(c);
    else byStudent.set(c.studentId, [c]);
  }

  const threshold = escalationThreshold();
  const termStartISO = start.toISOString();

  const out: WarningStudent[] = [];
  for (const { student, term } of buckets.values()) {
    // Only students with a warning in the requested week belong on the board.
    if (student.warningsThisWeek.length === 0) continue;

    const all = byStudent.get(student.studentId) ?? [];
    const inTerm = all.filter(
      (c) => !c.conversationDate || c.conversationDate >= termStartISO,
    );
    const thisWeek =
      all.find((c) => c.key === conversationKey(student.studentId, key)) ?? null;

    const levels = computeLevels(
      term,
      inTerm,
      threshold,
      thisWeek?.levelOverride ?? null,
    );

    const doneDates = inTerm
      .filter((c) => c.status === "done" && c.conversationDate)
      .map((c) => c.conversationDate!)
      .sort();

    student.warningsThisWeek.sort(byDateDesc);
    student.termWarningCount = term.length;
    student.conversationCount = doneDates.length;
    student.lastConversationAt =
      doneDates.length > 0 ? doneDates[doneDates.length - 1]! : null;
    student.levelOverride = thisWeek?.levelOverride ?? null;
    student.computedLevel = levels.computedLevel;
    student.effectiveLevel = levels.effectiveLevel;
    student.dueNow = levels.dueNow;
    student.warningsSinceLastConversation =
      levels.warningsSinceLastConversation;
    student.conversation = thisWeek;

    out.push(student);
  }

  // Most urgent first: highest level, then most warnings, then name.
  out.sort(
    (a, b) =>
      b.effectiveLevel - a.effectiveLevel ||
      b.warningsThisWeek.length - a.warningsThisWeek.length ||
      a.name.localeCompare(b.name),
  );

  return {
    week: {
      key,
      startISO: week.start.toISOString(),
      endISO: week.end.toISOString(),
      label: formatWeekLabel(week),
      isCurrent: key === currentKey,
    },
    students: out,
    meta: {
      categories: warningsCategories(),
      termStartISO,
      threshold,
      sheetConfigured: isWarningsSheetConfigured(),
      sheetUrl: warningsSheetUrl(),
      sensitiveSuppressed,
      recordsScanned: records.length,
      dorms: Array.from(dorms).sort((a, b) => a.localeCompare(b)),
      pulledAt: new Date().toISOString(),
    },
  };
}

// ─── Report rows (shared by the sheet push and the printable view) ───────

export function reportRows(data: WarningsResponse, dorm?: string): string[][] {
  const header = [
    "Student",
    "Dorm",
    "Year",
    "Warnings this week",
    "Since last conversation",
    "Term total",
    "Level",
    "Conversation had",
    "Logged by",
    "Response",
    "Warning detail",
  ];

  const rows: string[][] = [
    [`Warnings review — week of ${data.week.key}${dorm && dorm !== "all" ? ` · ${dorm}` : ""}`],
    [`Generated ${new Date().toISOString()}`],
    [],
    header,
  ];

  for (const s of data.students) {
    rows.push([
      s.name,
      s.dorm,
      s.yearLevel ?? "",
      String(s.warningsThisWeek.length),
      String(s.warningsSinceLastConversation),
      String(s.termWarningCount),
      String(s.effectiveLevel),
      s.conversation?.status === "done" ? "Yes" : "",
      s.conversation?.loggedBy ?? "",
      s.conversation?.response ?? "",
      s.warningsThisWeek
        .map((w) => `${w.date} — ${w.description || "(no description)"} (${w.createdBy})`)
        .join(" | "),
    ]);
  }

  return rows;
}
