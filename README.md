# GSC Portfolio Dashboard

Self-hosted dashboard for multiple Google Search Console accounts and properties.

## What this app does

- Admin login into your own private service
- Connect multiple Google accounts with Search Console access
- Import available Search Console properties from each account
- Show/hide selected properties on the master dashboard
- Portfolio overview with clicks, impressions and weighted average position
- Drilldown page for each selected property
- Top pages, top queries, countries, devices and daily trend

## Stack

- Next.js 15
- PostgreSQL
- Prisma
- Google OAuth 2.0
- Google Search Console API
- Docker Compose

## 1. What you need before deployment

- A VPS or dedicated Linux server with a public IP
- A domain or subdomain, for example `gsc.yourdomain.com`
- Docker and Docker Compose Plugin installed on the server
- Nginx on the server
- A Google Cloud project with Search Console API enabled

## 2. Prepare your domain

Create an `A` record in DNS:

- Host: `gsc`
- Type: `A`
- Value: `YOUR_SERVER_IP`

Wait until the domain points to your server.

## 3. Upload the project to the server

Example path:

```bash
mkdir -p /var/www/gsc-dashboard
cd /var/www/gsc-dashboard
```

Upload the project files there.

## 4. Create the env file

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then edit `.env`.

Example values:

```env
APP_URL=https://gsc.yourdomain.com
APP_NAME=GSC Portfolio Dashboard
SESSION_SECRET=put-a-long-random-string-here
ENCRYPTION_KEY=put-64-hex-characters-here
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=your-strong-password
DATABASE_URL=postgresql://gsc:gscpassword@postgres:5432/gsc_dashboard?schema=public
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://gsc.yourdomain.com/api/google/callback
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/webmasters
```

Generate a valid encryption key:

```bash
openssl rand -hex 32
```

## 5. Google Cloud setup

### Enable the API

In Google Cloud Console:

- Create or choose a project
- Enable **Search Console API**

### Configure OAuth consent screen

- App name: whatever you want
- Support email: your email
- Audience: External if you want to connect personal Google accounts
- Add your email as a test user if the app is still in testing
- Add scopes:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/webmasters` (full Search Console access)

The full `webmasters` scope covers reading Search Analytics **and** managing sitemaps.
You do **not** need to add `webmasters.readonly` at the same time.

Changing the consented scope may require users to re-approve the consent screen
(and existing accounts can upgrade from the UI without a database migration).

### Create OAuth Client ID

Create credentials for a **Web application**.

Add these values:

- Authorized JavaScript origin: `https://gsc.yourdomain.com`
- Authorized redirect URI: `https://gsc.yourdomain.com/api/google/callback`

The redirect URI must exactly match `GOOGLE_REDIRECT_URI`.

Copy the client ID and client secret to `.env`.

## 5.1 Google OAuth permissions (sitemap-ready)

Why the app requests full Search Console access:

1. The dashboard needs Search Console analytics (clicks, impressions, position).
2. The same full `webmasters` scope is also what Google requires to manage sitemaps later.
3. The app does **not** get access to your website files, FTP, hosting, or page content.
4. The app cannot edit page HTML or CMS content.
5. Existing accounts that still have readonly access keep working for analytics.
6. To enable sitemap management later, expand permissions once from the account menu.
7. When expanding permissions, choose the **same** Google account.
8. If you decline the upgrade, analytics continues to work.
9. Scope capability is shown next to each Google account (separate from connection health).
10. Raw OAuth tokens are never shown in the UI; they are stored encrypted in PostgreSQL.

### Migrating existing readonly connections

- No Prisma / SQL migration is required for this OAuth change.
- Readonly connections remain readable for analytics.
- Use **«Разрешить управление sitemap»** / **«Проверить разрешения»** in the UI.
- Reconnect with the same Google account when prompted.
- After a successful upgrade the badge shows **«Sitemap: доступ разрешён»**.
- Update production `GOOGLE_OAUTH_SCOPES` only when you intentionally roll out the new default
  (code default is already full `webmasters`; leave existing VPS `.env` unchanged until you are ready).

