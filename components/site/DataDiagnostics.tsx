export type DiagnosticsPayload = {
  siteUrl: string;
  searchType: string;
  aggregationType?: string | null;
  responseAggregationType?: string | null;
  activeFilters: Record<string, string | undefined>;
  dataState: string;
  dimensions: string[];
  currentWindowStart?: string | null;
  currentWindowEnd?: string | null;
  previousWindowStart?: string | null;
  previousWindowEnd?: string | null;
  latestAvailableHour?: string | null;
  firstIncompleteHour?: string | null;
  fetchedAt: string;
  hourlyRowCount: number;
  totals: {
    clicks: number;
    impressions: number;
    position: number;
  };
};

export function DataDiagnostics({ data }: { data: DiagnosticsPayload }) {
  return (
    <details className="panel site-detail-panel data-diagnostics">
      <summary>Диагностика данных</summary>
      <dl className="diagnostics-grid">
        <div>
          <dt>property siteUrl</dt>
          <dd>{data.siteUrl}</dd>
        </div>
        <div>
          <dt>searchType</dt>
          <dd>{data.searchType}</dd>
        </div>
        <div>
          <dt>aggregationType</dt>
          <dd>{data.aggregationType || '—'}</dd>
        </div>
        <div>
          <dt>responseAggregationType</dt>
          <dd>{data.responseAggregationType || '—'}</dd>
        </div>
        <div>
          <dt>active filters</dt>
          <dd>
            <pre>{JSON.stringify(data.activeFilters, null, 2)}</pre>
          </dd>
        </div>
        <div>
          <dt>API dataState</dt>
          <dd>{data.dataState}</dd>
        </div>
        <div>
          <dt>API dimensions</dt>
          <dd>{data.dimensions.join(', ')}</dd>
        </div>
        <div>
          <dt>current window</dt>
          <dd>
            {data.currentWindowStart || '—'} → {data.currentWindowEnd || '—'}
          </dd>
        </div>
        <div>
          <dt>previous window</dt>
          <dd>
            {data.previousWindowStart || '—'} → {data.previousWindowEnd || '—'}
          </dd>
        </div>
        <div>
          <dt>latestAvailableHour</dt>
          <dd>{data.latestAvailableHour || '—'}</dd>
        </div>
        <div>
          <dt>firstIncompleteHour</dt>
          <dd>{data.firstIncompleteHour || '—'}</dd>
        </div>
        <div>
          <dt>fetchedAt</dt>
          <dd>{data.fetchedAt}</dd>
        </div>
        <div>
          <dt>hourly rows</dt>
          <dd>{data.hourlyRowCount}</dd>
        </div>
        <div>
          <dt>totals</dt>
          <dd>
            clicks={data.totals.clicks}, impressions={data.totals.impressions}, position=
            {data.totals.position.toFixed(2)}
          </dd>
        </div>
      </dl>
    </details>
  );
}
