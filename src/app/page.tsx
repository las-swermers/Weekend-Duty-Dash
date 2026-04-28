import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { auth } from "@/lib/auth";
import { currentWeekendRange, formatWeekendLabel } from "@/lib/dates";
import { getResources } from "@/lib/kv";
import {
  HC_STUDENTS,
  INITIAL_RESOURCES,
  NO_PA_STUDENTS,
  SCHEDULED_TRIPS,
  TRAVEL_REQUESTS,
} from "@/lib/mock";

export const dynamic = "force-dynamic";

async function loadResources() {
  // KV may be unavailable locally; fall back to the seed list if so.
  try {
    return await getResources();
  } catch {
    return INITIAL_RESOURCES;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  const aoc =
    session?.user?.name ??
    session?.user?.email?.split("@")[0] ??
    "S. Whitfield";

  const range = currentWeekendRange();
  const weekendLabel = `${formatWeekendLabel(range)} · MMXXVI`;

  // Phase 1: server-side initial data is the mock fixture. The client
  // then revalidates against the API routes — which themselves serve
  // mock data while USE_MOCK_DATA=1 is set, and will swap to live Orah
  // data in Phase 2.
  const resources = await loadResources();

  return (
    <DashboardClient
      weekendLabel={weekendLabel.toUpperCase()}
      aoc={aoc}
      initial={{
        hc: HC_STUDENTS,
        noPa: NO_PA_STUDENTS,
        travel: TRAVEL_REQUESTS,
        trips: SCHEDULED_TRIPS,
        resources,
      }}
    />
  );
}
