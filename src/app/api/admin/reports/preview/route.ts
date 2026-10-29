import { reportAction } from "@/lib/reports/actions";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: Request) {
  return reportAction(req, "preview");
}
