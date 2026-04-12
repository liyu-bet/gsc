'use client';

import { useEffect, useMemo, useState } from 'react';

type BrandRow = {
  key: string;
  clicks: number;
  previousClicks: number;
};

const STORAGE_PREFIX = 'gsc-branded-keywords:';

export function BrandedKeywordsPanel({
  propertyId,
  rows,
}: {
  propertyId: string;
  rows: BrandRow[];
}) {
  const storageKey = `${STORAGE_PREFIX}${propertyId}`;
  const [input, setInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setKeywords(parsed.filter((item) => typeof item === 'string'));
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(keywords));
  }, [keywords, storageKey]);

  const branded = useMemo(() => {
    if (!keywords.length) return [];
    const normalized = keywords.map((item) => item.toLowerCase());
    return rows.filter((row) =>
      normalized.some((keyword) => row.key.toLowerCase().includes(keyword))
    );
  }, [rows, keywords]);

  const brandedClicks = branded.reduce((acc, row) => acc + row.clicks, 0);
  const brandedPrevClicks = branded.reduce((acc, row) => acc + row.previousClicks, 0);
  const change =
    !brandedPrevClicks && !brandedClicks
      ? 0
      : !brandedPrevClicks
        ? 100
        : ((brandedClicks - brandedPrevClicks) / brandedPrevClicks) * 100;

  function addKeyword() {
    const value = input.trim().toLowerCase();
    if (!value) return;
    if (keywords.includes(value)) {
      setInput('');
      return;
    }
    setKeywords((prev) => [...prev, value]);
    setInput('');
  }

  function removeKeyword(keyword: string) {
    setKeywords((prev) => prev.filter((item) => item !== keyword));
  }

  return (
    <section className="panel site-detail-panel">
      <div className="mini-tabs">
        <h3>Branded vs non-branded clicks</h3>
        <div>
          <span className="mini-tab active">Trend</span>
          <span className="mini-tab">Comparison</span>
        </div>
      </div>

      {!keywords.length ? (
        <div className="brand-placeholder-box">
          <div className="brand-placeholder-circle">B</div>
          <strong>Missing branded keywords</strong>
          <p className="muted">
            Define your brand keywords to enable this report.
          </p>
        </div>
      ) : (
        <div className="brand-settings-summary">
          <div className="brand-summary-card">
            <span>Branded clicks</span>
            <strong>{formatInt(brandedClicks)}</strong>
            <em className={change >= 0 ? 'good' : 'bad'}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)}%
            </em>
          </div>

          <div className="brand-keywords-cloud">
            {keywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                className="brand-pill"
                onClick={() => removeKeyword(keyword)}
              >
                {keyword} ×
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="brand-settings-box">
        <div className="brand-settings-title">Branded keywords settings</div>
        <div className="brand-settings-row">
          <input
            className="brand-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Add keyword, domain, or brand phrase"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addKeyword();
              }
            }}
          />
          <button type="button" className="button small" onClick={addKeyword}>
            Add
          </button>
        </div>
        <p className="muted small-text">
          Keywords are currently saved in this browser only for this property.
        </p>
      </div>
    </section>
  );
}

function formatInt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}