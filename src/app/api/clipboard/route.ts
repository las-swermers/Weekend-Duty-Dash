// Tick-off API for the Weekend page.
//
// GET    ?weekend=<ISO>             list served entries for that weekend
// POST   { recordId, weekend, ... } mark served (auto-fills servedBy/At)
// PATCH  { recordId, weekend, note} update note on a served entry
// DELETE { recordId, weekend }      unmark served
//
// State is owned by Vercel KV. When Google Sheets sync is configured
// (see src/lib/clipboard-sheet.ts) every change is mirrored to a sheet.

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  getServed,
  markServed,
  patchNote,
  unmarkServed,
} from "@/lib/clipboard-store";
import { removeRow, upsertRow } from "@/lib/clipboard-sheet";

export const dynamic = "force-dynamic";

interface MutationBody {
  recordId?: number;
  weekend?: string;
  note?: string;
  studentName?: string;
  dorm?: string;
  category?: string;
  recordDate?: string;
}

function isValidWeekend(s: string | null | undefined): s is string {
  if (!s) return false;
  return Number.isFinite(Date.parse(s));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const weekend = req.nextUrl.searchParams.get("weekend");
  if (!isValidWeekend(weekend)) {
    return NextResponse.json({ error: "weekend required" }, { status: 400 });
  }
  try {
    const served = await getServed(weekend);
    return NextResponse.json({ served });
  } catch {
    // KV unavailable in some local envs — return empty rather than 500.
    return NextResponse.json({ served: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as MutationBody;
  if (typeof body.recordId !== "number" || !isValidWeekend(body.weekend)) {
    return NextResponse.json(
      { error: "recordId and weekend required" },
      { status: 400 },
    );
  }
  const entry = {
    recordId: body.recordId,
    servedBy: session.user.email,
    servedAt: new Date().toISOString(),
    note: body.note,
    studentName: body.studentName,
    dorm: body.dorm,
    category: body.category,
    recordDate: body.recordDate,
  };
  try {
    await markServed(body.weekend, entry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Storage error" },
      { status: 500 },
    );
  }
  void upsertRow(body.weekend, entry); // fire-and-forget mirror
  return NextResponse.json({ ok: true, entry });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as MutationBody;
  if (typeof body.recordId !== "number" || !isValidWeekend(body.weekend)) {
    return NextResponse.json(
      { error: "recordId and weekend required" },
      { status: 400 },
    );
  }
  const updated = await patchNote(
    body.weekend,
    body.recordId,
    (body.note ?? "").slice(0, 500),
  );
  if (!updated) {
    return NextResponse.json({ error: "not served yet" }, { status: 404 });
  }
  void upsertRow(body.weekend, updated);
  return NextResponse.json({ ok: true, entry: updated });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as MutationBody;
  if (typeof body.recordId !== "number" || !isValidWeekend(body.weekend)) {
    return NextResponse.json(
      { error: "recordId and weekend required" },
      { status: 400 },
    );
  }
  await unmarkServed(body.weekend, body.recordId);
  void removeRow(body.recordId);
  return NextResponse.json({ ok: true });
}
