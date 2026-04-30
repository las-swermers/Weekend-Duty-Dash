// Shared service-account JWT helper. Signs a JWT with the SA's private
// key, exchanges it for an access token scoped to the requested API.
// Used by clipboard-sheet (Sheets API) and google-calendar (Calendar API).

const SVC_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SVC_KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

export function hasServiceAccount(): boolean {
  return Boolean(SVC_EMAIL && SVC_KEY_RAW);
}

function svcKey(): string {
  return (SVC_KEY_RAW ?? "").replace(/\\n/g, "\n");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(Buffer.from(body, "base64")).buffer;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function fetchAccessToken(scope: string): Promise<string> {
  if (!hasServiceAccount()) {
    throw new Error("Google service account env vars not configured");
  }
  const cached = tokenCache.get(scope);
  // Refresh 60s before actual expiry to avoid edge cases.
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: SVC_EMAIL,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(svcKey()),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const sig = Buffer.from(sigBuf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Google token exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache.set(scope, {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return json.access_token;
}
