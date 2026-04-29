# Runbook

Operational notes for the LAS Weekend Duty Dashboard. Keep this updated as
things change.

## Deploys

- Push to `main` → Vercel auto-deploys.
- Pull requests get preview deploys.
- Roll back: Vercel Dashboard → Deployments → promote previous.

## Local development

```bash
npm install
cp .env.example .env.local      # fill in real values, see notes below
npm run dev
```

Visit `http://localhost:3000`. Without `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` set, the sign-in flow will not work — you can either
configure those (see spec §4.5) or temporarily relax the middleware to
demo the dashboard without auth.

`USE_MOCK_DATA=1` makes the four Orah API routes return the mock data in
`src/lib/mock.ts` instead of calling the real Orah API. This is the
default in `.env.example` — leave it on until Phase 0 / Phase 2 are
complete.

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| All Orah sections show 502 | `ORAH_API_KEY` expired or rotated | Regenerate in Orah Admin Console, update Vercel env, redeploy |
| Sections show 501 | `USE_MOCK_DATA` is unset and Orah integration not yet implemented | Set `USE_MOCK_DATA=1` or finish Phase 2 |
| HC section empty on Friday | `HEALTH_CENTER_LOCATION_ID` is wrong | Re-run discovery, update env var |
| OAuth fails for valid `@las.ch` user | OAuth consent screen is not Internal | Google Cloud Console → OAuth consent → User type: Internal |
| Email goes to spam | Domain not verified in Resend | Add DNS records, wait for verification |
| KV resources list empty | Seed didn't run | `kv set resources:v1 [...]` via Vercel CLI or Storage UI |
| Launchpad shows seed list, not real links | `LAUNCHPAD_SHEET_CSV_URL` is not set or sheet returned non-CSV | Publish sheet to web → CSV, set env var, redeploy |
| Launchpad missing a row | Row missing `name`/`url`/valid `category`, or `url` not https | Fix the row in the sheet — invalid rows are silently skipped |

## Logs

Vercel Dashboard → Project → Logs (last 24 h). For longer retention,
forward to Logtail or similar.

## Secrets rotation (quarterly)

- `ORAH_API_KEY`
- `AUTH_SECRET` (forces all sessions to re-auth)
- `RESEND_API_KEY`

## Orah diagnostic

While Phase 0 is being filled in, sign-in then visit
`/api/orah/diagnose` on the deployed site. It calls a battery of
likely Orah endpoints with the configured `ORAH_API_KEY` and returns
the raw responses, which we paste back into `docs/orah-discovery.md`.

Single-path probing: `/api/orah/diagnose?path=/open-api/locations`.
Custom header: `&header=Authorization` (sent as `Bearer <key>`).

## Phase status

- [x] Phase 1 — project setup & deploy skeleton
- [x] Phase 0 — Orah discovery (auth + base + endpoint surface confirmed; see `docs/orah-discovery.md`)
- [~] Phase 2 — Orah integration (HC live; no-PA / travel / trips still on mock)
- [x] Phase 3 — resource launchpad (Google-Sheet-backed; KV remains as legacy fallback)
- [ ] Phase 4 — email snapshot (route + template exist; UI dialog pending)
- [ ] Phase 5 — polish
- [ ] Phase 6 — scheduled email (optional)

## Wiring the launchpad to a Google Sheet

1. Create a sheet titled e.g. "Weekend Dashboard — Launchpad".
2. First row (headers, lower-case): `name,url,icon,order`.
3. One row per link. `url` must be `https://…`. `icon` is one of:
   `link, book, award, users, bus, clipboard, flag, heart, message,
   phone, calendar, folder, map, key, bell` (anything else falls back
   to `link`). `order` is an optional integer; lower numbers appear
   first.
4. File → Share → Publish to web → Entire document, **CSV** → Publish.
5. Copy the URL it gives you and set `LAUNCHPAD_SHEET_CSV_URL` on Vercel.
6. Redeploy (or wait ~5 min for the cache to roll).

Edits to the sheet propagate within a few minutes. No admin UI in the
app — the sheet is the source of truth.

## Finding the Health Center location id

After deploy, sign in and visit `/api/orah/locations`. The response
lists every Orah location with `id`, `name`, `state`. Find the one
that's the school's HC, copy its `id`, and set the env var on Vercel:

```
HEALTH_CENTER_LOCATION_ID=<id>
```

If the env var isn't set, the app tries to match by name using
`HEALTH_CENTER_LOCATION_NAME` (default "Health Center"). If multiple
locations match or none match, the HC route returns an error
explaining what to do.
