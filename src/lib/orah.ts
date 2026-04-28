// Central Orah API client. The Orah Open API is POST-only RPC under
// /open-api/<resource>/<action>; auth is Authorization: Bearer <key>.
// Confirmed against the LAS tenant 2026-04-28 — see
// docs/orah-discovery.md.

const BASE = process.env.ORAH_BASE_URL ?? "https://open-api-ireland.orah.com";
const KEY = process.env.ORAH_API_KEY;

type CallOptions = {
  // Route segment-level cache. Pass undefined to skip caching.
  revalidate?: number;
};

export class OrahError extends Error {
  constructor(
    public status: number,
    message: string,
    public bodyPreview?: string,
  ) {
    super(message);
    this.name = "OrahError";
  }
}

export async function orahCall<T = unknown>(
  path: string,
  body: unknown = {},
  opts: CallOptions = {},
): Promise<T> {
  if (!KEY) {
    throw new OrahError(500, "ORAH_API_KEY is not configured");
  }
  if (!path.startsWith("/open-api/")) {
    throw new OrahError(500, `path must start with /open-api/, got ${path}`);
  }

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: opts.revalidate === undefined ? "no-store" : undefined,
    next: opts.revalidate === undefined ? undefined : { revalidate: opts.revalidate },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new OrahError(
      res.status,
      `Orah ${path} → ${res.status}`,
      text.slice(0, 300),
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OrahError(
      502,
      `Orah ${path} returned non-JSON`,
      text.slice(0, 300),
    );
  }
}

export function isMockMode(): boolean {
  return process.env.USE_MOCK_DATA === "1";
}
