import { LiveClient } from "@/components/live/live-client";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live · LAS Duty Dashboard",
};

export default async function LivePage() {
  const session = await auth();
  const userName =
    session?.user?.name ?? session?.user?.email?.split("@")[0] ?? null;

  return <LiveClient userName={userName} />;
}
