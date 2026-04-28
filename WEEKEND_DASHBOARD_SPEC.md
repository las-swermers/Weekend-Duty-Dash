# LAS Weekend Duty Dashboard — Build Spec

> **Status:** Spec for Claude Code to implement.
> **Owner:** Shayne (LAS).
> **Goal:** A single-screen dashboard the AOC opens Friday afternoon to see live Orah data + one-click access to relevant Google Sheets, with the ability to email a snapshot to the duty team.

---

## 0. Read this first

This document is the source of truth for building the dashboard. Treat it as the primary reference. When ambiguity arises:

1. Prefer the simplest implementation that satisfies the spec.
2. Do not introduce dependencies not listed here without flagging it.
3. If an Orah API response shape doesn't match what's described, surface the mismatch — don't paper over it.
4. The Orah Open API is the riskiest unknown. Phase 0 discovery must happen before Phase 1 code.

The user (Shayne) is a teacher at Leysin American School building this as a side project. He has no CLI on his work machine, develops via GitHub web + Claude Code, and deploys to Vercel. Optimize for clarity, small commits, and ability to debug from the Vercel dashboard.

---

## 1. Product summary

### What it is

A Next.js dashboard hosted on Vercel that:

- Pulls live data from Orah's Open API (Health Center attendance, no-physical-activity flags, travel requests, scheduled trips)
- Displays linked Google Sheets as a clickable launchpad (Commendation List, Saturday Catch-up, Clipboard, Duty Team — and any others the AOC adds)
- Lets the AOC email a snapshot to the duty team
- Authenticates via Google OAuth restricted to `@las.ch` Workspace accounts

### What it isn't (deliberate non-goals for v1)

- Not a database. Linked sheets stay in Google Sheets; the dashboard does not read their contents.
- Not multi-tenant. One school, one Vercel deployment.
- Not a write tool. Read-only against Orah; only writes are to the resource registry.
- Not a workflow engine. No conditional logic across data sources, no automatic flagging across data sources.

### Primary user

The Administrator on Call (AOC) for a given weekend. Initially Shayne; later other staff. The dashboard is opened on a laptop or tablet, not a phone.

---

## 2. Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (AOC)                                                │
│  - Next.js page                                               │
│  - Google OAuth session cookie                                │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼─────────────────────────────────────┐
│  Vercel (Next.js App Router)                                  │
│                                                               │
│  Server components / API routes:                              │
│   - /api/orah/health-center                                   │
│   - /api/orah/no-pa                                           │
│   - /api/orah/travel-requests                                 │
│   - /api/orah/scheduled-trips                                 │
│   - /api/resources (GET, POST, PATCH, DELETE)                 │
│   - /api/email                                                │
│   - /api/auth/[...nextauth]                                   │
│                                                               │
│  Storage:                                                     │
│   - Vercel KV (resource registry)                             │
│   - Env vars (Orah API key, Resend key, NextAuth secret,      │
│     Google OAuth client id/secret)                            │
└────────┬───────────────────────────────────────┬─────────────┘
         │                                       │
┌────────▼─────────────┐               ┌─────────▼─────────────┐
│ Orah Open API        │               │ Resend API            │
│ (open-api-ireland.   │               │ (email delivery)      │
│  orah.com)           │               └───────────────────────┘
└──────────────────────┘
```

### Data flow on page load

1. AOC navigates to `https://[domain]`. NextAuth checks for valid session; if not, redirects to Google OAuth.
2. After auth, page renders shell immediately (no blocking).
3. Four parallel server-side fetches to Orah API routes, each cached at the edge for 60 seconds (configurable per route).
4. One fetch to `/api/resources` for the link launchpad (KV-backed, fast).
5. Each section renders as data arrives — skeleton states while loading.

### Why this stack

| Choice | Reason |
|---|---|
| Next.js 14 App Router | Server components keep API key server-side; route handlers are clean |
| Vercel | User's default, free tier sufficient, native KV |
| Vercel KV | No database setup, persists across deploys, ~50ms reads |
| NextAuth (Auth.js) v5 | Standard Google OAuth with domain restriction in 5 lines |
| Resend | Cleanest API for transactional email, free tier (3k/mo) sufficient |
| Tailwind + shadcn/ui | User's default; copy-paste components, no library lock-in |
| TypeScript | Catches Orah field-name typos which would otherwise be silent |

