# Implementation baseline — GSC indexing and portfolio tools

Date: 2026-08-02  
Branch: `feature/gsc-indexing-and-portfolio-tools`  
Base commit: `a2ea98a` (`Tighten accounts control into one iconized combo.`)  
Repository: `liyu-bet/gsc`

This document captures the pre-change baseline for the staged expansion described in `gsc_cursor_implementation_pack.md`.  
**Stage 0 only:** no production logic changes.

---

## 1. Current architecture

- **Runtime:** Next.js 15 App Router, React 19, TypeScript, standalone Node server in Docker.
- **Data:** PostgreSQL via Prisma (`GoogleConnection`, `GscProperty`).
- **Auth:** custom HMAC-signed admin session cookie (`gsc_admin_session`); LOW API uses separate Bearer token (`GSC_LOW_API_TOKEN`).
- **Google:** OAuth tokens encrypted at rest; live Search Console Search Analytics queries; default OAuth scope is `webmasters.readonly`.
- **UI:** Russian-localized portfolio dashboard + site detail workspace; CTR intentionally removed from UI.
- **Deploy:** GitHub Actions builds image → GHCR; VPS only `pull` + `up -d --no-build`.

### Core models

| Model | Purpose |
|---|---|
| `GoogleConnection` | Google account, encrypted tokens, optional `scope` |
| `GscProperty` | Search Console property bound to a connection; `isSelected` controls portfolio visibility |

No connection status enum and no inspection cache tables yet.

---

## 2. Studied files (Stage 0 inventory)

### Required by pack

- `prisma/schema.prisma`
- `lib/google.ts`
- `lib/env.ts`
- `lib/auth.ts`
- `app/dashboard/page.tsx`
- `app/sites/[id]/page.tsx`
- `components/DashboardToolbar.tsx`
- `components/PortfolioCard.tsx`
- `components/site/WorkspaceTable.tsx`
- `app/api/google/connect/route.ts`
- `app/api/google/callback/route.ts`
- LOW API:
  - `app/api/integrations/low/health/route.ts`
  - `app/api/integrations/low/properties/route.ts`
  - `app/api/integrations/low/properties/[id]/lifecycle/route.ts`
  - `lib/low-api-auth.ts`
  - `lib/low-integration/*`
  - `lib/low-api-auth.test.ts`
  - `lib/low-integration.test.ts`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.ghcr.yml`
- `.github/workflows/publish-images.yml`

### Supporting context also reviewed

- `package.json` / `package-lock.json` (versions, scripts)
- `middleware.ts` / `lib/middleware-auth-bypass.ts`
- `lib/format.ts`, `lib/ui-labels.ts`, `lib/countries.ts`
- `components/AppHeader.tsx`, `components/ConnectedAccountsControl.tsx`
- `app/api/connections/*/route.ts`

---

## 3. Current versions

| Package | Version in tree |
|---|---|
| Next.js | `^15.3.0` resolved as **15.5.22** at build |
| React | `^19.0.0` |
| `@prisma/client` | `^6.19.3` |
| `prisma` (devDependency pin) | **6.19.3** |
| `prisma` (dependencies field) | `^6.6.0` (resolved via lock/dev pin in practice) |
| Generated Prisma Client | **v6.19.3** |
| TypeScript | `^5.8.2` |
| zod | `^3.24.2` |
| date-fns | `^4.1.0` |
| jose | `^5.9.6` |

---

## 4. Current test files

`npm test` runs:

```text
tsx --test lib/**/*.test.ts app/api/integrations/low/**/*.test.ts
```

Existing test files found:

- `lib/low-api-auth.test.ts`
- `lib/low-integration.test.ts`

No files currently match `app/api/integrations/low/**/*.test.ts` (glob is reserved / unused).

Baseline result: **32 passed / 0 failed**.

---

## 5. Current API routes

### Admin / browser (session)

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/google/connect`
- `GET  /api/google/callback`
- `POST /api/connections/[id]/sync`
- `POST /api/connections/[id]/delete`
- `POST /api/connections/sync-all`
- `POST /api/properties/[id]/toggle`

### LOW machine API (Bearer)

- `GET /api/integrations/low/health`
- `GET /api/integrations/low/properties`
- `GET /api/integrations/low/properties/[id]/lifecycle`

