import { auth } from "@/lib/auth";
import { isReportsAdmin } from "./config";
export async function reportsAdmin(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  return email && isReportsAdmin(email) ? email : null;
}
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin === new URL(req.url).origin);
}