---

## 3. Phase 0 — Orah API discovery (do this BEFORE writing code)

This is a manual task for Shayne, not for Claude Code. Document the findings in `docs/orah-discovery.md` before Phase 1 begins. **Do not start implementation until this is complete.**

### Steps

1. Log into Orah Admin Console with admin privileges.
2. Navigate to Settings → Open API. If not visible, contact Orah CSM via blue chat bubble to enable it.
3. Generate a read-only API key. Name it `weekend-dashboard-prod`. Save the key to a password manager — you cannot retrieve it later.
4. Open the in-console API documentation. Confirm the base URL is `https://open-api-ireland.orah.com` (Europe data center).

### Information to capture

For each of the following, screenshot or copy the request format and a sample response:

#### Locations endpoint
- Goal: find the `id` of the Health Center location.
- Action: list all locations, find the one named "Health Center" (or whatever LAS uses — could be "Infirmary," "Wellness Center," "Nurse's Office").
- Capture: that location's `id`. This is a constant; store it later as `HEALTH_CENTER_LOCATION_ID` env var.

#### Location Records endpoint
- Goal: pull "who was in the HC on a given Friday."
- Confirm: can you filter by `location_id` AND date range?
- Capture: exact query parameter names, response shape, pagination behavior.
- Edge case to test: a student who entered HC on Friday morning and left Saturday — does this show in a "Friday" query?

#### Pastoral Records endpoint
- Goal: find "no physical activity" flags.
- Action: ask the school nurse / health office where they record this. It might be:
  - A pastoral record with a specific `category` or `tag`
  - A custom integration field on the student profile
  - A note in a structured medical field
- Capture: the exact way LAS encodes "no PA" so we can filter for it. **This is the discovery that most likely needs human input.**

#### Leave / travel requests endpoint
- Goal: list open and approved travel requests for the upcoming weekend.
- Note: this endpoint isn't in the public help-center summary but exists in the in-console docs (Orah is built around leave management).
- Capture: status values (`pending`, `approved`, `denied`?), date filtering, response shape.

#### Scheduled trips
- Possibility A: Orah has an "Activities" or "Events" module — preferred.
- Possibility B: trips are entered as pre-approved leave requests with a category — fall back to filtering travel requests.
- Capture: which it is at LAS.

#### Students endpoint
- Goal: enrich data with student name + dorm (house) for grouping.
- Capture: response includes `house` / `dorm` field? If not, need separate Houses endpoint join.

### Open questions for the school

These need answers from humans, not docs:

1. Which "location" in Orah is the Health Center? (Exact name + id)
2. How is "no physical activity" recorded? (Pastoral record category? Tag? Custom field?)
3. What does LAS call "clipboard" in Orah, and is it tracked there or only on paper?
4. Are weekend activity trips tracked in Orah or only in the Google Sheet?
5. Who is the Orah admin who can grant API access?

### Discovery deliverable

`docs/orah-discovery.md` should contain:
- Confirmed base URL and auth header format
- For each endpoint: request format, response sample (sanitized), notable field names
- The four constants needed for env vars: `HEALTH_CENTER_LOCATION_ID`, `NO_PA_RECORD_TYPE_ID` (or equivalent), and the date math for "this weekend"
- Any deviations from this spec — explicitly called out

---

## 4. Phase 1 — Project setup & deploy skeleton

### Goal

A deployed Next.js app on Vercel, with Google OAuth working, showing a placeholder dashboard for `@las.ch` users only.

### Steps

#### 4.1 Create repository

```bash
npx create-next-app@latest weekend-dashboard \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint
```

Push to GitHub. Repo name: `weekend-dashboard`. Visibility: private.

#### 4.2 Install dependencies

```bash
npm install next-auth@beta @auth/core
npm install @vercel/kv
npm install resend
npm install lucide-react
npm install -D @types/node
```

shadcn/ui setup:

```bash
npx shadcn@latest init
# Choose: New York style, Slate base color, CSS variables: yes
npx shadcn@latest add button card dialog input label select badge skeleton toast
```

#### 4.3 Project structure

