# GSC Portfolio Dashboard

Self-hosted dashboard for multiple Google Search Console accounts and properties.

## What this app does

- Admin login into your own private service
- Connect multiple Google accounts with Search Console access
- Import available Search Console properties from each account
- Show/hide selected properties on the master dashboard
- Portfolio overview with clicks, impressions, CTR and weighted average position
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
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/webmasters.readonly
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
  - `https://www.googleapis.com/auth/webmasters.readonly`

### Create OAuth Client ID

Create credentials for a **Web application**.

Add these values:

- Authorized JavaScript origin: `https://gsc.yourdomain.com`
- Authorized redirect URI: `https://gsc.yourdomain.com/api/google/callback`

Copy the client ID and client secret to `.env`.

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
