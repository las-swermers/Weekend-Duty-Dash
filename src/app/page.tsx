import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { auth } from "@/lib/auth";
import { currentWeekendRange, formatWeekendLabel } from "@/lib/dates";
import { getResources } from "@/lib/kv";
import { HC_STUDENTS, INITIAL_RESOURCES, NO_PA_STUDENTS } from "@/lib/mock";
import { getResourcesFromSheet, isSheetConfigured } from "@/lib/sheets";

export const dynamic = "force-dynamic";

async function loadResources() {
  if (isSheetConfigured()) {
    try {
      return await getResourcesFromSheet();
    } catch {
      return INITIAL_RESOURCES;
    }
  }
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

  const resources = await loadResources();

  return (
    <DashboardClient
      weekendLabel={weekendLabel.toUpperCase()}
      aoc={aoc}
      initial={{
        hc: HC_STUDENTS,
        noPa: NO_PA_STUDENTS,
        resources,
      }}
    />
  );
}