```
weekend-dashboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── orah/
│   │   │   │   ├── health-center/route.ts
│   │   │   │   ├── no-pa/route.ts
│   │   │   │   ├── travel-requests/route.ts
│   │   │   │   └── scheduled-trips/route.ts
│   │   │   ├── resources/route.ts
│   │   │   └── email/route.ts
│   │   ├── (auth)/
│   │   │   └── signin/page.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx              # main dashboard
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                   # shadcn components
│   │   ├── dashboard/
│   │   │   ├── alert-summary.tsx
│   │   │   ├── orah-section.tsx
│   │   │   ├── student-list.tsx
│   │   │   ├── resource-launchpad.tsx
│   │   │   ├── add-resource-dialog.tsx
│   │   │   └── email-dialog.tsx
│   │   └── providers.tsx
│   ├── lib/
│   │   ├── auth.ts               # NextAuth config
│   │   ├── orah.ts               # Orah API client
│   │   ├── kv.ts                 # KV helpers
│   │   ├── dates.ts              # weekend date math
│   │   ├── email.ts              # Resend wrapper + templates
│   │   └── utils.ts              # cn() helper from shadcn
│   ├── types/
│   │   ├── orah.ts               # API response types
│   │   └── resource.ts           # link registry types
│   └── middleware.ts             # auth gate
├── docs/
│   ├── orah-discovery.md         # filled in Phase 0
│   └── runbook.md                # ops notes
├── .env.example
├── .env.local                    # gitignored
├── README.md
└── package.json
```

#### 4.4 Environment variables

Create `.env.example` (committed) and `.env.local` (gitignored). On Vercel, add the same variables in Project Settings → Environment Variables.

```bash
# .env.example
# ---- Orah ----
ORAH_API_KEY=
ORAH_BASE_URL=https://open-api-ireland.orah.com
HEALTH_CENTER_LOCATION_ID=
# Add other constants discovered in Phase 0:
NO_PA_RECORD_TYPE_ID=

# ---- NextAuth / Google OAuth ----
AUTH_SECRET=                     # generate via: openssl rand -base64 32
AUTH_URL=https://your-domain.vercel.app
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_DOMAIN=las.ch

# ---- Vercel KV (auto-injected when KV is provisioned) ----
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
KV_URL=

# ---- Resend ----
RESEND_API_KEY=
EMAIL_FROM=dashboard@las.ch      # must be verified in Resend
```

#### 4.5 Google OAuth setup

In Google Cloud Console (Shayne does this):

1. Create or select a project named `LAS Weekend Dashboard`.
2. APIs & Services → OAuth consent screen.
   - User type: **Internal** (this is the key setting — restricts to `las.ch` Workspace).
   - App name: `LAS Weekend Dashboard`.
   - Support email: Shayne's address.
   - No scopes beyond default.
3. APIs & Services → Credentials → Create Credentials → OAuth Client ID.
   - Application type: Web application.
   - Authorized JavaScript origins: `https://[your-vercel-domain]`, `http://localhost:3000`.
   - Authorized redirect URIs: `https://[your-vercel-domain]/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`.
4. Copy Client ID and Client Secret into `.env.local` and Vercel env vars.

#### 4.6 NextAuth configuration

`src/lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Belt-and-braces: even though OAuth consent is Internal, double-check email domain.
      const allowedDomain = process.env.ALLOWED_DOMAIN ?? "las.ch";
      const email = profile?.email ?? "";
      return email.endsWith(`@${allowedDomain}`);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

`src/middleware.ts`:

```typescript
import { auth } from "@/lib/auth";

export default auth((req) => {
  if (!req.auth && !req.nextUrl.pathname.startsWith("/signin")) {
    const signInUrl = new URL("/signin", req.url);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon).*)"],
};
```

#### 4.7 Sign-in page

`src/app/(auth)/signin/page.tsx`: simple page with a "Sign in with Google" button calling `signIn("google")`. No fancy styling — this is internal.

#### 4.8 Vercel deploy

1. Connect GitHub repo to Vercel.
2. Add all env vars from `.env.example` with real values.
3. Provision Vercel KV: Storage tab → Create → KV → connect to project. KV env vars auto-inject.
4. First deploy. Verify auth gate works: signed-out users redirect to sign-in; non-`@las.ch` accounts get rejected.

### Phase 1 done when

- App is live on Vercel
- Visiting the URL while signed out redirects to Google OAuth
- Signing in with `@las.ch` account succeeds and shows a placeholder dashboard
- Signing in with any other account is rejected
- All env vars set, no warnings in Vercel logs

---

## 5. Phase 2 — Orah integration

### Goal

Live Orah data displayed in four sections on the dashboard.

### 5.1 Orah API client

`src/lib/orah.ts` — central client. All Orah requests go through this. Reasons:

- Single place for the auth header
- Single place for retries / error handling
- Single place to swap in a mock for local dev

```typescript
const BASE = process.env.ORAH_BASE_URL!;
const KEY = process.env.ORAH_API_KEY!;