## 6. Start the app

From the project root:

```bash
docker compose up -d --build
```

Check that containers are running:

```bash
docker compose ps
```

Check logs if needed:

```bash
docker compose logs -f app
```

The app will be available on port `3000` locally on the server.

## 7. Connect Nginx to the app

Copy `nginx.gsc-dashboard.conf` to Nginx sites-available and edit the domain:

```bash
sudo cp nginx.gsc-dashboard.conf /etc/nginx/sites-available/gsc-dashboard
sudo nano /etc/nginx/sites-available/gsc-dashboard
```

Replace:

- `gsc.example.com` -> your real domain

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/gsc-dashboard /etc/nginx/sites-enabled/gsc-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Enable HTTPS

If Certbot is installed:

```bash
sudo certbot --nginx -d gsc.yourdomain.com
```

After that the app should open at:

```text
https://gsc.yourdomain.com
```

## 9. First login

Open the app in the browser.

Log in with:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

This login is for your own service, not for Google.

## 10. How to add Search Console accounts

Inside the dashboard:

1. Click **Connect Google account**
2. Choose the Google account that has access to Search Console
3. Approve access
4. After callback, the app imports available properties from that account

You can repeat the same flow for another Google account.

## 11. How to add sites to the master dashboard

When a Google account is connected, its properties appear in the dashboard.

For each property you can:

- **Show on dashboard**
- **Hide from dashboard**
- **Open site**

Only properties marked as visible are included in the portfolio totals.

## 12. How to open a specific site

Click **Open site** next to a property.

That page shows:

- daily trend
- top pages
- top queries
- countries
- devices

## 13. Updating site list after you add a new property in Search Console

If you added a property in Google Search Console after connecting an account:

- return to the dashboard
- click **Refresh sites** on that Google connection

The app will call the Search Console `sites.list` endpoint again and update the imported properties.

## 14. Updating the application

```bash
cd /var/www/gsc-dashboard
docker compose down
git pull
cp .env .env.backup
docker compose up -d --build
```

If you are not using Git, replace the project files manually and run:

```bash
docker compose up -d --build
```

## 15. Backup

The database is stored in a Docker volume named `postgres_data`.

Quick PostgreSQL dump example:

```bash
docker exec -t gsc-postgres pg_dump -U gsc gsc_dashboard > gsc_dashboard_backup.sql
```

## 16. Common problems

### OAuth error: redirect_uri_mismatch

The redirect URI in Google Cloud does not exactly match the one in `.env`.

### App shows Google unverified warning

That is normal during testing. Add your Google account as a test user.

### No sites appear after connection

The Google account probably has no access to any Search Console property, or the property belongs to another Google account.

### Dashboard opens but no data is visible

At least one property must be marked **Show on dashboard**.

## 17. Production notes

This version queries Search Console live. For a larger portfolio, the next step is to add a daily sync job and store historical snapshots in your own database. That will make the dashboard faster and give you a longer archive.

## 18. LOW integration API

Read-only machine-to-machine API for **The Life of Websites (LOW)**.

Google OAuth access/refresh tokens, client secret, encryption keys, admin password, and database URL are **never** returned and are **never** copied to LOW. LOW authenticates with a shared service token only.

### Auth

