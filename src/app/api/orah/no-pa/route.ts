// Live: students currently flagged with the "No Physical Activity"
// pastoral category. Pulls pastoral/timeline for a configurable
// look-back window, filters by category name, dedupes by student
// (most recent record wins), drops records whose watchlist_expiry
// is in the past.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError, isMockMode } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listPastoralTimeline,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";
import { NO_PA_STUDENTS } from "@/lib/mock";
import type { OrahPastoralRecord } from "@/types/orah";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface DashboardNoPaStudent {
  id: number;
  name?: string;
  initials: string;
  dorm: string;
  restriction: string;
  until: string;
}

const ZURICH = "Europe/Zurich";

function formatUntil(iso: string | null | undefined): string {
  if (!iso) return "ongoing";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ongoing";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function lookbackStartIso(): string {
  const days = Number(process.env.NO_PA_LOOKBACK_DAYS) || 60;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      students: NO_PA_STUDENTS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  const targetCategory = (
    process.env.NO_PA_CATEGORY_NAME ?? "No Physical Activity"
  ).toLowerCase();

  try {
    const startIso = lookbackStartIso();

    const [records, students, houses] = await Promise.all([
      listPastoralTimeline(startIso, undefined, { revalidate: 60 }),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    // Dedupe by student id, keeping the most recent record per student.
    const latestByStudent = new Map<number, OrahPastoralRecord>();
    for (const r of records) {
      if (!r.pastoral_category) continue;
      if (r.pastoral_category.name.toLowerCase() !== targetCategory) continue;
      const existing = latestByStudent.get(r.student.id);
      if (!existing || new Date(r.date) > new Date(existing.date)) {
        latestByStudent.set(r.student.id, r);
      }
    }

    const now = Date.now();
    const out: DashboardNoPaStudent[] = [];
    for (const r of latestByStudent.values()) {
      // Skip records whose watchlist_expiry is in the past — they
      // describe a past restriction that's already lifted.
      if (
        r.watchlist_expiry &&
        new Date(r.watchlist_expiry).getTime() < now
      ) {
        continue;
      }
      const student = studentMap.get(r.student.id);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";

      const restriction =
        (r.description?.trim() || r.note?.trim() || r.action?.trim()) ??
        "No physical activity";

      out.push({
        id: r.id,
        name: full,
        initials,
        dorm,
        restriction,
        until: formatUntil(r.watchlist_expiry),
      });
    }

    out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return NextResponse.json({
      students: out,
      meta: {
        category: process.env.NO_PA_CATEGORY_NAME ?? "No Physical Activity",
        lookbackDays: Number(process.env.NO_PA_LOOKBACK_DAYS) || 60,
        recordsScanned: records.length,
      },
      pulledAt: new Date().toISOString(),
      source: "orah",
    });
  } catch (err) {
    if (err instanceof OrahError) {
      return NextResponse.json(
        { error: err.message, bodyPreview: err.bodyPreview },
        { status: err.status },
      );
    }
    throw err;
  }
}
