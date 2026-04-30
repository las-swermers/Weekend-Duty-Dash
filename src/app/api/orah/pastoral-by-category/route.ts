// Generic pastoral-records-by-category feed. Powers the smaller themed
// sections on the live dashboard (Discipline, Infractions, Uniform,
// Wednesday Make-Up, etc.) and the weekend "infractions to serve"
// section by switching the categories list and lookback window.

import { NextResponse, type NextRequest } from "next/server";

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

interface PastoralEntry {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  category: string;
  description: string;
  createdBy: string;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const rawCategories = params.get("categories") ?? "";
  const watchlistOnly = params.get("watchlist") === "1";
  // Watchlist queries default to a long lookback because items roll
  // over until staff clears the flag in Orah; a 7-day window would
  // miss anything older.
  const defaultDays = watchlistOnly ? 180 : 7;
  const days = Math.max(
    1,
    Math.min(365, Number(params.get("days")) || defaultDays),
  );
  const limit = Math.max(1, Math.min(200, Number(params.get("limit")) || 50));

  // Optional explicit window; both must parse for the override to apply.
  const rawStart = params.get("start");
  const rawEnd = params.get("end");
  const startParsed = rawStart ? Date.parse(rawStart) : NaN;
  const endParsed = rawEnd ? Date.parse(rawEnd) : NaN;
  const explicitWindow =
    Number.isFinite(startParsed) && Number.isFinite(endParsed);

  const categories = rawCategories
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (categories.length === 0) {
    return NextResponse.json(
      { error: "categories query param is required" },
      { status: 400 },
    );
  }

  if (isMockMode()) {
    return NextResponse.json({
      records: [],
      meta: { categories, days, recordsScanned: 0, returned: 0 },
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const startIso = explicitWindow
      ? new Date(startParsed).toISOString()
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const endIso = explicitWindow
      ? new Date(endParsed).toISOString()
      : undefined;

    const [records, students, houses] = await Promise.all([
      listPastoralTimeline(startIso, endIso, {
        revalidate: 60,
        pageSize: 200,
        maxPages: 80,
      }),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);
    const targetSet = new Set(categories);
    const nowMs = Date.now();

    const filtered = records
      .filter((r) => {
        const name = r.pastoral_category?.name?.toLowerCase();
        if (!name || !targetSet.has(name)) return false;
        if (watchlistOnly) {
          if (!r.watchlist) return false;
          if (
            r.watchlist_expiry &&
            new Date(r.watchlist_expiry).getTime() < nowMs
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);

    const out: PastoralEntry[] = filtered.map((r) => {
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
        description: (r.description ?? r.note ?? "").slice(0, 280),
        createdBy: r.created_by?.name ?? "—",
      };
    });

    return NextResponse.json({
      records: out,
      meta: {
        categories,
        days,
        watchlistOnly,
        recordsScanned: records.length,
        returned: out.length,
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