type FetchOptions = {
  cache?: RequestCache;
  next?: { revalidate?: number };
};

export async function orahFetch<T>(
  path: string,
  opts: FetchOptions = {}
): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": KEY,                    // CONFIRM exact header name in Phase 0
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: opts.cache,
    next: opts.next,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OrahError(res.status, `Orah ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export class OrahError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "OrahError";
  }
}
```

> **Gotcha:** The auth header name must be confirmed in Phase 0. The Orah docs show `X-API-Key` but verify in your console.

### 5.2 Date helpers

`src/lib/dates.ts`:

```typescript
import { TZDate } from "@date-fns/tz";

const TZ = "Europe/Zurich";

/**
 * "This weekend" = Friday 00:00 Europe/Zurich through Sunday 23:59.
 * If today is Sat/Sun, returns the current weekend.
 * If today is Mon-Thu, returns the upcoming weekend.
 */
export function currentWeekendRange(now = new Date()): { start: Date; end: Date } {
  const local = new TZDate(now, TZ);
  const day = local.getDay(); // 0 Sun, 5 Fri, 6 Sat
  const friday = new TZDate(local, TZ);
  if (day === 0) {
    // Sunday: this weekend started 2 days ago
    friday.setDate(local.getDate() - 2);
  } else if (day === 6) {
    // Saturday
    friday.setDate(local.getDate() - 1);
  } else if (day === 5) {
    // Friday
    // friday is today
  } else {
    // Mon-Thu: next Friday
    friday.setDate(local.getDate() + (5 - day));
  }
  friday.setHours(0, 0, 0, 0);
  const sunday = new TZDate(friday, TZ);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  return { start: friday, end: sunday };
}

export function fridayOfCurrentWeekend(now = new Date()): { start: Date; end: Date } {
  const { start } = currentWeekendRange(now);
  const end = new TZDate(start, TZ);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
```

> **Gotcha:** Always do date math in `Europe/Zurich`. Vercel runs in UTC. A Friday-night HC entry at 23:00 Zurich is Saturday 22:00 UTC — naive UTC math will miss it.

Install: `npm install @date-fns/tz date-fns`

### 5.3 API routes

Each route is thin: validate (none needed for read-only same-user), call Orah client, transform to UI shape, return JSON.

`src/app/api/orah/health-center/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { orahFetch } from "@/lib/orah";
import { fridayOfCurrentWeekend } from "@/lib/dates";
import type { LocationRecord } from "@/types/orah";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { start, end } = fridayOfCurrentWeekend();
  const locationId = process.env.HEALTH_CENTER_LOCATION_ID!;

  // CONFIRM endpoint path + query params in Phase 0.
  const path = `/open-api/location-records?location_id=${locationId}&from=${start.toISOString()}&to=${end.toISOString()}`;

  try {
    const data = await orahFetch<{ data: LocationRecord[] }>(path, {
      next: { revalidate: 60 },
    });

    // Dedupe: a student may have multiple records (in/out cycles). Show each unique student once.
    const seen = new Map<number, LocationRecord>();
    for (const rec of data.data) {
      if (!seen.has(rec.student.id)) seen.set(rec.student.id, rec);
    }

    return NextResponse.json({
      students: Array.from(seen.values()),
      pulledAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
```

Repeat the same pattern for the other three routes:

- `/api/orah/no-pa` — pastoral records filtered by the "no PA" type discovered in Phase 0
- `/api/orah/travel-requests` — leave requests in current weekend window with status `pending` or `approved`
- `/api/orah/scheduled-trips` — depends on Phase 0 finding (separate endpoint or filtered leave requests)

### 5.4 Types

`src/types/orah.ts`:

```typescript
export interface OrahStudent {
  id: number;
  sis_id: string | null;
  first_name?: string;
  last_name?: string;
  house?: { id: number; name: string };
}

export interface LocationRecord {
  model: "location_record";
  id: number;
  type: "in" | "out";
  record_time: string;        // ISO 8601
  location: { id: number; name: string };
  student: OrahStudent;
  created_at: string;
  updated_at: string;
}

// PastoralRecord, LeaveRequest, ScheduledTrip — define after Phase 0 confirms shape.
```

### 5.5 Dashboard sections

`src/components/dashboard/orah-section.tsx`:

Generic section wrapper used four times:

```typescript
type Props = {
  title: string;
  endpoint: string;
  emptyMessage: string;
  renderItem: (item: any) => ReactNode;
};
```

Fetches client-side via SWR or React Query, shows skeleton while loading, error state on failure, empty state on no data, otherwise the list.

> **Recommend:** Use `swr` for client fetching. Smaller and simpler than React Query for this use case.

```bash
npm install swr
```

### 5.6 Alert summary

`src/components/dashboard/alert-summary.tsx`:

A row of count cards at the top of the page:

```
[ 3 in HC Friday ]  [ 8 open travel ]  [ 2 on clipboard ]  [ 5 no-PA ]
```

Each card is colored by severity:
- 0 items: gray, muted
- 1-2 items: amber
- 3+ items: coral

Clicking a card scrolls to the corresponding section.

### Phase 2 done when

- All four sections render real Orah data for the current weekend
- Each section has loading, error, and empty states
- Manual refresh button at top of page invalidates cache and re-fetches all four
- Data freshness label visible (e.g., "Updated 2m ago")

---

## 6. Phase 3 — Resource launchpad

### Goal

A configurable grid of buttons linking to Google Sheets. JSON-file-backed for v0, KV-backed for v1.

### 6.1 Resource type

`src/types/resource.ts`:

```typescript
export interface Resource {
  id: string;                  // slug, e.g. "commendation-list"
  name: string;                // "Commendation List"
  url: string;                 // full https URL
  icon: string;                // lucide icon name, e.g. "award"
  category: ResourceCategory;
  addedBy: string;             // email
  addedAt: string;             // ISO
  order: number;               // for sorting
}

export type ResourceCategory =
  | "Reference"
  | "Logistics"
  | "Health & Wellbeing"
  | "Discipline & Accountability"
  | "Communications"
  | "Activities"
  | "Admin";

export const CATEGORIES: ResourceCategory[] = [
  "Reference",
  "Logistics",
  "Health & Wellbeing",
  "Discipline & Accountability",
  "Communications",
  "Activities",
  "Admin",
];
```

### 6.2 Initial seed

`config/resources.seed.json`:

```json
[
  {
    "id": "commendation-list",
    "name": "Commendation List",
    "url": "https://docs.google.com/spreadsheets/d/REPLACE_ME/edit",
    "icon": "award",
    "category": "Reference",
    "addedBy": "system",
    "addedAt": "2026-04-28T00:00:00Z",
    "order": 0
  },
  {
    "id": "saturday-catchup",
    "name": "Saturday Catch-up",
    "url": "https://docs.google.com/spreadsheets/d/REPLACE_ME/edit",
    "icon": "book-open",
    "category": "Reference",
    "addedBy": "system",
    "addedAt": "2026-04-28T00:00:00Z",
    "order": 1
  },
  {
    "id": "clipboard",
    "name": "Clipboard",
    "url": "https://docs.google.com/spreadsheets/d/REPLACE_ME/edit",
    "icon": "clipboard",
    "category": "Discipline & Accountability",
    "addedBy": "system",
    "addedAt": "2026-04-28T00:00:00Z",
    "order": 2
  },
  {
    "id": "duty-team",
    "name": "Duty Team",
    "url": "https://docs.google.com/spreadsheets/d/REPLACE_ME/edit",
    "icon": "users",
    "category": "Logistics",
    "addedBy": "system",
    "addedAt": "2026-04-28T00:00:00Z",
    "order": 3
  }
]
```

### 6.3 KV-backed storage

`src/lib/kv.ts`:

```typescript
import { kv } from "@vercel/kv";
import type { Resource } from "@/types/resource";
import seed from "../../config/resources.seed.json";

const KEY = "resources:v1";

export async function getResources(): Promise<Resource[]> {
  const data = await kv.get<Resource[]>(KEY);
  if (!data) {
    // Seed on first run
    await kv.set(KEY, seed);
    return seed as Resource[];
  }
  return data.sort((a, b) => a.order - b.order);
}

export async function addResource(input: Omit<Resource, "id" | "addedAt" | "order">): Promise<Resource> {
  const all = await getResources();
  const newResource: Resource = {
    ...input,
    id: slugify(input.name),
    addedAt: new Date().toISOString(),
    order: all.length,
  };
  await kv.set(KEY, [...all, newResource]);
  return newResource;
}

export async function updateResource(id: string, patch: Partial<Resource>): Promise<void> {
  const all = await getResources();
  const updated = all.map((r) => (r.id === id ? { ...r, ...patch } : r));
  await kv.set(KEY, updated);
}

export async function deleteResource(id: string): Promise<void> {
  const all = await getResources();
  await kv.set(KEY, all.filter((r) => r.id !== id));
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
```

> **Gotcha:** The KV seed-on-first-run pattern means the first user to load after a fresh deploy triggers the seed. This is fine for a single-user tool but would be a race condition at scale. Don't worry about it here.

### 6.4 API route

`src/app/api/resources/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getResources, addResource, updateResource, deleteResource } from "@/lib/kv";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const resources = await getResources();
  return NextResponse.json({ resources });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // Minimal validation
  if (!body.name || !body.url || !body.category) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!body.url.startsWith("https://")) {
    return NextResponse.json({ error: "URL must be https" }, { status: 400 });
  }

  const created = await addResource({
    name: body.name,
    url: body.url,
    icon: body.icon ?? "link",
    category: body.category,
    addedBy: session.user.email,
  });

  return NextResponse.json({ resource: created });
}

// PATCH and DELETE follow the same pattern.
```

### 6.5 Launchpad UI

`src/components/dashboard/resource-launchpad.tsx`:

- Group resources by category
- Each resource as a card: icon + name, opens `url` in new tab
- "+ Add resource" button at the end of each category, plus a category-agnostic one
- Empty categories are hidden

`src/components/dashboard/add-resource-dialog.tsx`:

- shadcn `Dialog` with form: Name, URL, Icon (dropdown of common lucide icons), Category (dropdown)
- Submit calls `POST /api/resources`, refreshes list

> **Gotcha:** Use `target="_blank" rel="noopener noreferrer"` on every external link. Without `rel`, the new tab can navigate the parent.

### Phase 3 done when

- Launchpad renders below Orah sections
- Initial four resources visible from seed
- AOC can add a resource via dialog and see it appear immediately
- AOC can delete a resource (with confirm)
- Resources persist across deploys (KV)

---

## 7. Phase 4 — Email snapshot

### Goal

A "Email duty team" button that sends the current dashboard state as an HTML email.

### 7.1 Resend setup

1. Sign up for Resend with `dashboard@las.ch` or similar.
2. Add and verify the domain (DNS records).
3. Generate API key. Store as `RESEND_API_KEY`.
4. Set `EMAIL_FROM=dashboard@las.ch` in env.

> **Gotcha:** If the school IT can't add DNS records for `las.ch`, fall back to Resend's `onboarding@resend.dev` sender for testing — but production email must come from a `@las.ch` address or it'll go to spam.

### 7.2 Email template

`src/lib/email.ts`:

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface SnapshotData {
  weekendOf: string;            // "May 9-11, 2026"
  healthCenter: { name: string; dorm?: string }[];
  noPa: { name: string; dorm?: string }[];
  travelRequests: { name: string; dorm?: string; status: string }[];
  scheduledTrips: { name: string; dorm?: string; trip: string }[];
  resources: { name: string; url: string; category: string }[];
  dashboardUrl: string;
  sentBy: string;
}

export async function sendSnapshot(
  to: string[],
  data: SnapshotData
): Promise<void> {
  const html = renderSnapshotHtml(data);
  const text = renderSnapshotText(data);

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: `Weekend Duty Snapshot — ${data.weekendOf}`,
    html,
    text,
  });
}

