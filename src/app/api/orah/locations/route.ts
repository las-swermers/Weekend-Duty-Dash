// Locations discovery route. Lists every Orah location (top-level
// zones plus their immediate children) so the AOC can find the id of
// the Health Center / dorms / wherever, then pin those ids via env
// vars (HEALTH_CENTER_LOCATION_ID, etc.).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError } from "@/lib/orah";
import { listLocationsFlat } from "@/lib/orah-resources";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tree = await listLocationsFlat();
    const flat = tree.flatMap((loc) => [
      {
        id: loc.id,
        name: loc.name,
        state: loc.state,
        type: loc.type,
        parent: null as null | { id: number; name: string },
      },
      ...(loc.child_locations ?? []).map((child) => ({
        id: child.id,
        name: child.name,
        state: loc.state,
        type: undefined as string | undefined,
        parent: { id: loc.id, name: loc.name },
      })),
    ]);

    return NextResponse.json({
      count: flat.length,
      locations: flat,
      pulledAt: new Date().toISOString(),
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
