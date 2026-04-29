// Server-side admin gate + Apps Script webhook forwarder for the
// launchpad. The Google Sheet stays private to the owner; a Google
// Apps Script attached to the sheet exposes a doPost(e) endpoint that
// runs as the owner and appends rows. The dashboard's POST handler
// forwards admin-authenticated requests to that endpoint.
//
// Required env vars when admin writes are enabled:
//   LAUNCHPAD_ADMIN_EMAILS  comma-separated emails who can add tiles
//   LAUNCHPAD_WRITE_URL     Apps Script web app deployment URL
//   LAUNCHPAD_WRITE_TOKEN   shared secret matching the Apps Script

import { revalidateTag } from "next/cache";

export const LAUNCHPAD_SHEET_TAG = "launchpad-sheet";

export interface AddLinkInput {
  name: string;
  url: string;
  icon?: string;
}

export interface AddLinkResult {
  ok: true;
  appended: { name: string; url: string; icon: string };
}

export class LaunchpadWriteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LaunchpadWriteError";
  }
}

export function isLaunchpadAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.LAUNCHPAD_ADMIN_EMAILS;
  if (!raw || !raw.trim()) return false;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(email.toLowerCase());
}

export function isWriteConfigured(): boolean {
  return Boolean(
    process.env.LAUNCHPAD_WRITE_URL?.trim() &&
      process.env.LAUNCHPAD_WRITE_TOKEN?.trim(),
  );
}

const ALLOWED_ICONS = new Set([
  "link",
  "book",
  "award",
  "users",
  "bus",
  "clipboard",
  "flag",
  "heart",
  "message",
  "phone",
  "calendar",
  "folder",
  "map",
  "key",
  "bell",
]);

function normaliseIcon(value: string | undefined): string {
  const trimmed = (value ?? "").trim().toLowerCase();
  return ALLOWED_ICONS.has(trimmed) ? trimmed : "link";
}

export async function appendLinkViaAppsScript(
  input: AddLinkInput,
): Promise<AddLinkResult> {
  const writeUrl = process.env.LAUNCHPAD_WRITE_URL?.trim();
  const token = process.env.LAUNCHPAD_WRITE_TOKEN?.trim();
  if (!writeUrl || !token) {
    throw new LaunchpadWriteError(
      500,
      "LAUNCHPAD_WRITE_URL / LAUNCHPAD_WRITE_TOKEN not configured",
    );
  }

  const name = input.name.trim();
  const url = input.url.trim();
  if (!name) throw new LaunchpadWriteError(400, "name is required");
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    throw new LaunchpadWriteError(400, "url must start with https:// or http://");
  }
  const icon = normaliseIcon(input.icon);

  const res = await fetch(writeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add", token, name, url, icon }),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new LaunchpadWriteError(
      res.status,
      `Apps Script ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  let parsed: { ok?: boolean; error?: string } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LaunchpadWriteError(
      502,
      `Apps Script returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
  if (!parsed.ok) {
    throw new LaunchpadWriteError(
      502,
      parsed.error ?? "Apps Script reported failure",
    );
  }

  // Bust the sheet fetch cache so the next /api/resources GET sees the
  // new row immediately rather than waiting up to 5 minutes.
  revalidateTag(LAUNCHPAD_SHEET_TAG);

  return { ok: true, appended: { name, url, icon } };
}

export interface RemoveLinkInput {
  name: string;
  url?: string;
}

export interface RemoveLinkResult {
  ok: true;
  removed: { name: string; url: string };
}

export async function removeLinkViaAppsScript(
  input: RemoveLinkInput,
): Promise<RemoveLinkResult> {
  const writeUrl = process.env.LAUNCHPAD_WRITE_URL?.trim();
  const token = process.env.LAUNCHPAD_WRITE_TOKEN?.trim();
  if (!writeUrl || !token) {
    throw new LaunchpadWriteError(
      500,
      "LAUNCHPAD_WRITE_URL / LAUNCHPAD_WRITE_TOKEN not configured",
    );
  }

  const name = input.name.trim();
  const url = input.url?.trim() ?? "";
  if (!name) throw new LaunchpadWriteError(400, "name is required");

  const res = await fetch(writeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove", token, name, url }),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new LaunchpadWriteError(
      res.status,
      `Apps Script ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  let parsed: { ok?: boolean; error?: string; removed?: { name: string; url: string } } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LaunchpadWriteError(
      502,
      `Apps Script returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
  if (!parsed.ok) {
    throw new LaunchpadWriteError(
      404,
      parsed.error ?? "Tile not found in sheet",
    );
  }

  revalidateTag(LAUNCHPAD_SHEET_TAG);

  return {
    ok: true,
    removed: parsed.removed ?? { name, url },
  };
}