function renderSnapshotHtml(d: SnapshotData): string {
  // Simple table-based HTML — email clients are picky.
  // Sections: header, four data sections, resource links, footer with link back.
  // Keep CSS inline. No web fonts.
  // ...
}

function renderSnapshotText(d: SnapshotData): string {
  // Plain-text fallback for clients that don't render HTML.
}
```

### 7.3 Email API route

`src/app/api/email/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendSnapshot } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const recipients = (body.recipients as string[]).filter((e) => e.endsWith("@las.ch"));
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No valid @las.ch recipients" }, { status: 400 });
  }

  await sendSnapshot(recipients, {
    ...body.snapshot,
    sentBy: session.user.email,
  });

  return NextResponse.json({ ok: true });
}
```

> **Gotcha:** Force `@las.ch` recipients only. This dashboard contains student data — emailing to a personal Gmail by typo is a privacy incident.

### 7.4 Email dialog UI

`src/components/dashboard/email-dialog.tsx`:

- Triggered by a button in the dashboard header
- Modal with: textarea for recipient emails (one per line, comma-separated, or both), preview of what will be sent, send button
- On send, gathers current dashboard state from the same SWR cache used by the page
- Toast on success/failure

### Phase 4 done when

- AOC can click "Email duty team," paste recipients, send
- Recipients receive an HTML email with all four data sections + resource links + a link back to the dashboard
- Non-`@las.ch` addresses are rejected client-side AND server-side

---

## 8. Phase 5 — Polish

### 8.1 Auto-refresh and freshness

- SWR `refreshInterval: 60_000` on each section
- Show "Updated 30s ago" timestamp under each section
- Manual refresh button forces revalidation

### 8.2 Reorder resources

- Drag-and-drop within categories using `@dnd-kit/core`
- On drop, PATCH each affected resource's `order` field

### 8.3 Soft delete

- Replace hard-delete with `archived: true` field
- Add an "Archived" view in the resource manager so AOC can restore

### 8.4 Audit log

- KV key `audit:v1` — append-only array of `{ when, who, action, target }`
- Surface last 20 entries in a collapsible section at the bottom of the dashboard
- Helps when "who deleted the duty team link" comes up

### 8.5 Mobile / tablet layout

- Test at 768px and 1024px widths (typical staff iPad)
- Stack sections vertically on narrow viewports
- Resource grid: 2 columns on mobile, 4 on tablet, 6 on desktop

---

## 9. Phase 6 — Scheduled email (optional)

### 9.1 Vercel Cron

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/friday-snapshot",
      "schedule": "0 16 * * 5"
    }
  ]
}
```

