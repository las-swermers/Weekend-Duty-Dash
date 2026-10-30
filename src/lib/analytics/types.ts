import type { WarningStudent } from "@/types/warnings";
import type { RestVisit, restSummary } from "./rest";
import type { Episode, watchMetrics } from "./watchlist";
export interface StudentLabel {
  studentId: number;
  name: string;
  dorm: string;
  dormId: number | null;
  year: string;
}
export interface AnalyticsData {
  start: string;
  end: string;
  pulledAt: string;
  admin: boolean;
  houses: { id: number; name: string }[];
  issues: string[];
  rosterCount: number;
  pastoral: null | {
    total: number;
    students: number;
    categories: { label: string; count: number }[];
    days: { label: string; count: number }[];
    weeks: { label: string; count: number }[];
    dorms: {
      label: string;
      count: number;
      students: number;
      roster: number;
      per100: number | null;
    }[];
    records: (StudentLabel & {
      id: number;
      category: string;
      date: string;
      description: string;
    })[];
  };
  watch: null | {
    startedAt: string | null;
    observedAt: string | null;
    targets: Record<string, number>;
    categories: string[];
    metrics: ReturnType<typeof watchMetrics>;
    episodes: (Episode & StudentLabel)[];
  };
  rest: null | {
    summary: ReturnType<typeof restSummary>;
    visits: (RestVisit & StudentLabel)[];
    now: null | {
      health: number;
      room: number;
      students: (StudentLabel & { kind: "health" | "room"; since: string })[];
    };
  };
  warnings: null | {
    week: string;
    students: WarningStudent[];
    threshold: number;
  };
}
