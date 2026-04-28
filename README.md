# Weekend Duty Dashboard

Single-screen dashboard for LAS Administrators on Call. Lives at the repo
root as a Next.js 14 app deployed on Vercel.

The build spec is in [`WEEKEND_DASHBOARD_SPEC.md`](./WEEKEND_DASHBOARD_SPEC.md);
treat it as the source of truth.

## Status

| Phase | What | Where |
|---|---|---|
| Phase 0 | Manual Orah API discovery | `docs/orah-discovery.md` ⛔ not yet completed |
| Phase 1 | Project skeleton, auth gate, ported visual design | ✅ scaffolded — see `src/` |
| Phase 2 | Orah integration | ⛔ blocked on Phase 0 |
| Phase 3 | Resource launchpad (KV) | ✅ route + UI scaffolded; needs KV provisioned on Vercel |
| Phase 4 | Email snapshot via Resend | ✅ route + template scaffolded; UI dialog pending |
| Phase 5 | Polish | ⏳ |
| Phase 6 | Scheduled email | ⏳ |

## Layout

```
/
├── src/                          # Next.js app (App Router, TypeScript)
│   ├── app/
│   │   ├── (auth)/signin/        # Google sign-in page
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── orah/{health-center,no-pa,travel-requests,scheduled-trips}/
│   │   │   ├── resources/        # KV-backed launchpad CRUD
│   │   │   └── email/            # Resend snapshot
│   │   ├── layout.tsx
│   │   ├── page.tsx              # main dashboard
│   │   └── globals.css           # ported from prototype/styles.css
│   ├── components/dashboard/     # Masthead, AlertSummary, sections, Launchpad, dialog, toast, icons
│   ├── lib/                      # auth, orah client, kv, dates, email, mock, utils
│   ├── types/                    # Orah, Resource
│   └── middleware.ts             # auth gate
├── docs/
│   ├── orah-discovery.md         # Phase 0 template
│   └── runbook.md
├── prototype/                    # original CDN-React/Babel prototype, kept for reference
├── WEEKEND_DASHBOARD_SPEC.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── postcss.config.mjs
└── .env.example
```

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in values
npm run dev
```

`USE_MOCK_DATA=1` (default in `.env.example`) makes the Orah API routes
serve the mock fixtures from `src/lib/mock.ts`. Leave it on until Phase 0
discovery is complete and Phase 2 is wired up.

The visual design is ported verbatim from the prototype — open
`prototype/index.html` directly in a browser to see the original.

## Phase 0 reminder

Phase 2 (Orah integration) is intentionally blocked. Before writing any
real Orah calls:

1. Log into Orah Admin Console with admin privileges.
2. Generate a read-only API key (`weekend-dashboard-prod`).
3. Fill in `docs/orah-discovery.md` — every blank, screenshots welcome.
4. Update the `ORAH_*`, `HEALTH_CENTER_LOCATION_ID`, and
   `NO_PA_RECORD_TYPE_ID` env vars on Vercel.

Until then, do not guess at Orah field names or endpoint shapes — the
spec (§3) is explicit about this.
