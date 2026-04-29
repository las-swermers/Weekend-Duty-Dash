// Recent (last 48 h) pastoral records flagged as watchlist or sensitive,
// newest first. Used by the live dashboard's "Pastoral alerts" section.

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

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface PastoralAlert {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  category: string;
  description: string;
  watchlist: boolean;
  sensitive: boolean;
  createdBy: string;
}

const MAX_RESULTS = 25;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      alerts: [],
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const startISO = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const endISO = new Date().toISOString();

    const [records, students, houses] = await Promise.all([
      listPastoralTimeline(startISO, endISO, { revalidate: 60 }),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const flagged = records
      .filter((r) => r.watchlist || r.sensitive)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, MAX_RESULTS);

    const alerts: PastoralAlert[] = flagged.map((r) => {
      const student = studentMap.get(r.student.id);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      return {
        id: r.id,
        date: r.date,
        studentName: full,
        studentInitials: initials,
        dorm,
        category: r.pastoral_category?.name ?? "—",
        description: (r.description ?? r.note ?? "").slice(0, 240),
        watchlist: Boolean(r.watchlist),
        sensitive: Boolean(r.sensitive),
        createdBy: r.created_by?.name ?? "—",
      };
    });

    return NextResponse.json({
      alerts,
      window: { startISO, endISO, hours: 48 },
      counts: {
        total: alerts.length,
        watchlist: alerts.filter((a) => a.watchlist).length,
        sensitive: alerts.filter((a) => a.sensitive).length,
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
