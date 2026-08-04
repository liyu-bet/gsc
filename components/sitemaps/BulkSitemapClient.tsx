'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { resolveBulkRelativePath } from '@/lib/sitemap-validation';

export type BulkPropertyRow = {
  id: string;
  siteUrl: string;
  label: string | null;
  permissionLevel: string | null;
  accountEmail: string;
  eligible: boolean;
  ineligibleReason: string | null;
};

type BulkResultRow = {
  propertyId: string;
  siteUrl: string;
  sitemapUrl: string | null;
  status: 'submitted' | 'failed' | 'skipped';
  code?: string;
  message?: string;
};

const MAX_SELECTION = 250;
const BATCH_SIZE = 25;

export function BulkSitemapClient({ properties }: { properties: BulkPropertyRow[] }) {
  const [relativePath, setRelativePath] = useState('sitemap.xml');
  const [domainScheme, setDomainScheme] = useState<'https' | 'http'>('https');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [stopRequested, setStopRequested] = useState(false);
  const stopRef = useRef(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<BulkResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    stopRef.current = stopRequested;
  }, [stopRequested]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => {
      const hay = `${p.label || ''} ${p.siteUrl} ${p.accountEmail}`.toLowerCase();
      return hay.includes(q);
    });
  }, [properties, search]);

  const eligibleIds = useMemo(
    () => filtered.filter((p) => p.eligible).map((p) => p.id),
    [filtered]
  );

  const selectedEligible = useMemo(
    () => [...selected].filter((id) => properties.find((p) => p.id === id)?.eligible),
    [selected, properties]
  );

  const previews = useMemo(() => {
    return selectedEligible.map((id) => {
      const property = properties.find((p) => p.id === id)!;
      const resolved = resolveBulkRelativePath(property.siteUrl, relativePath, {
        domainScheme,
      });
      return { property, resolved };
    });
  }, [selectedEligible, properties, relativePath, domainScheme]);

  const invalidPreviewCount = previews.filter((p) => !p.resolved.ok).length;

  function toggle(id: string, eligible: boolean) {
    if (!eligible) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTION) next.add(id);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligibleIds.slice(0, MAX_SELECTION)));
  }

  function clearSelection() {
    setSelected(new Set());
    setConfirmed(false);
  }

  async function runBatches(ids: string[]) {
    setRunning(true);
    setStopRequested(false);
    stopRef.current = false;
    setProgress({ completed: 0, total: ids.length });
    const collected: BulkResultRow[] = [];

    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      if (stopRef.current) break;
      const batch = ids.slice(offset, offset + BATCH_SIZE);
      try {
        const response = await fetch('/api/sitemaps/bulk-submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            propertyIds: batch,
            relativePath,
            domainScheme,
          }),
        });
        const data = (await response.json()) as {
          ok?: boolean;
          message?: string;
          results?: BulkResultRow[];
        };
        if (!response.ok || !data.ok || !Array.isArray(data.results)) {
          for (const propertyId of batch) {
            const property = properties.find((p) => p.id === propertyId);
            collected.push({
              propertyId,
              siteUrl: property?.siteUrl || '',
              sitemapUrl: null,
              status: 'failed',
              code: 'BATCH_ERROR',
              message: data.message || 'Ошибка batch-запроса',
            });
          }
        } else {
          collected.push(...data.results);
        }
      } catch {
        for (const propertyId of batch) {
          const property = properties.find((p) => p.id === propertyId);
          collected.push({
            propertyId,
            siteUrl: property?.siteUrl || '',
            sitemapUrl: null,
            status: 'failed',
            code: 'NETWORK',
            message: 'Сетевая ошибка batch-запроса',
          });
        }
      }
      setResults([...collected]);
      setProgress({ completed: collected.length, total: ids.length });
    }

    setRunning(false);
    queueMicrotask(() => summaryRef.current?.focus());
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || running || selectedEligible.length === 0 || invalidPreviewCount > 0) {
      return;
    }
    const validIds = previews.filter((p) => p.resolved.ok).map((p) => p.property.id);
    startTransition(async () => {
      setResults([]);
      await runBatches(validIds);
    });
  }

  function retryFailed() {
    const failedIds = results.filter((r) => r.status === 'failed').map((r) => r.propertyId);
    if (failedIds.length === 0 || running) return;
    startTransition(async () => {
      await runBatches(failedIds);
    });
  }

  const submitted = results.filter((r) => r.status === 'submitted').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  return (
    <div className="bulk-sitemaps">
      <form className="panel site-detail-panel" onSubmit={onSubmit}>
        <div className="sitemap-submit-grid">
          <label className="sitemap-field">
            <span>Относительный путь карты сайта</span>
            <input
              type="text"
              value={relativePath}
              onChange={(e) => setRelativePath(e.target.value)}
              disabled={running}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="sitemap-field">
            <span>Схема для domain-ресурсов</span>
            <select
              value={domainScheme}
              onChange={(e) => setDomainScheme(e.target.value === 'http' ? 'http' : 'https')}
              disabled={running}
            >
              <option value="https">https</option>
              <option value="http">http</option>
            </select>
          </label>
          <label className="sitemap-field">
            <span>Поиск</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="label / URL / аккаунт"
              disabled={running}
            />
          </label>
        </div>

        <div className="header-actions" style={{ marginTop: 12 }}>
          <button type="button" className="button ghost small" onClick={selectAllEligible} disabled={running}>
            Выбрать все eligible
          </button>
          <button type="button" className="button ghost small" onClick={clearSelection} disabled={running}>
            Сбросить выбор
          </button>
          <span className="muted" aria-live="polite">
            Выбрано: {selectedEligible.length} / макс. {MAX_SELECTION}
          </span>
        </div>

        <div className="sitemap-table-wrap" style={{ marginTop: 16 }}>
          <table className="sitemap-table">
            <thead>
              <tr>
                <th scope="col">Выбор</th>
                <th scope="col">Ресурс</th>
                <th scope="col">Аккаунт</th>
                <th scope="col">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((property) => (
                <tr key={property.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(property.id)}
                      disabled={!property.eligible || running}
                      onChange={() => toggle(property.id, property.eligible)}
                      aria-label={`Выбрать ${property.label || property.siteUrl}`}
                    />
                  </td>
                  <td className="sitemap-url-cell" title={property.siteUrl}>
                    <strong>{property.label || property.siteUrl}</strong>
                    <div className="muted small-text">{property.siteUrl}</div>
                  </td>
                  <td>{property.accountEmail}</td>
                  <td>
                    {property.eligible ? (
                      <span className="muted">Можно отправить</span>
                    ) : (
                      <span className="sitemap-notice-error">{property.ineligibleReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 20 }}>Preview</h3>
        {selectedEligible.length === 0 ? (
          <p className="muted">Выберите ресурсы для предпросмотра итоговых URL.</p>
        ) : (
          <ul className="bulk-preview-list">
            {previews.map(({ property, resolved }) => (
              <li key={property.id}>
                <span className="muted">{property.label || property.siteUrl}</span>
                {' → '}
                {resolved.ok ? (
                  <code title={resolved.sitemapUrl}>{resolved.sitemapUrl}</code>
                ) : (
                  <span className="sitemap-notice-error">{resolved.message}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <label className="sitemap-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={running || selectedEligible.length === 0}
          />
          <span>
            Я подтверждаю отправку {selectedEligible.length} карт сайта в Google Search Console
          </span>
        </label>

        <div className="header-actions">
          <button
            className="button"
            type="submit"
            disabled={
              running ||
              pending ||
              !confirmed ||
              selectedEligible.length === 0 ||
              invalidPreviewCount > 0
            }
          >
            {running ? 'Отправка…' : 'Отправить выбранные'}
          </button>
          {running ? (
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                setStopRequested(true);
                stopRef.current = true;
              }}
            >
              Остановить перед следующим batch
            </button>
          ) : null}
        </div>
      </form>

      <section className="panel site-detail-panel" aria-live="polite">
        <div
          ref={summaryRef}
          tabIndex={-1}
          className="bulk-summary"
        >
          <h3>Прогресс и результаты</h3>
          <p>
            Выполнено: {progress.completed} / {progress.total || selectedEligible.length || 0}
          </p>
          {results.length > 0 ? (
            <p>
              Успешно: {submitted} · Ошибки: {failed} · Пропущено: {skipped}
            </p>
          ) : (
            <p className="muted">Результаты появятся после запуска отправки.</p>
          )}
        </div>

        {failed > 0 && !running ? (
          <button type="button" className="button ghost" onClick={retryFailed}>
            Повторить только failed
          </button>
        ) : null}

        {results.length > 0 ? (
          <div className="sitemap-table-wrap" style={{ marginTop: 12 }}>
            <table className="sitemap-table">
              <thead>
                <tr>
                  <th scope="col">Ресурс</th>
                  <th scope="col">Sitemap URL</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Сообщение</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={`${row.propertyId}-${row.status}-${row.sitemapUrl || ''}`}>
                    <td className="sitemap-url-cell" title={row.siteUrl}>
                      {row.siteUrl || row.propertyId}
                    </td>
                    <td className="sitemap-url-cell" title={row.sitemapUrl || ''}>
                      {row.sitemapUrl || '—'}
                    </td>
                    <td>{row.status}</td>
                    <td>{row.message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
