import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  addResource,
  deleteResource,
  getResources,
  updateResource,
} from "@/lib/kv";
import {
  SheetResourcesError,
  fetchSheetResources,
  isSheetMode,
  sheetEditUrl,
} from "@/lib/sheet-resources";
import { INITIAL_RESOURCES } from "@/lib/mock";
import { CATEGORIES, type ResourceCategory } from "@/types/resource";

const ALLOWED_CATEGORIES = new Set<ResourceCategory>(CATEGORIES);

function isCategory(value: unknown): value is ResourceCategory {
  return (
    typeof value === "string" &&
    ALLOWED_CATEGORIES.has(value as ResourceCategory)
  );
}

const SHEET_READ_ONLY = NextResponse.json(
  {
    error:
      "Launchpad is read-only when LAUNCHPAD_SHEET_CSV_URL is set. Edit the source Google Sheet to add, remove, or update tiles.",
    editUrl: sheetEditUrl(),
  },
  { status: 405 },
);

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
      return NextResponse.json({ error: message }, { status });
    }
  }

  try {
    const resources = await getResources();
    return NextResponse.json({ resources, mode: "kv" });
  } catch {
    // KV not provisioned — fall back to in-memory seed so the dashboard
    // still renders something useful instead of erroring out.
    return NextResponse.json({
      resources: INITIAL_RESOURCES,
      mode: "seed",
      editUrl: null,
    });
  }
}

export async function POST(req: NextRequest) {
  if (isSheetMode()) return SHEET_READ_ONLY;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, url, icon, category } = body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return NextResponse.json(
      { error: "url is required and must be https" },
      { status: 400 },
    );
  }
  if (!isCategory(category)) {
    return NextResponse.json(
      { error: "category is required" },
      { status: 400 },
    );
  }

  const created = await addResource({
    name: name.trim(),
    url,
    icon: typeof icon === "string" && icon ? icon : "link",
    category,
    addedBy: email,
  });

  return NextResponse.json({ resource: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (isSheetMode()) return SHEET_READ_ONLY;
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...patch } = body as { id?: string } & Record<string, unknown>;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if ("category" in patch && !isCategory(patch.category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }
  if (
    "url" in patch &&
    (typeof patch.url !== "string" || !patch.url.startsWith("https://"))
  ) {
    return NextResponse.json(
      { error: "url must be https" },
      { status: 400 },
    );
  }

  const updated = await updateResource(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ resource: updated });
}

export async function DELETE(req: NextRequest) {
  if (isSheetMode()) return SHEET_READ_ONLY;
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const ok = await deleteResource(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
