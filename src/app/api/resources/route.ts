import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getResources } from "@/lib/kv";
import {
  SheetResourcesError,
  fetchSheetResources,
  isSheetMode,
  sheetEditUrl,
} from "@/lib/sheet-resources";
import { INITIAL_RESOURCES } from "@/lib/mock";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSheetMode()) {
    try {
      const resources = await fetchSheetResources();
      return NextResponse.json({
        resources,
        mode: "sheet",
        editUrl: sheetEditUrl(),
      });
    } catch (err) {
      const status = err instanceof SheetResourcesError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : "Sheet fetch failed";
      // Fall through to seed list so the dashboard isn't empty if the
      // sheet is briefly unreachable.
      return NextResponse.json(
        {
          resources: INITIAL_RESOURCES,
          mode: "fallback",
          editUrl: sheetEditUrl(),
          sheetError: message,
        },
        { status },
      );
    }
  }

  try {
    const resources = await getResources();
    return NextResponse.json({ resources, mode: "kv", editUrl: null });
  } catch {
    return NextResponse.json({
      resources: INITIAL_RESOURCES,
      mode: "seed",
      editUrl: null,
    });
  }
}
