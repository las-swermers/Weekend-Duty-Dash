import { formatWeekLabel, weekKeyToRange, weekRange } from "@/lib/dates";
import { getWarningsForWeek } from "@/lib/warnings";
import { isMockMode } from "@/lib/orah";
import {
  listHouses,
  listStudents,
  listPastoralTimeline,
  listLocationRecordTimeline,
  resolveHealthCenterLocationIds,
} from "@/lib/orah-resources";
import { aggregateDorm } from "./analytics";
import { isCompleteWeek } from "./config";
import type { ReportData, Subscription } from "./types";

export async function buildReport(
  s: Subscription,
  key: string,
): Promise<ReportData> {
  if (!isCompleteWeek(key))
    throw new Error("Choose the Monday of a completed week.");
  if (isMockMode())
    throw new Error("Turn off mock data before generating reports.");
  const dorm = (await listHouses()).find((h) => h.id === s.dormId);
  if (!dorm) throw new Error("The configured dorm no longer exists in Orah.");
  const range = weekKeyToRange(key);
  const report: ReportData = {
    name: s.name,
    dorm: dorm.name,
    week: key,
    label: formatWeekLabel(range),
    generatedAt: new Date().toISOString(),
    expanded: s.expanded,
  };
  if (s.warnings) {
    report.warnings = await getWarningsForWeek({
      weekKey: key,
      dorm: dorm.name,
      includeOutstanding: true,
      asOfWeekEnd: true,
      strictConversations: true,
    });
    // Reports use stable house IDs as the final boundary, not a name supplied by a client.
    report.warnings.students = report.warnings.students.filter(
      (student) => student.dormId === s.dormId,
    );
  }
  if (s.analytics) {
    const [records, movements, students, hc] = await Promise.all([
      listPastoralTimeline(
        weekRange(range.start, -7).start.toISOString(),
        range.end.toISOString(),
        { pageSize: 500, maxPages: 80, revalidate: 60, requireComplete: true },
      ),
      listLocationRecordTimeline(
        range.start.toISOString(),
        range.end.toISOString(),
        { pageSize: 500, maxPages: 80, revalidate: 60, requireComplete: true },
      ),
      listStudents(),
      resolveHealthCenterLocationIds(),
    ]);
    if (!students.length)
      throw new Error(
        "Orah student roster is empty; report was not generated.",
      );
    const restIds = (process.env.HC_REST_LOCATION_IDS ?? "")
      .split(",")
      .filter((s) => /^\d+$/.test(s.trim()))
      .map(Number);
    report.analytics = aggregateDorm(
      records,
      movements,
      students,
      s.dormId,
      key,
      s.expanded,
      hc.ids,
      restIds,
      process.env.HC_REST_LOCATION_PATTERN ?? "rest",
    );
  }
  return report;
}
