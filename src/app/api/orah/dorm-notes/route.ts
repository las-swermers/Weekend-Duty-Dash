// Last night's dorm notes summary. Filters pastoral records in the
// 18:00 prev day → 06:00 today window (Europe/Zurich) by a single
// pastoral category whose name is configured via DORM_NOTES_CATEGORY_NAME.
// Returns an empty list (with a `configured: false` flag) if the env
// var isn't set, so the UI can render the right empty state.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { lastNightRange } from "@/lib/dates";
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

interface DormNote {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  description: string;
  createdBy: string;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categoryName =
    process.env.DORM_NOTES_CATEGORY_NAME?.trim() ?? "";
  const range = lastNightRange();

  if (!categoryName) {
    return NextResponse.json({
      notes: [],
      configured: false,
      window: {
        startISO: range.start.toISOString(),
        endISO: range.end.toISOString(),
      },
      pulledAt: new Date().toISOString(),
      source: "unconfigured",
    });
  }

  if (isMockMode()) {
    return NextResponse.json({
      notes: [],
      configured: true,
      window: {
        startISO: range.start.toISOString(),
        endISO: range.end.toISOString(),
      },
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const startISO = range.start.toISOString();
    const endISO = range.end.toISOString();

    const [records, students, houses] = await Promise.all([
      listPastoralTimeline(startISO, endISO, { revalidate: 60 }),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const target = categoryName.toLowerCase();
    const filtered = records.filter(
      (r) => r.pastoral_category?.name?.toLowerCase() === target,
    );

    const notes: DormNote[] = filtered
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => {
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
          description: (r.description ?? r.note ?? "").slice(0, 400),
          createdBy: r.created_by?.name ?? "—",
        };
      });

    return NextResponse.json({
      notes,
      configured: true,
      categoryName,
      window: { startISO, endISO },
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
