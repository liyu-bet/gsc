'use client';

import { useEffect, useMemo, useState } from 'react';

type QueryRow = {
  key: string;
  clicks: number;
  previousClicks: number;
};

export function BrandedKeywordsPanel({
  propertyId,
  rows,
}: {
  propertyId: string;
  rows: QueryRow[];
}) {
  const storageKey = `gsc-branded-keywords:${propertyId}`;
  const [keywords, setKeywords] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) || '';
    setKeywords(stored);
    setDraft(stored);
  }, [storageKey]);

  const parsed = useMemo(
    () => keywords.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
    [keywords]
  );

  const summary = useMemo(() => {
    if (!parsed.length) return null;
    const branded = rows.filter((row) => parsed.some((keyword) => row.key.toLowerCase().includes(keyword)));
    const brandedClicks = branded.reduce((acc, row) => acc + row.clicks, 0);
    const brandedPrevious = branded.reduce((acc, row) => acc + row.previousClicks, 0);
    const totalClicks = rows.reduce((acc, row) => acc + row.clicks, 0);
    const totalPrevious = rows.reduce((acc, row) => acc + row.previousClicks, 0);
    const nonBrandedClicks = Math.max(totalClicks - brandedClicks, 0);
    const nonBrandedPrevious = Math.max(totalPrevious - brandedPrevious, 0);

    return {
      brandedClicks,
      brandedPrevious,
      nonBrandedClicks,
      nonBrandedPrevious,
    };
  }, [parsed, rows]);

  function saveKeywords() {
    const next = draft.trim();
    window.localStorage.setItem(storageKey, next);
    setKeywords(next);
    setEditing(false);
  }

  return (
    <section className="panel site-detail-panel branded-placeholder">
      <div className="mini-tabs">
        <h3>Брендовые и небрендовые клики</h3>
        <div>
          <span className="mini-tab active">Тренд</span>
          <span className="mini-tab">Сравнение</span>
        </div>
      </div>

      {!summary ? (
        <div className="brand-placeholder-box">
          <div className="brand-placeholder-circle">B</div>
          <strong>Не заданы брендовые ключевые слова</strong>
          <p className="muted">Укажите бренд-запросы, чтобы включить этот отчёт для текущего ресурса.</p>
          {editing ? (
            <div className="branded-editor">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="aviamasters, avia masters, avia-masters"
              />
              <div className="branded-editor-actions">
                <button type="button" className="button small" onClick={saveKeywords}>
                  Сохранить
                </button>
                <button type="button" className="button ghost small" onClick={() => setEditing(false)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="mini-link-button" onClick={() => setEditing(true)}>
              Задать
            </button>
          )}
        </div>
      ) : (
        <div className="branded-summary-grid">
          <div className="site-top-card">
            <span>Брендовые клики</span>
            <strong>{summary.brandedClicks.toLocaleString('ru-RU')}</strong>
            <em className={summary.brandedClicks - summary.brandedPrevious >= 0 ? 'good' : 'bad'}>
              {formatPercent(summary.brandedClicks, summary.brandedPrevious)}
            </em>
          </div>
          <div className="site-top-card">
            <span>Небрендовые клики</span>
            <strong>{summary.nonBrandedClicks.toLocaleString('ru-RU')}</strong>
            <em className={summary.nonBrandedClicks - summary.nonBrandedPrevious >= 0 ? 'good' : 'bad'}>
              {formatPercent(summary.nonBrandedClicks, summary.nonBrandedPrevious)}
            </em>
          </div>
          <div className="brand-keywords-list">
            <span className="muted">Ключевые слова</span>
            <p>{parsed.join(', ')}</p>
            <button type="button" className="mini-link-button" onClick={() => setEditing((value) => !value)}>
              {editing ? 'Закрыть настройки' : 'Настройки'}
            </button>
            {editing ? (
              <div className="branded-editor">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
                <div className="branded-editor-actions">
                  <button type="button" className="button small" onClick={saveKeywords}>
                    Сохранить
                  </button>
                  <button type="button" className="button ghost small" onClick={() => setEditing(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function formatPercent(current: number, previous: number) {
  if (!previous && !current) return '0.0%';
  if (!previous && current > 0) return '+100.0%';
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}
