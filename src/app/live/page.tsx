import { LiveClient } from "@/components/live/live-client";
import { auth } from "@/lib/auth";
import {
  currentMakeupWindow,
  currentWeekendRange,
  serveCategoriesForToday,
  todayRange,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live · LAS Duty Dashboard",
};

export default async function LivePage() {
  const session = await auth();
  const userName =
    session?.user?.name ?? session?.user?.email?.split("@")[0] ?? null;

  const today = todayRange();
  const todayCategories = serveCategoriesForToday();
  const makeup = currentMakeupWindow();
  const weekend = currentWeekendRange();

  return (
    <LiveClient
      userName={userName}
      todayCategories={todayCategories}
      todayStartISO={today.start.toISOString()}
      todayEndISO={today.end.toISOString()}
      weekendBucketISO={weekend.start.toISOString()}
      makeupStartISO={makeup.start.toISOString()}
      makeupEndISO={makeup.end.toISOString()}
    />
  );
}
