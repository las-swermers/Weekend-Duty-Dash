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

// Pull anything that looks like an API surface reference out of the
// public Orah docs HTML: full URLs on a *.orah.com host, METHOD /path
// lines, header examples, and section anchors. Cheap regex; we don't
// need to parse the DOM, just find hints to feed back into the probe.
function extractApiHints(html: string): {
  fullUrls: string[];
  pathLines: string[];
  headerHints: string[];
  sectionIds: string[];
} {
  const fullUrls = unique(
    Array.from(
      html.matchAll(/https:\/\/[a-z0-9.\-]+\.orah\.com\/[^\s"'<>)]+/gi),
    ).map((m) => m[0]),
  ).slice(0, 50);

  const pathLines = unique(
    Array.from(
      html.matchAll(
        /(?:^|[\s>"'(])((?:GET|POST|PUT|DELETE|PATCH)\s+\/[A-Za-z0-9_\-\/{}.?=&]+)/g,
      ),
    ).map((m) => m[1]),
  ).slice(0, 100);

  const headerHints = unique(
    Array.from(
      html.matchAll(
        /(?:[xX]-?[aA][pP][iI]-?[kK]ey|[Aa]uthorization:\s*[Bb]earer|[Bb]earer\s+[A-Za-z0-9]+)/g,
      ),
    ).map((m) => m[0]),
  ).slice(0, 20);

  const sectionIds = unique(
    Array.from(
      html.matchAll(/<h[1-4][^>]*\sid=["']([^"']+)["']/gi),
    ).map((m) => m[1]),
  ).slice(0, 80);

  return { fullUrls, pathLines, headerHints, sectionIds };
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
  const docsMode = params.get("docs") === "1";

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

  // Docs-scrape mode. Pulls the public docs page and extracts hints
  // about the real API surface (full URLs, METHOD /path lines, header
  // examples, section IDs). Useful when nothing else has worked.
  if (docsMode) {
    const docsBase = overrideBase ?? ENV_BASE;
    const candidates = [
      `${docsBase}/open-api/`,
      `${docsBase}/open-api`,
      `${docsBase}/docs/`,
      `${docsBase}/docs`,
      `${docsBase}/`,
    ];
    const fetched: Array<{
      url: string;
      status: number;
      length: number;
      hints?: ReturnType<typeof extractApiHints>;
      error?: string;
    }> = [];

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent":
              "Mozilla/5.0 (compatible; LAS-WeekendDashboard/1.0)",
          },
          cache: "no-store",
        });
        const text = await res.text();
        fetched.push({
          url,
          status: res.status,
          length: text.length,
          hints: res.ok ? extractApiHints(text) : undefined,
        });
        if (res.ok && text.length > 1000) break;
      } catch (err) {
        fetched.push({
          url,
          status: 0,
          length: 0,
          error: err instanceof Error ? err.message : "fetch failed",
        });
      }
    }

    return NextResponse.json({
      mode: "docs",
      sentBy: session.user?.email ?? "unknown",
      fetched,
    });
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
