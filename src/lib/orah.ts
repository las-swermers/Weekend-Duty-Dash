// Central Orah API client. All Orah requests should funnel through this
// module so we have a single place for the auth header, retries, and
// error handling. The exact endpoint shapes and the auth header name
// are confirmed in Phase 0 — see docs/orah-discovery.md.

const BASE = process.env.ORAH_BASE_URL ?? "https://open-api-ireland.orah.com";
const KEY = process.env.ORAH_API_KEY;

type FetchOptions = {
  cache?: RequestCache;
  next?: { revalidate?: number; tags?: string[] };
};

export class OrahError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OrahError";
  }
}

export async function orahFetch<T>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  if (!KEY) {
    throw new OrahError(500, "ORAH_API_KEY is not configured");
  }

  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      // Header name to be confirmed in Phase 0. Orah docs show X-API-Key.
      "X-API-Key": KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: opts.cache,
    next: opts.next,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OrahError(
      res.status,
      `Orah ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  return res.json() as Promise<T>;
}

export function isMockMode(): boolean {
  return process.env.USE_MOCK_DATA === "1";
}
