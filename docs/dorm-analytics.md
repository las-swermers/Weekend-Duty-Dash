# Dorm insights and consequence tracking

The Analytics link now opens a shared date/dorm view with Overview, Consequences,
Warnings & follow-up, Health Center & rest, and Trends & dorms. Savoy is the initial
selection; All dorms is an explicit unfiltered selection and persists on the device.
Filters and the active view are also preserved in the URL. Charts and student names
open the underlying records. Print exports the visible view (tables explicitly state
when only their current page is printed).

## Definition agreed with the operator

Staff manually remove infraction watchlist flags once the consequence has been
**served**. We therefore measure watchlist addition → removal as time to consequence
served, in elapsed calendar hours, including nights/weekends. This is not time to
first staff contact and does not independently verify completion. Do not use record
`updated_at` as the flag removal time.

Targets are blank initially. An operator in REPORTS_ADMIN_EMAILS can set elapsed-hour
targets per exact Orah category in Consequences → Admin. The current targets are used
for every date range, including historical views. Settings do not change Orah.
Default categories: 1-hour/2-hour early check-in, Friday Night in the Dorm, Saturday
Clipboard, Saturday Night in the Dorm, Sunday Clipboard. Adding a category target
also starts tracking that category. Removing its target removes the target, not its
existing observation history or future collection. Sensitive categories are excluded.

## Collection and evidence

- `/api/cron/watchlist-sync` requires the existing CRON_SECRET bearer token.
- `vercel.json` schedules 04:00 UTC daily, independently of weekly email delivery.
  Vercel Hobby executes within that hour. This is daily resolution, not 15-minute
  precision. On an appropriate plan, change this job to `*/15 * * * *`, or configure
  a trusted external scheduler with the same secret. Do not put the secret in URLs.
- An explicitly allowlisted admin may also Collect watchlist now. POST and settings
  writes check both admin identity and request origin. Repeated scans within a minute
  reuse the last observation. GET analytics never mutates history.
- Preview deployments and mock mode cannot collect. Preview settings should use
  separate KV storage to isolate any test configuration changes.
- The collector scans complete pastoral history using documented query pagination,
  rejects invalid/repeated/truncated pages, and commits the entire observation
  atomically under a token-checked lease. Limit: 40,000 records / 200 seconds of
  collection. On limit or source failure, the old observation remains unchanged.
- State uses `analytics:v1:watchlist` in the existing Redis connection; targets use
  `analytics:v1:targets`. No additional provider is required. Closed episodes are
  retained for one year; open episodes remain. The state stores IDs/categories/times,
  not student names or narrative notes. Names are joined from the current roster.
- First-scan active flags have unknown starts. Never backdate them to creation or
  incident dates. Each observed reactivation creates another episode.
- Start/end timestamps are **bounds between successful scans**, not exact events.
  Scan starts are conservative lower bounds and scan completion is the upper bound.
  Multiple changes between scans can be missed. Partial data never means removal.
- Missing/deleted records stay unresolved; verified waiting time stops at their last
  active observation. A newly sensitive record is removed from the history next scan.
- Possible expiry-related removals are excluded from served timing. For a completed
  bounded episode, min duration = last possible addition → earliest possible removal;
  max duration = earliest possible addition → latest possible removal.
- Median/average show ranges from those bounds. Within-target percentages use only
  classifiable served episodes; uncertain and unknown-start/target counts are shown.
- Backlog and historical status use observation dates. A removal first observed after
  a cutoff may in fact have happened before it. Weekly history says partial/not tracked
  outside full collection coverage. One year retention also limits old history.

## Sources, scope and missing data

Existing ANALYTICS_ALLOWED_EMAILS access remains in effect. Conversation notes also
require WARNINGS_ALLOWED_EMAILS access; gaining analytics access doesn't bypass it.
Targets and manual collection require REPORTS_ADMIN_EMAILS. No role is inferred from
an email domain beyond the existing application sign-in policy.

Pastoral charts include all non-sensitive categories. Dates are Swiss calendar days,
up to 120 days. Trends show eight weeks ending at the cutoff, with partial weeks
explicitly labelled. All student-level data uses the current active roster and current
dorm assignment. Per-100 rates are records / current roster \* 100; these are not a
historically adjusted enrolment rate or a performance ranking.

Warning follow-up uses the week containing the selected end date and is evaluated
through that exact cutoff, including earlier outstanding conversations within the
configured term. This weekly workflow is labelled separately from the full-period
pastoral totals. Follow the Live link to use the existing Warnings conversation editor.

Rest data separates Health Center from room-rest current locations (available when
viewing a period through today). Historical movements look back 31 days before the
selected start. Duplicate check-ins are not double-counted. Explicit matching in/out
pairs contribute to median completed visit duration; only their overlap with the
selected period contributes to total paired hours. A change of location/transit is an
inferred departure, not a confirmed pass end. Ongoing, inferred and incomplete visits
remain visible and do not contribute to paired duration KPIs. Actual pass start/end
fields are not assumed to exist in this API.

A source outage is displayed as unavailable, not zero. A stale collector is labelled
and verified waiting time is bounded by available evidence. Attendance integration and
routine PowerSchool uploads are intentionally not part of this release.

## Weekly reports

Analytics-enabled subscriptions now include the same watchlist metric functions and
rest interval calculations as the page. Report scope still controls which pastoral
categories appear. Watchlist storage being unavailable is stated explicitly in the
report; it does not suppress the otherwise valid warning/rest report. Reports remain
frozen snapshots, so later Orah edits/observations can differ from a regenerated page.

## Before production activation

Merge/deploy the review branch; verify existing Orah, Redis and CRON_SECRET settings;
set REPORTS_ADMIN_EMAILS to the operator's login. Perform Collect watchlist now in
production and verify the baseline against several known records. Confirm the scheduled
job runs, and inspect a second observation after staff have served a consequence.
Set category targets only after expectations are agreed. No live keys, live student
records, emails or production history were used during local verification.

References checked 30 October 2026:

- https://open-api-sydney.orah.com/open-api/ (pastoral/location pagination under query;
  watchlist is a current flag, expiry is separate, no flag audit history documented)
- https://vercel.com/docs/cron-jobs/usage-and-pricing (Hobby daily frequency/precision)
