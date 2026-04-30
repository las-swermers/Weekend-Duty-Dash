import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { auth } from "@/lib/auth";
import { currentWeekendRange, formatWeekendLabel } from "@/lib/dates";
import { getResources } from "@/lib/kv";
import { HC_STUDENTS, INITIAL_RESOURCES, NO_PA_STUDENTS } from "@/lib/mock";
import { fetchSheetResources, isSheetMode } from "@/lib/sheet-resources";

export const dynamic = "force-dynamic";

async function loadResources() {
  if (isSheetMode()) {
    try {
      return await fetchSheetResources();
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

export default async function WeekendPage() {
  const session = await auth();
  const userName =
    session?.user?.name ?? session?.user?.email?.split("@")[0] ?? null;
  const aoc = "TBD";

  const range = currentWeekendRange();
  const weekendLabel = `${formatWeekendLabel(range)} · MMXXVI`;

  const resources = await loadResources();

  return (
    <DashboardClient
      weekendLabel={weekendLabel.toUpperCase()}
      aoc={aoc}
      userName={userName}
      weekendRange={{
        startISO: range.start.toISOString(),
        endISO: range.end.toISOString(),
      }}
      initial={{
        hc: HC_STUDENTS,
        noPa: NO_PA_STUDENTS,
        resources,
      }}
    />
  );
}
