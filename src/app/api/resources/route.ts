import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getResources } from "@/lib/kv";
import {
  LaunchpadWriteError,
  appendLinkViaAppsScript,
  isLaunchpadAdmin,
  isWriteConfigured,
  removeLinkViaAppsScript,
  updateLinkViaAppsScript,
} from "@/lib/launchpad-write";
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

  const canAdd =
    isLaunchpadAdmin(session.user?.email) && isWriteConfigured();

  if (isSheetMode()) {
    try {
      const resources = await fetchSheetResources();
      return NextResponse.json({
        resources,
        mode: "sheet",
        editUrl: sheetEditUrl(),
        canAdd,
      });
    } catch (err) {
      const status = err instanceof SheetResourcesError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : "Sheet fetch failed";
      return NextResponse.json(
        {
          resources: INITIAL_RESOURCES,
          mode: "fallback",
          editUrl: sheetEditUrl(),
          sheetError: message,
          canAdd,
        },
        { status },
      );
    }
  }

  try {
    const resources = await getResources();
    return NextResponse.json({ resources, mode: "kv", editUrl: null, canAdd });
  } catch {
    return NextResponse.json({
      resources: INITIAL_RESOURCES,
      mode: "seed",
      editUrl: null,
      canAdd,
    });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isLaunchpadAdmin(session.user?.email)) {
    return NextResponse.json(
      { error: "Not authorised to add launchpad links" },
      { status: 403 },
    );
  }
  if (!isSheetMode() || !isWriteConfigured()) {
    return NextResponse.json(
      {
        error:
          "Launchpad writes are disabled. Set LAUNCHPAD_SHEET_CSV_URL, LAUNCHPAD_WRITE_URL, and LAUNCHPAD_WRITE_TOKEN.",
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { name, url, icon } = body as Record<string, unknown>;
  if (typeof name !== "string" || typeof url !== "string") {
    return NextResponse.json(
      { error: "name and url are required strings" },
      { status: 400 },
    );
  }

  try {
    const result = await appendLinkViaAppsScript({
      name,
      url,
      icon: typeof icon === "string" ? icon : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof LaunchpadWriteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "write failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isLaunchpadAdmin(session.user?.email)) {
    return NextResponse.json(
      { error: "Not authorised to remove launchpad links" },
      { status: 403 },
    );
  }
  if (!isSheetMode() || !isWriteConfigured()) {
    return NextResponse.json(
      {
        error:
          "Launchpad writes are disabled. Set LAUNCHPAD_SHEET_CSV_URL, LAUNCHPAD_WRITE_URL, and LAUNCHPAD_WRITE_TOKEN.",
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { name, url } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  try {
    const result = await removeLinkViaAppsScript({
      name,
      url: typeof url === "string" ? url : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LaunchpadWriteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isLaunchpadAdmin(session.user?.email)) {
    return NextResponse.json(
      { error: "Not authorised to edit launchpad links" },
      { status: 403 },
    );
  }
  if (!isSheetMode() || !isWriteConfigured()) {
    return NextResponse.json(
      {
        error:
          "Launchpad writes are disabled. Set LAUNCHPAD_SHEET_CSV_URL, LAUNCHPAD_WRITE_URL, and LAUNCHPAD_WRITE_TOKEN.",
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { originalName, originalUrl, name, url, icon } = body as Record<
    string,
    unknown
  >;
  if (typeof originalName !== "string" || !originalName.trim()) {
    return NextResponse.json(
      { error: "originalName is required" },
      { status: 400 },
    );
  }
  if (typeof name !== "string" || typeof url !== "string") {
    return NextResponse.json(
      { error: "name and url are required strings" },
      { status: 400 },
    );
  }

  try {
    const result = await updateLinkViaAppsScript({
      originalName,
      originalUrl: typeof originalUrl === "string" ? originalUrl : undefined,
      name,
      url,
      icon: typeof icon === "string" ? icon : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LaunchpadWriteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 500 },
    );
  }
}
