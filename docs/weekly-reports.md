# Weekly dorm reports

Site operators manage `/admin/reports`. A **Report admin** link appears in Live,
Weekend and Analytics for explicitly allowlisted admins. Each subscription has
one Orah dorm (stored by ID), up to 25 school recipients, a delivery weekday,
and independent warnings / analytics switches. Multiple subscriptions can
serve different audiences for the same dorm. New subscriptions are paused.

## Production setup

1. Set `REPORTS_ADMIN_EMAILS` to the site operator's school login (for example,
   `swermers@las.ch`). An empty list grants nobody access. This is separate
   from the existing analytics and warnings viewer allowlists.
2. Connect Redis using `KV_REST_API_URL` and `KV_REST_API_TOKEN`, the existing
   application storage interface. Settings, snapshots and send receipts must
   be durable; there is no memory-only fallback.
3. Set `RESEND_API_KEY`, a verified `EMAIL_FROM`, and the production
   `NEXT_PUBLIC_SITE_URL`. This last value must be HTTPS.
4. Set a random `CRON_SECRET` of at least 32 characters. Only the exact
   `/api/cron/weekly-reports` endpoint bypasses the session middleware; it
   independently requires the bearer secret. Other routes retain session auth.
5. For warnings, configure `WARNINGS_SHEET_ID` and the Google service account.
   Ensure the `Conversations` tab exists with the documented header (an empty
   initialized tab is valid). Reports stop if this sheet cannot be read.
   Set `WARNINGS_TERM_START` to the real term start rather than relying on the
   default rolling 120-day window.
6. Open Report admin, add Savoy, enter recipients and choose sections. Save
   paused, generate a preview, and inspect the counts and printable report.
7. Set `REPORTS_EMAIL_ENABLED=1` in the **production** environment, redeploy,
   and use **Send test to me**. Tests go only to the signed-in admin, never
   the subscription's recipients. Validate actual inbox receipt and links.
8. Enable and save the subscription. Repeat for other dorms/audiences.

No live email was sent during automated validation. Orah, Google Sheets,
Redis and Resend integration must be smoke-tested with the production account.
The feature uses the app's existing service integrations, not a ChatGPT task.

## Scheduling and report windows

`vercel.json` runs one daily check at **06:00 UTC** (07:00 winter / 08:00 summer
in Switzerland). The selected weekday is evaluated in Europe/Zurich. Daily
scheduling works on Vercel Hobby; that plan may invoke anywhere within the
hour. This is not a guarantee of an exact local minute.

Every subscription reports the **previous completed Monday–Sunday week**.
Monday is the default/recommended delivery day. A Friday subscription still
reports the previous completed week, not the current partial week. The UI
states this explicitly. Preview/test dates must be a real completed Monday.
DST boundaries use calendar weeks in Europe/Zurich.

Warnings include new warnings that week and overdue students from earlier
weeks within the configured term window, even when they have no new warning.
Levels and conversations are evaluated at the selected week's end. Later
conversations do not count in that historical report. The ordinary live
warnings tab keeps its existing live evaluation behavior.

Reports are frozen on generation. A retry reuses that snapshot and the exact
email payload. Editing a subscription cancels any unconfirmed deliveries from
its previous configuration; the next weekly report uses the new settings.
The conversation sheet is editable, not an immutable event history, so an edit
to an old conversation can affect newly generated historical previews. A
previously generated snapshot does not change.

## Analytics meaning

- Core: warning categories, 1/2-hour early check-in, weekend infraction
  categories and the configured no-physical-activity category.
- Broader overview: all **non-sensitive** pastoral categories returned by the
  already-confirmed pastoral timeline endpoint. This includes positive
  categories when Orah has them; the total is labeled *pastoral records*,
  not *infractions*.
- Charts: category counts, seven local days, and eight completed weekly totals.
- Rest / health center: recorded `in`/`out` events in configured HC and rest
  locations, plus check-in count and distinct students checking in. The full
  printable report lists student, local time, location and event type.
- These are movement records, not diagnoses or confirmed rest durations.
  Students resting continuously without an event in the selected week are not
  inferred from absence of data. A zero means no matching records returned.
- Current Orah roster dorm assignments determine attribution, including in
  historical trends. Counts are raw and not normalized by dorm size.
- Sensitive pastoral records and clinical narrative are excluded from analytics.
  No new unverified API surface (attendance rolls, leave listings, etc.) is used.
  Extending into those domains requires confirming endpoint shape and coverage.

All timeline pages are read. Missing response data, overlapping pagination,
empty student rosters and full pages at the safety cap fail the report rather
than sending partial totals. Shared timeline pagination now follows the
repo's confirmed top-level `page_size` / `page_index` convention.

## Delivery, access and recovery

Each recipient receives a separate email (recipient addresses are not shared).
The email contains a compact summary and charts. Its school-sign-in link opens
the full print-ready HTML report; browser Print can save a PDF. This release
does not attach a PDF. Links return to the requested report after sign-in.

Only report admins and recipients who were in the frozen run **and remain on
that subscription** may open a report. Removing recipients or deleting the
subscription revokes their web access, but cannot retract emailed content.
Snapshots, email bodies and per-recipient status expire after 90 days.

Sending requires both the global email switch and an enabled subscription;
Vercel preview deployments never send. Test sends require the switch but may
use a paused subscription. Access checks run on every admin mutation, and
mutations reject cross-origin browser requests.

Redis locks prevent concurrent runs, and subscription/week IDs prevent a
second scheduled report. Each recipient has a provider idempotency key and a
persisted send intent before the provider call. A successful provider receipt
is stored immediately. **Accepted** means provider acceptance, not inbox
receipt. Generation failures appear in Recent report activity and can be
retried after correcting the source issue. Cron failures also return HTTP 503
and should be monitored in Vercel; Vercel does not automatically retry them.

Use **Retry unconfirmed** within 23 hours of the first attempt. After that,
an uncertain delivery requires operator review in Resend; the app will not
blindly resend beyond the provider's 24-hour deduplication window. Do not clear
receipts to force delivery without checking whether the email already arrived.
Subscriptions changed after generation cancel unconfirmed sends. High volume
may exceed the function's execution budget; skipped subscriptions are recorded
for admin retry. Start with Savoy and monitor runtime before scaling.

## Verification

`npm test` covers admin checks, recipient/domain validation, school-only report
access and revocation, duplicate sends and ambiguous retry windows, dorm
isolation, sensitive exclusions, date cutoffs/DST, carry-forward warnings,
pagination completeness and HTML escaping. `npm run build` checks all routes
and TypeScript. Browser checks use fictional data and test sessions locally.

The accompanying **All dorms** fix removes the first-dorm fallback from Live
and Weekend: an empty multi-selection now resolves to every available dorm,
including new dorms after a data refresh. Individual selections stay filtered.

## Dorm insights extension

See [Dorm insights](dorm-analytics.md) for watchlist collection and consequence KPIs.
Analytics reports now add bounded time-to-serve metrics when tracking is available,
and paired rest interval totals. These use the same calculations as `/analytics`.
Pastoral and location timeline pagination uses the documented fields inside `query`.
