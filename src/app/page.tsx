import { redirect } from "next/navigation";

import { isWeekendMode } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  redirect(isWeekendMode() ? "/weekend" : "/live");
}
