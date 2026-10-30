"use client";
import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { buildDemoAnalytics, DEMO_NOW } from "@/lib/demo/analytics";
import { DemoReports } from "./demo-reports";

const source = { now: DEMO_NOW, load: buildDemoAnalytics };
export function DemoClient() {
  return (
    <>
      <AnalyticsClient
        defaultStart=""
        defaultEnd=""
        viewerEmail=""
        demo={source}
      />
      <DemoReports />
    </>
  );
}
