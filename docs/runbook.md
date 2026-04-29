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

## Apps Script for adding links from the dashboard

Optional. When configured, designated admins see an "+ Add link" tile
on the launchpad and can append rows to the sheet without leaving the
dashboard. The sheet itself stays private to its owner — the script
runs as the owner so it has edit access automatically.

### 1. Generate a shared secret

```
openssl rand -hex 24
```

Keep the output handy — it goes in two places.

### 2. Open the script editor

In your launchpad sheet → **Extensions → Apps Script**. Replace
everything in `Code.gs` with:

```js
// LAS Duty Dashboard — launchpad write-back.
//
// Add or remove rows in the launchpad sheet from the dashboard.
// Deploy:  Deploy → New deployment → Type: Web app
//          → Execute as: Me (sheet owner)
//          → Who has access: Anyone
//          → Deploy → copy the URL.
//
// Paste the URL into LAUNCHPAD_WRITE_URL on Vercel and the SHARED_SECRET
// below into LAUNCHPAD_WRITE_TOKEN.

const SHARED_SECRET = 'PASTE_YOUR_RANDOM_HEX_HERE';
const SHEET_NAME = 'Sheet1'; // tab the dashboard reads from

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== SHARED_SECRET) {
      return _json({ error: 'unauthorized' });
    }

    const action = String(body.action || 'add').toLowerCase();
    if (action === 'remove') return _remove(body);
    if (action === 'update') return _update(body);
    return _add(body);
  } catch (err) {
    return _json({ error: String(err) });
  }
}

function _add(body) {
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  const icon = String(body.icon || 'link').trim();

  if (!name || !url) return _json({ error: 'name and url required' });
  if (!/^https?:\/\//.test(url)) {
    return _json({ error: 'url must start with http(s)://' });
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) return _json({ error: 'sheet tab not found: ' + SHEET_NAME });

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });

  const nextOrder = sheet.getLastRow(); // append at end
  const row = headers.map(function (h) {
    if (h === 'name') return name;
    if (h === 'url') return url;
    if (h === 'icon') return icon;
    if (h === 'order') return nextOrder;
    return '';
  });
  sheet.appendRow(row);

  return _json({ ok: true, name: name, url: url, icon: icon });
}

function _remove(body) {
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  if (!name) return _json({ error: 'name is required' });

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) return _json({ error: 'sheet tab not found: ' + SHEET_NAME });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return _json({ error: 'no rows to remove' });

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  const nameCol = headers.indexOf('name');
  const urlCol = headers.indexOf('url');
  if (nameCol === -1) return _json({ error: 'sheet missing "name" column' });

  const rows = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  for (let i = 0; i < rows.length; i++) {
    const rowName = String(rows[i][nameCol] || '').trim();
    if (rowName !== name) continue;
    if (url && urlCol !== -1) {
      const rowUrl = String(rows[i][urlCol] || '').trim();
      if (rowUrl !== url) continue;
    }
    sheet.deleteRow(i + 2);
    return _json({ ok: true, removed: { name: name, url: url } });
  }
  return _json({ error: 'tile not found: ' + name });
}

function _update(body) {
  const originalName = String(body.originalName || '').trim();
  const originalUrl = String(body.originalUrl || '').trim();
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  const icon = String(body.icon || 'link').trim();

  if (!originalName) return _json({ error: 'originalName is required' });
  if (!name || !url) return _json({ error: 'name and url required' });
  if (!/^https?:\/\//.test(url)) {
    return _json({ error: 'url must start with http(s)://' });
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) return _json({ error: 'sheet tab not found: ' + SHEET_NAME });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return _json({ error: 'no rows to update' });

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  const nameCol = headers.indexOf('name');
  const urlCol = headers.indexOf('url');
  const iconCol = headers.indexOf('icon');
  if (nameCol === -1 || urlCol === -1) {
    return _json({ error: 'sheet missing "name" or "url" column' });
  }

  const rows = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  for (let i = 0; i < rows.length; i++) {
    const rowName = String(rows[i][nameCol] || '').trim();
    if (rowName !== originalName) continue;
    if (originalUrl) {
      const rowUrl = String(rows[i][urlCol] || '').trim();
      if (rowUrl !== originalUrl) continue;
    }
    const sheetRow = i + 2;
    sheet.getRange(sheetRow, nameCol + 1).setValue(name);
    sheet.getRange(sheetRow, urlCol + 1).setValue(url);
    if (iconCol !== -1) sheet.getRange(sheetRow, iconCol + 1).setValue(icon);
    return _json({
      ok: true,
      updated: { name: name, url: url, icon: icon },
    });
  }
  return _json({ error: 'tile not found: ' + originalName });
}

function doGet() {
  return _json({ ok: true, message: 'launchpad write endpoint' });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Replace `PASTE_YOUR_RANDOM_HEX_HERE` with the secret from step 1.
Replace `Sheet1` with whichever tab the dashboard reads from if it
isn't `Sheet1`.

### 3. Deploy as a web app

In the Apps Script editor → **Deploy → New deployment**:

- **Type**: Web app
- **Execute as**: Me (this is the key — it runs as the sheet owner so
  it has edit permission)
- **Who has access**: Anyone
- Click **Deploy**, authorise when prompted, then copy the **Web app URL**

> "Anyone" sounds scary but is fine here: the script enforces the shared
> secret, so a request without the right token gets `{"error":"unauthorized"}`.

### 4. Set Vercel env vars

| Var | Value |
|---|---|
| `LAUNCHPAD_ADMIN_EMAILS` | your `@las.ch` email (comma-separate to add more) |
| `LAUNCHPAD_WRITE_URL` | the deployment URL from step 3 |
| `LAUNCHPAD_WRITE_TOKEN` | the secret from step 1 |

Redeploy. Sign in as one of the admin emails — you'll see "+ Add link"
on the launchpad. Anyone else's session won't.

### 5. Updating the script

If you edit the script later (e.g. to add validation), you must **Deploy
→ Manage deployments → edit existing deployment → New version → Deploy**.
Just saving the file isn't enough; the live URL points at the deployed
version, not the editor copy.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "+ Add link" tile not showing | Email not in `LAUNCHPAD_ADMIN_EMAILS`, or one of the write env vars is missing | Check Vercel env vars, redeploy |
| Add returns `unauthorized` | Token mismatch | Re-paste secret into `SHARED_SECRET` and `LAUNCHPAD_WRITE_TOKEN` |
| Add returns `sheet tab not found` | `SHEET_NAME` in script doesn't match the sheet tab | Update `SHEET_NAME` and redeploy script |
| Tile doesn't appear after Add | Cache lag | The dashboard busts the cache automatically, but try clicking Refresh |

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
