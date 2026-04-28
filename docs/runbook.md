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
- [ ] Phase 0 — Orah discovery (manual; see `docs/orah-discovery.md`)
- [ ] Phase 2 — Orah integration
- [ ] Phase 3 — resource launchpad (KV-backed; route + UI exist, KV needs to be provisioned on Vercel)
- [ ] Phase 4 — email snapshot (route + template exist; UI dialog pending)
- [ ] Phase 5 — polish
- [ ] Phase 6 — scheduled email (optional)
