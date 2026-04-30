import { LiveClient } from "@/components/live/live-client";
import { auth } from "@/lib/auth";
import {
  serveCategoriesForToday,
  WEEKEND_INFRACTION_CATEGORIES,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live · LAS Duty Dashboard",
};

export default async function LivePage() {
  const session = await auth();
  const userName =
    session?.user?.name ?? session?.user?.email?.split("@")[0] ?? null;

  return (
    <LiveClient
      userName={userName}
      todayCategories={serveCategoriesForToday()}
      weekendCategories={WEEKEND_INFRACTION_CATEGORIES}
    />
  );
}
