import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { sendSnapshot, type SnapshotData } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { recipients, snapshot } = body as {
    recipients?: unknown;
    snapshot?: unknown;
  };

  if (!Array.isArray(recipients) || !snapshot || typeof snapshot !== "object") {
    return NextResponse.json(
      { error: "recipients (array) and snapshot (object) required" },
      { status: 400 },
    );
  }

  const allowedDomain = process.env.ALLOWED_DOMAIN ?? "las.ch";
  const cleanRecipients = recipients
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter((r) => r.endsWith(`@${allowedDomain}`));

  if (cleanRecipients.length === 0) {
    return NextResponse.json(
      { error: `No valid @${allowedDomain} recipients` },
      { status: 400 },
    );
  }

  try {
    await sendSnapshot(cleanRecipients, {
      ...(snapshot as SnapshotData),
      sentBy: email,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: cleanRecipients });
}