- Header: `Authorization: Bearer <GSC_LOW_API_TOKEN>`
- Missing/invalid token → `401`
- If `GSC_LOW_API_TOKEN` is unset/empty → fail closed (`401`)
- Do not pass the token in the query string
- Admin browser cookies are not used for this API

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/integrations/low/health` | Liveness for the integration surface |
| `GET` | `/api/integrations/low/properties` | Paginated GSC properties for sync |
| `GET` | `/api/integrations/low/properties/:id/lifecycle` | Earliest available impression/click dates |
| `GET` | `/api/integrations/low/properties/:id/performance?window=latest_day` | Impression/click totals for the latest available day |

### Properties query params

- `limit` — default `100`, max `200`
- `cursor` — opaque pagination cursor
- `updatedSince` — optional ISO datetime filter

Stable sort: `updatedAt ASC`, `id ASC`.

### Example lifecycle response

Dates are always `null` or inside the executed `[searchedFrom, searchedTo]` range (inclusive). Early stop after both dates are found reports only the windows that were actually queried.

```json
{
  "propertyId": "prop_1",
  "siteUrl": "sc-domain:example.com",
  "firstImpressionDate": "2025-04-01",
  "firstClickDate": "2025-04-02",
  "searchedFrom": "2025-04-01",
  "searchedTo": "2025-04-05",
  "dateMeaning": "earliest_available_in_search_console_api",
  "generatedAt": "2026-08-02T10:00:00.000Z"
}
```

### Field meanings

- `firstSeenAt` — when the property was first imported into **this GSC app** (`GscProperty.createdAt`), not a guaranteed Google Search Console add date
- `dateMeaning: earliest_available_in_search_console_api` — earliest date among rows returned by the current Search Console API lookback, **not** a guaranteed first-ever historical date for the property
- `searchedFrom` / `searchedTo` — calendar range that was actually queried (may be shorter than the configured lookback when both dates are found early)

### Property performance

```
GET /api/integrations/low/properties/:id/performance?window=latest_day
```

`window` is optional and defaults to `latest_day`. Any other value returns `400`. A rolling 24-hour window is **not** supported — Search Console does not expose hourly data through this API.

Response:

```json
{
  "propertyId": "prop_1",
  "siteUrl": "sc-domain:example.com",
  "period": "latest_available_day",
  "periodStart": "2026-08-02",
  "periodEnd": "2026-08-02",
  "dataDate": "2026-08-02",
  "impressions": 840,
  "clicks": 12,
  "generatedAt": "2026-08-04T10:00:00.000Z"
}
```

Semantics:

- `period: latest_available_day` — totals cover **one full Search Console calendar day**, the latest day Google normally has finalised data for (typically today − 2 days). This is **not** a rolling last-24-hours figure, and it is not "today".
- `periodStart` / `periodEnd` / `dataDate` are the same calendar date, in `YYYY-MM-DD`.
- Totals are summed over the finalised (`dataState: final`) Search Analytics rows for that single day. A property with no rows for the day returns `0` / `0` rather than an error.
- Unknown property → `404`. Upstream Search Console failure or timeout → `502`.

### Performance curl example

```bash
curl -sS -H "Authorization: Bearer YOUR_GSC_LOW_API_TOKEN" \
  "http://localhost:3000/api/integrations/low/properties/PROPERTY_ID/performance?window=latest_day"
```

### Forbidden response fields

Never returned: `encryptedAccess`, `encryptedRefresh`, access/refresh tokens, `tokenExpiry`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `DATABASE_URL`, or the `Authorization` header value.

### Safe curl examples

```bash
curl -sS -H "Authorization: Bearer YOUR_GSC_LOW_API_TOKEN" \
  "http://localhost:3000/api/integrations/low/health"

curl -sS -H "Authorization: Bearer YOUR_GSC_LOW_API_TOKEN" \
  "http://localhost:3000/api/integrations/low/properties?limit=100"

curl -sS -H "Authorization: Bearer YOUR_GSC_LOW_API_TOKEN" \
  "http://localhost:3000/api/integrations/low/properties/PROPERTY_ID/lifecycle"

curl -sS -H "Authorization: Bearer YOUR_GSC_LOW_API_TOKEN" \
  "http://localhost:3000/api/integrations/low/properties/PROPERTY_ID/performance?window=latest_day"
```

### Env

```env
GSC_LOW_API_TOKEN=replace-with-a-long-random-token
GSC_LIFECYCLE_LOOKBACK_DAYS=488
GSC_LIFECYCLE_WINDOW_DAYS=90
GSC_LIFECYCLE_TIMEOUT_MS=60000
GSC_PERFORMANCE_TIMEOUT_MS=60000
```

`GSC_PERFORMANCE_TIMEOUT_MS` is optional (default `60000`). Values outside `1000`–`300000` or non-integers fall back to the default.

Store the real token only in `.env` or deployment secrets. Never use `NEXT_PUBLIC_` for this value.

