# Shareable dorm insights demo

Open `/demo` on the deployed dashboard, or choose **Shareable demo** from the signed-in analytics page. The demo opens in a new tab so the live dashboard keeps its place.

The page is public and uses invented data for 96 fictional students in Cedar, Maple, Juniper and Willow Houses. It is not a redacted copy of school records. A fixed clock (30 October 2026) and September–October history keep demonstrations repeatable. “This week” and “now” refer to that sample clock. Example response targets are illustrative, not school policy.

## A short walkthrough

1. Open **Find overdue follow-up** to show outstanding consequences and observed time to serve. Click a student to see their sample history.
2. Choose **See who is resting**, then **All dorms**, to show sample Health Center and room-rest counts. Completed durations require paired records; inferred departures stay separate.
3. Choose **Compare fictional dorms** to explore four weeks of counts and rates. Click a dorm or category to investigate its records. Counts include positive contributions and routine check-ins, not only infractions.
4. Open **Weekly report demo**. Switch the report dorm, edit the example recipients, toggle warnings/analytics, and print the example report. Its fixed example week is 19–25 October, independent of the analytics date controls.
5. Use **Reset demo** to restore the opening analytics view. Report options/recipient text reset on reload.

The page and printed examples carry DEMO labels. It offers no live-dashboard links, live admin controls, data collection, conversation writes, email delivery or real student API requests. Recipient text stays in component memory; only the fictional dorm selection is stored locally under a separate demo key. The demo does not change the live analytics selection.

## Security boundary and maintenance

Only the exact `/demo` page is exempted from the sign-in middleware. Every existing live page and API retains its authentication and authorisation. There is no `?demo` switch on a live API and no public API for school data. The page uses the shared analytics renderer with an explicit local fixture provider and a separate report-preview component; the fixture module must never import Orah, Sheets, Redis, or report delivery services.

The fixture shares pure watchlist/rest calculation functions with production. Demo reports illustrate content and configuration; actual scheduled deliveries use the existing admin report workflow and sender settings. No demo interaction enables that workflow.

Run `npm test`, `npm run typecheck` and `npm run build` when changing the boundary. Browser verification should open `/demo` signed out, inspect every tab and report option, assert zero `/api/` requests, confirm filters remain on `/demo`, check separate local storage, print, and verify live routes still redirect signed-out visitors. Test the shared live renderer against fictional service fixtures too.
