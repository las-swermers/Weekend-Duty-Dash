// Conversation log for the Warnings review. The Google Sheet is the source
// of truth, so a failed write must surface as an error — never a silent
// success that leaves the tick-off existing only in the browser.
//
// POST   { studentId, week, studentName?, dorm?, status?, response?, levelOverride?, conversationDate? }
// DELETE { studentId, week }

import { NextResponse, type NextRequest } from "next/server";

import { isWeekKey } from "@/lib/dates";
import { requireWarningsAccess } from "@/lib/warnings-auth";
import {
  WarningsSheetError,
  clearConversation,
  conversationKey,
  isWarningsSheetConfigured,
  upsertConversation,
} from "@/lib/warnings-sheet";
import type { ConversationEntry, ConversationStatus } from "@/types/warnings";

export const dynamic = "force-dynamic";

const MAX_RESPONSE = 2000;

interface Body {
  studentId?: number;
  week?: string;
  studentName?: string;
  dorm?: string;
  status?: string;
  response?: string;
  levelOverride?: number | null;
  conversationDate?: string;
}

function guard(body: Body):
  | { ok: true; studentId: number; week: string }
  | { ok: false; res: NextResponse } {
  if (typeof body.studentId !== "number" || !Number.isFinite(body.studentId)) {
    return {
      ok: false,
      res: NextResponse.json({ error: "studentId is required" }, { status: 400 }),
    };
  }
  if (!isWeekKey(body.week)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "week must be a YYYY-MM-DD Monday" },
        { status: 400 },
      ),
    };
  }
  return { ok: true, studentId: body.studentId, week: body.week };
}

function sheetErrorResponse(err: unknown): NextResponse {
  if (err instanceof WarningsSheetError) {
    return NextResponse.json(
      { error: err.message, bodyPreview: err.bodyPreview },
      { status: err.status },
    );
  }
  console.error("[warnings/conversation] unexpected failure", err);
  return NextResponse.json(
    { error: "Could not write to the warnings sheet." },
    { status: 502 },
  );
}

export async function POST(req: NextRequest) {
  const access = await requireWarningsAccess();
  if (!access.ok || !access.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isWarningsSheetConfigured()) {
    return NextResponse.json(
      {
        error:
          "Conversation logging is disabled. Set WARNINGS_SHEET_ID and the Google service-account env vars.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const g = guard(body);
  if (!g.ok) return g.res;

  const status: ConversationStatus =
    body.status === "pending" ? "pending" : "done";

  const rawOverride = body.levelOverride;
  const levelOverride =
    typeof rawOverride === "number" && Number.isFinite(rawOverride)
      ? Math.max(0, Math.floor(rawOverride))
      : null;

  const conversationDate =
    status === "done"
      ? body.conversationDate && Number.isFinite(Date.parse(body.conversationDate))
        ? new Date(body.conversationDate).toISOString()
        : new Date().toISOString()
      : null;

  const entry: ConversationEntry = {
    key: conversationKey(g.studentId, g.week),
    studentId: g.studentId,
    studentName: (body.studentName ?? "").slice(0, 200),
    dorm: (body.dorm ?? "").slice(0, 100),
    week: g.week,
    status,
    levelOverride,
    conversationDate,
    // Server-stamped: the client cannot claim someone else had the talk.
    loggedBy: access.email,
    response: (body.response ?? "").slice(0, MAX_RESPONSE),
    updatedAt: new Date().toISOString(),
  };

  try {
    await upsertConversation(entry);
  } catch (err) {
    return sheetErrorResponse(err);
  }
  return NextResponse.json({ ok: true, entry });
}

export async function DELETE(req: NextRequest) {
  const access = await requireWarningsAccess();
  if (!access.ok || !access.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const g = guard(body);
  if (!g.ok) return g.res;

  try {
    await clearConversation(conversationKey(g.studentId, g.week));
  } catch (err) {
    return sheetErrorResponse(err);
  }
  return NextResponse.json({ ok: true });
}
