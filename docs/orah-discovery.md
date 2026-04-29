# Orah API discovery — LAS findings

> **Status:** ✅ Auth + base URL confirmed 2026-04-28. Health Center
> integration live; pastoral / leave integrations pending category
> + endpoint discovery (see "Open questions" at the bottom).

---

## 0. Confirmation

| Item | Value |
|---|---|
| Base URL | `https://open-api-ireland.orah.com` ✅ confirmed |
| Auth header | `Authorization: Bearer <ORAH_API_KEY>` ✅ confirmed |
| Method | All endpoints are `POST` (RPC style) ✅ |
| Path style | `/open-api/<resource>/<action>` ✅ |
| Content-Type | `application/json` |
| Empty body | `{}` is accepted by `*/list` endpoints |
| Error shape | `{"error": {"message": "..."}}` |
| Spelling | British/NZ ("authorisation") in error messages |

---

## 1. Endpoint surface (from public docs HTML)

```
POST /open-api/house/list                         ← LAS dorms
POST /open-api/house/{create,update,delete}
POST /open-api/student/list                       ← roster
POST /open-api/student/get-single
POST /open-api/student/{create,update,delete,update-location}
POST /open-api/contact/{get-single,list-by-student,create,update,delete}
POST /open-api/location/tree                      ← all locations
POST /open-api/location-record/get-current        ← who is where right now
POST /open-api/location-record/timeline           ← historical movements
POST /open-api/pastoral/timeline                  ← pastoral notes (incl. no-PA?)
POST /open-api/roll/timeline                      ← attendance rolls
POST /open-api/roll/get-single
POST /open-api/leave-type/list
POST /open-api/leave/get-single
POST /open-api/leave/{create,update,delete}
```

> ⚠️ Note: there is **no `leave/list` endpoint**. To surface "open
> travel requests for the weekend" we'll need to either use
> `location-record/timeline` filtered to off-grounds locations,
> or pull leaves per student. See open questions §6.

---

## 2. Confirmed model shapes

### House (`POST /open-api/house/list`, body `{}`)

LAS returned:

| id | name |
|---|---|
| 373 | Beau-Site |
| 374 | Savoy |
| 535 | Esplanade |
| 536 | DayStudent |
| 538 | BEC-B |
| 539 | BEC-G |
| 741 | Beau-Reveil |

```json
{
  "model": "house",
  "id": 374,
  "name": "Savoy",
  "sis_id": null,
  "created_at": "...",
  "updated_at": "..."
}
```

### Student (`POST /open-api/student/list`, body `{}`)

```json
{
  "model": "student",
  "id": 1234,
  "first_name": "Joseph",
  "last_name": "Bloggs",
  "alt_name": "Joe",
  "year_level": "10",
  "house": { "id": 55, "sis_id": "0227" }
}
```

> `student.house` is a *ref* (id only) — to display dorm name we
> join against the `house/list` map.

### Location (`POST /open-api/location/tree`, body `{"query":{"nested":false}}`)

```json
{
  "model": "location",
  "id": 1,
  "name": "On Ground",
  "state": "on_grounds",   // or "off_grounds" or "home"
  "type": "zone",
  "child_locations": [{ "id": 4, "name": "English Block" }, ...]
}
```

### Location record (`POST /open-api/location-record/get-current`, body `{}`)

```json
{
  "model": "location_record",
  "id": 448461,
  "type": "in",            // or "out"
  "record_time": "2024-03-22T09:47:25.648Z",
  "location": { "id": 2454, "name": "Library" },
  "student": { "id": 228501, "sis_id": null }
}
```

`student` here is a *ref*; we cross-reference to `student/list` for names.

### Pastoral record (`POST /open-api/pastoral/timeline`)

Request body needs `query.date_range.start_date` (and optionally `end_date`),
plus `page_size` / `page_index`.

```json
{
  "model": "pastoral",
  "id": 1,
  "date": "...",
  "description": "...",
  "action": "...",
  "note": "...",
  "watchlist": true,
  "watchlist_expiry": "...",
  "sensitive": false,
  "pastoral_category": { "id": 11, "name": "Discipline" },
  "student": { "id": 10973, "sis_id": null },
  "created_by": { "id": 1206, "name": "Jane Smith" }
}
```

### Leave (`POST /open-api/leave/get-single`)

```json
{
  "model": "leave",
  "id": 12345,
  "status": "Active",         // or "Scheduled"
  "start_time": "...",
  "end_time": "...",
  "leave_type": { "id": 1, "name": "Weekend Leave", "short_code": "WL" },
  "location": { "id": 2422, "name": "Home" },
  "student": { "id": 228695 }
}
```

---

## 3. App env vars (Vercel)

| Var | Value | Purpose |
|---|---|---|
| `ORAH_API_KEY` | (set) | Bearer token. |
| `ORAH_BASE_URL` | `https://open-api-ireland.orah.com` | Default; change only if Orah moves regions. |
| `HEALTH_CENTER_LOCATION_ID` | (TBD — find via `/api/orah/locations`) | Numeric id. Highest priority. |
| `HEALTH_CENTER_LOCATION_NAME` | `Health Center` | Used for name match if id not set. |
| `HC_REST_LOCATION_IDS` | (optional, comma-separated) | Extra location ids that count as "in HC" — typically rest-in-room pass locations. |
| `HC_REST_LOCATION_PATTERN` | `rest` | Case-insensitive substring matched against `location.name` to flag rest passes when ids aren't pinned. |
| `NO_PA_CATEGORY_NAME` | TBD after seeing real pastoral categories | Pastoral category name. |
| `USE_MOCK_DATA` | (unset) | Fall back to mock for not-yet-wired routes. |

---

## 4. Open questions / TODO

- [ ] Find LAS's Health Center location id. Visit `/api/orah/locations`
      after the next deploy to read off the id, then set
      `HEALTH_CENTER_LOCATION_ID`.
- [ ] How does LAS encode "no physical activity"? Hit `pastoral/timeline`
      for a recent date range and see what `pastoral_category.name`
      values come back. Likely candidates: "Health", "Medical",
      "No Physical Activity". The route will use whatever name we
      put in `NO_PA_CATEGORY_NAME`.
- [ ] How to list weekend travel requests? No `leave/list` endpoint
      exists. Three options:
      - (a) Use `location-record/timeline` for the weekend window,
            filter to off-grounds locations.
      - (b) Walk the student list and call `leave/get-single` per
            active leave id we discover elsewhere.
      - (c) Use `roll/timeline` — rolls have a `roll_type_name` like
            "Day Trip" which might cover scheduled trips.
- [ ] `clipboard` (LAS hourly check-in) — is it tracked in Orah at
      all, or paper-only? Probably paper for now; out of scope.