> **Gotcha:** Vercel Cron schedules are UTC. `0 16 * * 5` = Friday 16:00 UTC = Friday 17:00 or 18:00 Europe/Zurich depending on DST. Adjust accordingly, or compute the correct UTC hour for the desired Zurich time.

### 9.2 Cron route

`src/app/api/cron/friday-snapshot/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { sendSnapshot } from "@/lib/email";
// ... gather snapshot, send to a hardcoded list (env var FRIDAY_RECIPIENTS) or read from KV ...

export async function GET(req: Request) {
  // Vercel Cron sends a header to verify the request comes from Vercel.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ...
  return NextResponse.json({ ok: true });
}
```

### 9.3 Recipient management

A `config/cron-recipients.json` or KV-backed list of addresses that always get the Friday snapshot. AOC can edit via a settings page.

---

## 10. Operations runbook

`docs/runbook.md` — keep this updated as things change.

### Deploys

- Push to `main` → Vercel auto-deploys
- Preview deploys for PRs
- To roll back: Vercel Dashboard → Deployments → promote previous

### Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| All Orah sections show 502 | API key expired or rotated | Regenerate in Orah Admin Console, update env var, redeploy |
| HC section empty on Friday | `HEALTH_CENTER_LOCATION_ID` is wrong | Re-run discovery, update env var |
| OAuth fails for valid `@las.ch` user | OAuth consent screen not Internal | Google Cloud Console → OAuth consent → set User type to Internal |
| Email goes to spam | Domain not verified in Resend | Add DNS records, wait for verification |
| "Updated never" stuck | SWR mutate not firing | Check browser console for fetch errors |
| KV resources list empty | Seed didn't run | Manually `kv set resources:v1 [...]` via Vercel CLI or Storage UI |

