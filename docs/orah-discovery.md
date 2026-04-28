# Orah API discovery — TEMPLATE (Phase 0)

> **Status:** ⛔ NOT YET COMPLETED.
> This document is a template. Phase 2 (Orah integration) is **blocked**
> until this file is filled in. See `WEEKEND_DASHBOARD_SPEC.md` §3.

This is a manual discovery task for Shayne, performed against the live
Orah Admin Console. Claude Code should not guess at any of the values
below — every blank must be replaced with a confirmed answer or screenshot
reference.

---

## 0. Confirmation

| Item | Value |
|---|---|
| Base URL | `https://open-api-ireland.orah.com` *(confirm this is correct for LAS)* |
| Auth header name | _e.g. `X-API-Key` — confirm exact casing and name_ |
| API key generated | _date / name (`weekend-dashboard-prod`) / stored in:_ |
| Console docs URL | _link inside Orah Admin Console_ |

---

## 1. Locations endpoint

- Path: `_____`
- Query parameters: `_____`
- Response shape (sample, sanitized):

```json
{
  "data": []
}
```

- LAS Health Center location:
  - Name in Orah: `_____`
  - `id`: `_____`  ← becomes env var `HEALTH_CENTER_LOCATION_ID`

---

## 2. Location Records endpoint

- Path: `_____`
- Filter by `location_id`: ☐ yes ☐ no
- Filter by date range: ☐ yes ☐ no — parameter names: `_____`
- Pagination: ☐ none ☐ cursor ☐ offset/limit — details: `_____`
- Sample response (one record):

```json
{
}
```

- Edge case test — student in HC overnight (Fri 22:00 → Sat 09:00):
  appears in a Friday-only query? ☐ yes ☐ no
- Notes: `_____`

---

## 3. Pastoral Records endpoint (no PA)

- Path: `_____`
- How "no physical activity" is encoded at LAS:
  - ☐ pastoral record category named `_____`
  - ☐ pastoral record tag `_____`
  - ☐ student-profile custom field `_____`
  - ☐ other: `_____`
- Becomes env var `NO_PA_RECORD_TYPE_ID` (or similar).
- Sample response:

```json
{
}
```

---

## 4. Leave / travel requests endpoint

- Path: `_____`
- Status values present in responses: `pending` / `approved` / `denied` / others?
- Date filter parameter names: `_____`
- Sample response:

```json
{
}
```

---

## 5. Scheduled trips

Pick one:

- ☐ A. Orah has an Activities/Events module — path `_____`
- ☐ B. Trips are leave requests with a category — filter `_____`

Sample response:

```json
{
}
```

---

## 6. Students / Houses

- Path: `_____`
- Response includes `house` / `dorm` field? ☐ yes ☐ no
- If no, separate Houses endpoint:
  - Path: `_____`
  - Join key: `_____`

---

## 7. Open questions for the school

- [ ] Which "location" in Orah is the Health Center? (Exact name + id)
- [ ] How is "no physical activity" recorded?
- [ ] What does LAS call "clipboard" in Orah, and is it tracked there?
- [ ] Are weekend activity trips tracked in Orah or only in the Google Sheet?
- [ ] Who is the Orah admin who can grant API access?

---

## 8. Deviations from the spec

> Anything in `WEEKEND_DASHBOARD_SPEC.md` that doesn't match reality. Be
> explicit — silent papering-over breaks Phase 2.

- _none yet_

---

## 9. Sign-off

When this document is complete, update the env vars below, commit this
file, and Phase 2 implementation can begin.

```
ORAH_API_KEY=
HEALTH_CENTER_LOCATION_ID=
NO_PA_RECORD_TYPE_ID=
```
