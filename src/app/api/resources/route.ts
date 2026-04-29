import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getResources } from "@/lib/kv";
import {
  SheetError,
  getResourcesFromSheet,
  isSheetConfigured,
} from "@/lib/sheets";
import { INITIAL_RESOURCES } from "@/lib/mock";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSheetConfigured()) {
    try {
      const resources = await getResourcesFromSheet();
      return NextResponse.json({ resources, source: "sheet" });
    } catch (err) {
      const message =
        err instanceof SheetError
          ? `${err.message}${err.bodyPreview ? ` — ${err.bodyPreview}` : ""}`
          : err instanceof Error
            ? err.message
            : "sheet error";
      // Surface the failure but still serve something usable so the
      // dashboard isn't empty if the sheet is briefly unreachable.
      return NextResponse.json({
        resources: INITIAL_RESOURCES,
        source: "fallback",
        sheetError: message,
      });
    }
  }

  try {
    const resources = await getResources();
    return NextResponse.json({ resources, source: "kv" });
  } catch {
    return NextResponse.json({
      resources: INITIAL_RESOURCES,
      source: "fallback",
    });
  }
}