### Logs

- Vercel Dashboard → Project → Logs (last 24h)
- For longer retention, integrate with Logtail or similar later

### Secrets rotation

Quarterly:
- Rotate `ORAH_API_KEY`
- Rotate `AUTH_SECRET` (forces all sessions to re-auth)
- Rotate `RESEND_API_KEY`

---

## 11. Testing checklist

Before each deploy that touches user-facing logic, verify:

**Auth**
- [ ] Signed-out user redirects to sign-in
- [ ] Non-`@las.ch` Google account is rejected
- [ ] `@las.ch` account succeeds and lands on dashboard

**Orah data**
- [ ] HC section shows current Friday's residents
- [ ] No-PA section shows students with the correct flag
- [ ] Travel requests shows pending + approved for the current weekend window
- [ ] Scheduled trips matches what's in Orah
- [ ] Empty states render when a section has no data
- [ ] Error state renders when Orah is down (kill the API key temporarily to test)

**Resources**
- [ ] Initial four resources render
- [ ] Add new resource via dialog
- [ ] Edit a resource (icon, name, category)
- [ ] Delete a resource (with confirm)
- [ ] Reorder via drag-and-drop
- [ ] All clicks open in new tab

**Email**
- [ ] Send to single `@las.ch` address — receives email
- [ ] Send to multiple addresses
- [ ] Reject `gmail.com` recipient
- [ ] HTML renders in Gmail, Outlook, iOS Mail
- [ ] Plain-text fallback present and readable

