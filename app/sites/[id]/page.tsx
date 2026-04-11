import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { defaultDateRange, querySite } from '@/lib/google';
import { formatDecimal, formatNumber, formatPercent } from '@/lib/format';

type SafeReport = {
  rows: {
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }[];
  error?: string | null;
};

async function safeQuery(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<SafeReport> {
  try {
    const result = await querySite(connectionId, siteUrl, body);
    return { rows: result.rows || [], error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : 'Unknown API error',
    };
  }
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const property = await prisma.gscProperty.findUnique({
    where: { id },
    include: { connection: true },
  });

  if (!property) {
    notFound();
  }

  const range = defaultDateRange(28);

  const [daily, pages, queries, devices, countries] = await Promise.all([
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['date'],
      rowLimit: 31,
      dataState: 'all',
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['page'],
      rowLimit: 20,
      dataState: 'all',
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['query'],
      rowLimit: 20,
      dataState: 'all',
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['device'],
      rowLimit: 10,
      dataState: 'all',
    }),
    safeQuery(property.connectionId, property.siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['country'],
      rowLimit: 10,
      dataState: 'all',
    }),
  ]);

  return (
    <main className="page-shell">
      <section className="panel">
        <div className="header-actions space-between align-start">
          <div>
            <div className="badge">Site drilldown</div>
            <h1>{property.label || property.siteUrl}</h1>
            <p className="muted">{property.siteUrl}</p>
            <p className="muted">Google account: {property.connection.email}</p>
          </div>
          <Link className="button ghost" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>

      {[daily, pages, queries, devices, countries].some((r) => r.error) ? (
        <div className="alert error">
          Some reports could not be loaded. Open the connection again or refresh its sites if the Google token changed.
        </div>
      ) : null}

      <section className="grid two-columns">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Daily trend</h3>
              <p className="muted">{range.startDate} → {range.endDate}</p>
              <p className="muted">Recent Search Console data can be preliminary and may update over the next 24–72 hours.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clicks</th>
                  <th>Impressions</th>
                  <th>CTR</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {daily.rows.map((row) => (
                  <tr key={row.keys?.[0] || 'date'}>
                    <td>{row.keys?.[0]}</td>
                    <td>{formatNumber(row.clicks || 0)}</td>
                    <td>{formatNumber(row.impressions || 0)}</td>
                    <td>{formatPercent(row.ctr || 0)}</td>
                    <td>{formatDecimal(row.position || 0, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {daily.error ? <div className="small-text bad">{daily.error}</div> : null}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Top pages</h3>
              <p className="muted">Best performing pages by clicks.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Clicks</th>
                  <th>Impressions</th>
                  <th>CTR</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {pages.rows.map((row) => (
                  <tr key={row.keys?.[0] || 'page'}>
                    <td className="break-all">{row.keys?.[0]}</td>
                    <td>{formatNumber(row.clicks || 0)}</td>
                    <td>{formatNumber(row.impressions || 0)}</td>
                    <td>{formatPercent(row.ctr || 0)}</td>
                    <td>{formatDecimal(row.position || 0, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages.error ? <div className="small-text bad">{pages.error}</div> : null}
        </section>
      </section>

      <section className="grid two-columns">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Top queries</h3>
              <p className="muted">Query report pulled directly from Search Console API.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Clicks</th>
                  <th>Impressions</th>
                  <th>CTR</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {queries.rows.map((row) => (
                  <tr key={row.keys?.[0] || 'query'}>
                    <td>{row.keys?.[0]}</td>
                    <td>{formatNumber(row.clicks || 0)}</td>
                    <td>{formatNumber(row.impressions || 0)}</td>
                    <td>{formatPercent(row.ctr || 0)}</td>
                    <td>{formatDecimal(row.position || 0, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {queries.error ? <div className="small-text bad">{queries.error}</div> : null}
        </section>

        <section className="panel stack-lg">
          <div>
            <div className="panel-header">
              <div>
                <h3>Devices</h3>
                <p className="muted">Desktop, mobile and tablet split.</p>
              </div>
            </div>
            <div className="table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Clicks</th>
                    <th>Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.rows.map((row) => (
                    <tr key={row.keys?.[0] || 'device'}>
                      <td>{row.keys?.[0]}</td>
                      <td>{formatNumber(row.clicks || 0)}</td>
                      <td>{formatNumber(row.impressions || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {devices.error ? <div className="small-text bad">{devices.error}</div> : null}
          </div>

          <div>
            <div className="panel-header">
              <div>
                <h3>Countries</h3>
                <p className="muted">Top countries from Search Console data.</p>
              </div>
            </div>
            <div className="table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Clicks</th>
                    <th>Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.rows.map((row) => (
                    <tr key={row.keys?.[0] || 'country'}>
                      <td>{row.keys?.[0]}</td>
                      <td>{formatNumber(row.clicks || 0)}</td>
                      <td>{formatNumber(row.impressions || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {countries.error ? <div className="small-text bad">{countries.error}</div> : null}
          </div>
        </section>
      </section>
    </main>
  );
}