### App pages

- `/` → redirect
- `/login`
- `/dashboard`
- `/sites/[id]`

---

## 6. Extension points for later stages

| Area | Current hook | Planned modules (from pack) |
|---|---|---|
| Dates / ranges | `latestAvailableDate`, `defaultDateRange` in `lib/google.ts`; local `clampRange` in pages | `lib/date-ranges.ts` |
| Metrics | inline weighted position on dashboard; unweighted avg on site chart | `lib/metrics.ts` |
| Google HTTP | ad-hoc fetch + refresh in `lib/google.ts` | `lib/google-errors.ts`, `lib/google-authorized-fetch.ts` |
| Connection health | no status fields | Prisma enum + UI badge |
| Sitemaps / Inspection | absent | `lib/gsc-sitemaps.ts`, `lib/gsc-inspection.ts`, panels + routes |
| Portfolio analytics | live per-site Search Analytics only | `lib/portfolio-analytics.ts`, tables + cache stamp |
| CSV / SERP / history | absent | `lib/csv.ts`, `lib/serp.ts`, `lib/query-history.ts` |
| Concurrency | unbounded `Promise.all` over selected properties on dashboard | `lib/concurrency.ts` |
| Deploy | GHCR pull-only on VPS | keep; add migration/docs stages |

---

## 7. Known source issues (pre-existing; do not fix in Stage 0)

1. **Dashboard `1 day` → 7 days**  
   `app/dashboard/page.tsx` `clampRange`: `if (parsed <= 7) return 7;` collapses 1-day selection.

2. **Hard “today − 2 days” end date**  
   `lib/google.ts` `latestAvailableDate()` uses local server timezone via `date-fns` `subDays(new Date(), 2)`, not `America/Los_Angeles`.

3. **Site detail average position is unweighted**  
   `buildMetricSeries` averages daily `position` values with equal weight; dashboard summary already weights by impressions.

4. **Ranking queries/pages cards misuse click deltas**  
   Cards show `queryRows.length` / `pageRows.length` as current value, but change % is computed from summed clicks vs previous clicks — not row-count dynamics.

5. **No visible cache freshness / forced refresh on dashboard**  
   `unstable_cache(..., { revalidate: 300 })` is silent to the user.

6. **OAuth scope is readonly by default**  
   `lib/env.ts` default: `.../auth/webmasters.readonly` — sitemap submit / URL Inspection write-capable scope not requested.

7. **No connection health model**  
   No `status` / `lastErrorCode` / reauth UX; Google errors are mostly opaque strings.

8. **Dashboard fan-out has no concurrency bound**  
   All selected properties queried via `Promise.all`.

9. **Dependency field noise**  
   `dependencies.prisma` (`^6.6.0`) vs pinned `devDependencies.prisma` (`6.19.3`) — not a failing check, but worth cleaning later without schema changes.

10. **npm audit** reports 3 high severity vulnerabilities in the dependency tree (baseline note only).

---

## 8. Baseline command results

Run on 2026-08-02 from clean `feature/gsc-indexing-and-portfolio-tools` at `a2ea98a`.

| Command | Result |
|---|---|
| `npm install` | success (packages up to date; Prisma Client v6.19.3 generated) |
| `npm run typecheck` | **pass** |
| `npm test` | **pass** — 32 tests, 0 fail |
| `npm run build` | **pass** — Next.js 15.5.22 production build |

No originally-passing checks were observed failing before Stage 0 documentation.

---

## 9. Risks for upcoming stages

- Changing OAuth default scope requires reconnect of existing accounts; readonly connections must keep reading analytics.
- Prisma additions must be additive (no destructive drops).
- LOW response contracts must remain byte-compatible for consumers.
- Dashboard caching + new portfolio fan-out must not spike Google quotas (bounded concurrency required).
- URL Inspection + sitemap fetch must reject private/local targets and bound size/timeouts.
- Production deploy must run `prisma migrate deploy` before app restart; VPS must remain pull-only (no image build on server).

---

## 10. Stage 0 deliverable status

- [x] Feature branch created: `feature/gsc-indexing-and-portfolio-tools`
- [x] Required files studied
- [x] Baseline checks executed
- [x] Pre-existing issues recorded
- [x] No production logic changed
- [x] This baseline document added