**Cron (Phase 6)**
- [ ] Manually trigger via curl with `CRON_SECRET` — succeeds
- [ ] Without secret — 401
- [ ] Friday at scheduled time — email arrives

---

## 12. Out-of-scope / future ideas

Don't build these in v1, but note them so they're not lost:

- **Cross-data flagging**: "Marie is in HC AND has open travel" surfaces as a single alert. Requires identity resolution across Orah records.
- **Sheet contents in dashboard**: read commendation list directly via Google Sheets API and join with Orah. Requires service account → IT ticket.
- **Notification rules**: AOC sets a rule like "if more than 5 students in HC on a Friday, Slack me." Requires rules engine.
- **Multi-school**: deploy template for other Swiss boarding schools (Swiss School Guide adjacency).
- **History**: weekend snapshots archived for end-of-term review.
- **PDF export**: render dashboard as PDF for the duty handover packet.

---

## 13. Repository conventions

### Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- One concern per commit
- Always run `npm run build` locally before pushing

### Branches

- `main` — production
- Feature branches: `feat/`, `fix/`, `chore/`
- PR with at least Shayne's review (self-review counts) before merge

### Code style

- Prettier defaults
- No `any` in function signatures (use `unknown` and narrow)
- Server-only env vars never imported in client components
- Every API route checks `auth()` first, returns 401 if no session

### Files NOT to commit

- `.env.local`
- Anything in `/tmp/` or `/scratch/`
- API responses with real student names (use `*.fixture.json` with anonymized data for tests)

---

## 14. Glossary

| Term | Meaning |
|---|---|
| AOC | Administrator on Call — the staff member responsible for the school over a given weekend |
| HC | Health Center — the on-campus infirmary |
| No PA | No Physical Activity — a medical restriction flag |
| Clipboard | LAS-specific term for students under hourly check-in (typically a discipline measure) |
| Catch-up | Saturday morning academic remediation session |
| Dorm / House | Boarding house residence at LAS — students grouped by dorm |
| Orah | The boarding school management platform LAS uses |
| Open API | Orah's public REST API for external integrations |

---

## 15. Quick start for Claude Code

If you're picking this up cold:

1. Read sections 1, 2, and 3 to understand the goal.
2. Verify Phase 0 discovery is complete — `docs/orah-discovery.md` should exist and be filled in. If not, stop and ask Shayne to do it.
3. Confirm env vars are set (locally and on Vercel).
4. Work through phases 1 → 2 → 3 → 4 → 5 in order. Each phase has a clear "done when" — don't move on until those are met.
5. Commit after each "done when" milestone.
6. When uncertain about an Orah API field name or shape, check `docs/orah-discovery.md` first; ask Shayne second; never guess.

---

*End of spec.*
