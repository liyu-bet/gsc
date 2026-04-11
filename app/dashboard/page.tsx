import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { MetricCard } from '@/components/MetricCard';
import { defaultDateRange, querySite } from '@/lib/google';
import { deltaPercent, formatDecimal, formatNumber, formatPercent } from '@/lib/format';

function sum<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((acc, item) => acc + selector(item), 0);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ google_error?: string }>;
}) {
  await requireAdmin();

  const params = (await searchParams) || {};

  const connections = await prisma.googleConnection.findMany({
    include: {
      properties: {
        orderBy: { siteUrl: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const selectedProperties = connections.flatMap((connection) =>
    connection.properties
      .filter((property) => property.isSelected)
      .map((property) => ({
        id: property.id,
        label: property.label || property.siteUrl,
        siteUrl: property.siteUrl,
        connectionId: connection.id,
      }))
  );

  const range = defaultDateRange(28);

  const siteMetrics = await Promise.all(
    selectedProperties.map(async (property) => {
      try {
        const [current, previous] = await Promise.all([
          querySite(property.connectionId, property.siteUrl, {
            startDate: range.startDate,
            endDate: range.endDate,
            dataState: 'all',
          }),
          querySite(property.connectionId, property.siteUrl, {
            startDate: range.previousStartDate,
            endDate: range.previousEndDate,
            dataState: 'all',
          }),
        ]);

        const currentRow = current.rows?.[0] || {};
        const previousRow = previous.rows?.[0] || {};

        return {
          ...property,
          clicks: currentRow.clicks || 0,
          impressions: currentRow.impressions || 0,
          ctr: currentRow.ctr || 0,
          position: currentRow.position || 0,
          previousClicks: previousRow.clicks || 0,
          previousImpressions: previousRow.impressions || 0,
          previousCtr: previousRow.ctr || 0,
          previousPosition: previousRow.position || 0,
          error: null as string | null,
        };
      } catch (error) {
        return {
          ...property,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
          previousClicks: 0,
          previousImpressions: 0,
          previousCtr: 0,
          previousPosition: 0,
          error: error instanceof Error ? error.message : 'Unknown API error',
        };
      }
    })
  );

  const totalClicks = sum(siteMetrics, (site) => site.clicks);
  const totalImpressions = sum(siteMetrics, (site) => site.impressions);
  const totalPrevClicks = sum(siteMetrics, (site) => site.previousClicks);
  const totalPrevImpressions = sum(siteMetrics, (site) => site.previousImpressions);
  const weightedCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const weightedPrevCtr = totalPrevImpressions > 0 ? totalPrevClicks / totalPrevImpressions : 0;
  const weightedPosition =
    totalImpressions > 0
      ? sum(siteMetrics, (site) => site.position * site.impressions) / totalImpressions
      : 0;
  const weightedPrevPosition =
    totalPrevImpressions > 0
      ? sum(siteMetrics, (site) => site.previousPosition * site.previousImpressions) /
        totalPrevImpressions
      : 0;

  const sortedSites = [...siteMetrics].sort((a, b) => b.clicks - a.clicks);

  return (
    <main className="page-shell">
      <AppHeader />

      {params.google_error ? (
        <div className="alert error">Google connection error: {params.google_error}</div>
      ) : null}

      <section className="panel hero-panel">
        <div>
          <h2>Master dashboard</h2>
          <p className="muted">
            Current range: {range.startDate} → {range.endDate}. Previous range: {range.previousStartDate} →{' '}
            {range.previousEndDate}.
          </p>
          <p className="muted">Recent Search Console data can be preliminary and may update over the next 24–72 hours.</p>
        </div>
        <div className="hero-grid">
          <MetricCard
            label="Total clicks"
            value={formatNumber(totalClicks)}
            note={
              <span className={deltaPercent(totalClicks, totalPrevClicks) >= 0 ? 'good' : 'bad'}>
                {formatDecimal(deltaPercent(totalClicks, totalPrevClicks), 1)}% vs previous period
              </span>
            }
          />
          <MetricCard
            label="Total impressions"
            value={formatNumber(totalImpressions)}
            note={
              <span
                className={deltaPercent(totalImpressions, totalPrevImpressions) >= 0 ? 'good' : 'bad'}
              >
                {formatDecimal(deltaPercent(totalImpressions, totalPrevImpressions), 1)}% vs previous
              </span>
            }
          />
          <MetricCard
            label="Portfolio CTR"
            value={formatPercent(weightedCtr)}
            note={<span>{formatPercent(weightedPrevCtr)} previous period</span>}
          />
          <MetricCard
            label="Weighted position"
            value={formatDecimal(weightedPosition, 2)}
            note={<span>Previously {formatDecimal(weightedPrevPosition, 2)}</span>}
          />
        </div>
      </section>

      <section className="grid two-columns">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Connected Google accounts</h3>
              <p className="muted">Each connected account can expose multiple Search Console properties.</p>
            </div>
          </div>

          {connections.length === 0 ? (
            <EmptyState
              title="No Google accounts connected yet"
              text="Click “Connect Google account”, authorize access, and your available Search Console properties will appear here."
            />
          ) : (
            <div className="stack-lg">
              {connections.map((connection) => (
                <article className="connection-card" key={connection.id}>
                  <div className="connection-header">
                    <div>
                      <h4>{connection.name || connection.email}</h4>
                      <p className="muted">{connection.email}</p>
                    </div>
                    <div className="header-actions">
                      <form action={`/api/connections/${connection.id}/sync`} method="post">
                        <button className="button small" type="submit">
                          Refresh sites
                        </button>
                      </form>
                      <form action={`/api/connections/${connection.id}/delete`} method="post">
                        <button className="button ghost small" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="properties-list">
                    {connection.properties.length === 0 ? (
                      <p className="muted">No properties imported yet.</p>
                    ) : (
                      connection.properties.map((property) => (
                        <div className="property-row" key={property.id}>
                          <div>
                            <div className="property-title">{property.label || property.siteUrl}</div>
                            <div className="muted small-text">{property.siteUrl}</div>
                            <div className="muted small-text">Permission: {property.permissionLevel || 'unknown'}</div>
                          </div>
                          <div className="property-actions">
                            <form action={`/api/properties/${property.id}/toggle`} method="post">
                              <input
                                type="hidden"
                                name="nextSelected"
                                value={property.isSelected ? 'false' : 'true'}
                              />
                              <button className="button small" type="submit">
                                {property.isSelected ? 'Hide from dashboard' : 'Show on dashboard'}
                              </button>
                            </form>
                            <Link className="button ghost small" href={`/sites/${property.id}`}>
                              Open site
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Selected sites summary</h3>
              <p className="muted">Only properties marked as visible are included in the master dashboard.</p>
            </div>
          </div>

          {selectedProperties.length === 0 ? (
            <EmptyState
              title="No selected properties"
              text="After connecting a Google account, leave a property enabled and it will show up here."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Clicks</th>
                    <th>Impressions</th>
                    <th>CTR</th>
                    <th>Position</th>
                    <th>Δ clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSites.map((site) => (
                    <tr key={site.id}>
                      <td>
                        <Link href={`/sites/${site.id}`}>{site.label}</Link>
                        {site.error ? <div className="small-text bad">{site.error}</div> : null}
                      </td>
                      <td>{formatNumber(site.clicks)}</td>
                      <td>{formatNumber(site.impressions)}</td>
                      <td>{formatPercent(site.ctr)}</td>
                      <td>{formatDecimal(site.position, 2)}</td>
                      <td className={deltaPercent(site.clicks, site.previousClicks) >= 0 ? 'good' : 'bad'}>
                        {formatDecimal(deltaPercent(site.clicks, site.previousClicks), 1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}