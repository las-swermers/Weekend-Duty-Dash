// Diagnostic route for Phase 0 / Phase 2.
//
// Calls the Orah API with the env-configured key and returns the raw
// responses, so the AOC can confirm which base URL + endpoint paths
// + auth header the LAS Orah tenant actually uses. Auth-gated, read-only.
//
// Usage from a signed-in browser:
//
//   /api/orah/diagnose
//       runs the default battery of probes against ORAH_BASE_URL plus a
//       handful of common Orah host candidates. Useful when nothing is
//       working yet and we need to find the right base URL.
//
//   /api/orah/diagnose?base=https://las.orah.com
//       overrides the base URL for this request only — no redeploy
//       needed. Pair with ?path= to single-shot one URL.
//
//   /api/orah/diagnose?path=/open-api/locations
//       probes a single path with header X-API-Key.
//
//   /api/orah/diagnose?path=/whatever&header=Authorization
//       probes with a custom header. When the header is Authorization,
//       the value is sent as `Bearer <key>`; otherwise the raw key.

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

const ENV_BASE =
  process.env.ORAH_BASE_URL ?? "https://open-api-ireland.orah.com";
const KEY = process.env.ORAH_API_KEY;

interface ProbeResult {
  base: string;
  path: string;
  header: string;
  url: string;
  status: number;
  ok: boolean;
  contentType?: string | null;
  looksHtml?: boolean;
  body?: unknown;
  bodyPreview?: string;
  error?: string;
}

// Common base URLs Orah is known to use. The one provided via
// ORAH_BASE_URL is tried first.
const CANDIDATE_BASES_RAW = [
  ENV_BASE,
  "https://open-api-ireland.orah.com",
  "https://open-api-australia.orah.com",
  "https://open-api-us.orah.com",
  "https://open-api.orah.com",
  "https://api.orah.com",
];

// Common path conventions for boarding-school / SaaS REST APIs.
const CANDIDATE_PATHS = [
  "/",
  "/health",
  "/openapi.json",
  "/swagger.json",
  "/v1/locations",
  "/v2/locations",
  "/api/v1/locations",
  "/open-api/locations",
  "/open-api/v1/locations",
  "/locations",
];

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function safePath(input: string): string | null {
  if (!input.startsWith("/")) return null;
  if (input.includes("..")) return null;
  return input;
}

function safeBase(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname.endsWith(".orah.com")) return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function headerValue(header: string, key: string): string {
  return header.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
}

async function probe(
  base: string,
  path: string,
  header: string,
  key: string,
): Promise<ProbeResult> {
  const url = `${base}${path}`;
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
    const looksHtml =
      !!contentType?.includes("text/html") || text.startsWith("<!DOCTYPE");

    let body: unknown;
    let bodyPreview: string | undefined;
    if (!looksHtml && contentType?.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        bodyPreview = text.slice(0, 500);
      }
    } else {
      bodyPreview = text.slice(0, 200);
    }
    return {
      base,
      path,
      header,
      url,
      status: res.status,
      ok: res.ok,
      contentType,
      looksHtml,
      body,
      bodyPreview,
    };
  } catch (err) {
    return {
      base,
      path,
      header,
      url,
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

  const params = req.nextUrl.searchParams;
  const customBaseRaw = params.get("base");
  const customPath = params.get("path");
  const customHeader = params.get("header") ?? "X-API-Key";

  const overrideBase = customBaseRaw ? safeBase(customBaseRaw) : null;
  if (customBaseRaw && !overrideBase) {
    return NextResponse.json(
      {
        error:
          "base must be an https URL on a *.orah.com host (e.g. https://las.orah.com)",
      },
      { status: 400 },
    );
  }

  // Single-shot mode.
  if (customPath) {
    const path = safePath(customPath);
    if (!path) {
      return NextResponse.json(
        { error: "path must start with / and not contain .." },
        { status: 400 },
      );
    }
    const base = overrideBase ?? ENV_BASE;
    const result = await probe(base, path, customHeader, KEY);
    return NextResponse.json(result);
  }

  // Battery mode. Either probe against a single overridden base, or
  // against the candidate list when nothing's been pinned yet.
  const bases = overrideBase
    ? [overrideBase]
    : unique(CANDIDATE_BASES_RAW).slice(0, 5);

  const results: ProbeResult[] = [];
  for (const base of bases) {
    for (const path of CANDIDATE_PATHS) {
      let r = await probe(base, path, "X-API-Key", KEY);
      if (r.status === 401 || r.status === 403) {
        const alt = await probe(base, path, "Authorization", KEY);
        if (alt.ok || (alt.status && alt.status !== 401)) r = alt;
      }
      results.push(r);
      // Stop probing this base once we get any non-HTML response — likely
      // means we found the API surface for this host.
      if (r.ok || (r.status > 0 && !r.looksHtml)) break;
    }
  }

  const successes = results.filter((r) => r.ok);
  const promising = results.filter(
    (r) => !r.ok && r.status > 0 && !r.looksHtml,
  );

  return NextResponse.json({
    envBase: ENV_BASE,
    sentBy: session.user?.email ?? "unknown",
    triedAt: new Date().toISOString(),
    summary: {
      totalProbed: results.length,
      successes: successes.length,
      promisingNonHtml: promising.length,
    },
    successes,
    promising,
    allResults: results,
    hint:
      successes.length === 0 && promising.length === 0
        ? "Every probe returned an HTML 404 — the base URL almost certainly isn't the API. Check Orah Admin Console → Settings → Open API for the documented base URL, then re-run with ?base=https://your-base"
        : "See `successes` / `promising` for next steps.",
  });
}
