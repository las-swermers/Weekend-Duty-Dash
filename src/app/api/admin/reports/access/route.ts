import { NextResponse } from "next/server";
import { reportsAdmin } from "@/lib/reports/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(
    { admin: Boolean(await reportsAdmin()) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
