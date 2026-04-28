// Diagnostic route for Phase 0 / Phase 2.
//
// Calls the Orah API with the env-configured key and returns the raw
// responses, so the AOC can confirm which endpoint paths and auth header
// the LAS Orah tenant actually uses. Auth-gated (LAS users only) and
// read-only.
//
// Usage from a signed-in browser:
//
//   /api/orah/diagnose
//       runs the default battery of probes (locations + the four
//       endpoints we expect to use) against the most likely paths
//
//   /api/orah/diagnose?path=/open-api/locations
//       probes a single path with header X-API-Key
//
//   /api/orah/diagnose?path=/whatever&header=Authorization
//       probes a single path with a custom header. When header is
//       Authorization the value is sent as `Bearer <key>`; otherwise
//       the raw key is sent.

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

const BASE = process.env.ORAH_BASE_URL ?? "https://open-api-ireland.orah.com";
const KEY = process.env.ORAH_API_KEY;

interface ProbeResult {
  path: string;
  header: string;
  status: number;
  ok: boolean;
  contentType?: string | null;
  body?: unknown;
  bodyPreview?: string;
  error?: string;
}

const DEFAULT_PATHS = [
  // Locations — to find the Health Center id.
  "/open-api/locations",
  "/open-api/v1/locations",
  "/api/v1/locations",
  // The four data feeds we need.
  "/open-api/location-records",
  "/open-api/pastoral-records",
  "/open-api/leave-requests",
  "/open-api/students",
  "/open-api/houses",
];

function safePath(input: string): string | null {
  if (!input.startsWith("/")) return null;
  if (input.includes("..")) return null;
  return input;
}

function headerValue(header: string, key: string): string {
  return header.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
}

async function probe(
  path: string,
  header: string,
  key: string,
): Promise<ProbeResult> {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        [header]: headerValue(header, key),
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    const contentType = res.headers.get("content-type");
    let body: unknown;
    let bodyPreview: string | undefined;
    if (contentType?.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        bodyPreview = text.slice(0, 500);
      }
    } else {
      bodyPreview = text.slice(0, 500);
    }
    return {
      path,
      header,
      status: res.status,
      ok: res.ok,
      contentType,
      body,
      bodyPreview,
    };
  } catch (err) {
    return {
      path,
      header,
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!KEY) {
    return NextResponse.json(
      { error: "ORAH_API_KEY is not configured on this deployment" },
      { status: 500 },
    );
  }

  const customPath = req.nextUrl.searchParams.get("path");
  const customHeader = req.nextUrl.searchParams.get("header") ?? "X-API-Key";

  if (customPath) {
    const path = safePath(customPath);
    if (!path) {
      return NextResponse.json(
        { error: "path must start with / and not contain .." },
        { status: 400 },
      );
    }
    const result = await probe(path, customHeader, KEY);
    return NextResponse.json({ baseUrl: BASE, ...result });
  }

  // Battery: try each candidate path with X-API-Key, then fall back to
  // Authorization if the first attempt looks like an auth failure.
  const results: ProbeResult[] = [];
  for (const path of DEFAULT_PATHS) {
    let r = await probe(path, "X-API-Key", KEY);
    if (r.status === 401 || r.status === 403) {
      const alt = await probe(path, "Authorization", KEY);
      if (alt.ok || alt.status !== 401) r = alt;
    }
    results.push(r);
  }

  const summary = {
    baseUrl: BASE,
    sentBy: session.user?.email ?? "unknown",
    triedAt: new Date().toISOString(),
    successes: results.filter((r) => r.ok).map((r) => r.path),
    results,
  };

  return NextResponse.json(summary);
}
