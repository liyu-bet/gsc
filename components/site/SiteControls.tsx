'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { searchTypeLabel } from '@/lib/ui-labels';
import { PERIOD_PRESETS, periodToQueryParams, type PeriodId } from '@/lib/periods';

const SEARCH_TYPES = ['web', 'discover', 'news', 'image', 'video'] as const;
const STORAGE_KEY = 'gsk-site-workspace-preferences';
const GLOBAL_STORAGE_KEY = 'gsk-global-preferences';
const CHART_METRICS_KEY = 'gsk-site-chart-metrics';

const PRIMARY_CHIPS = PERIOD_PRESETS.filter((item) =>
  ['24h', '7d', '28d', '90d', 'custom'].includes(item.id)
);

function scrubLegacyDatePrefs(raw: Record<string, unknown>) {
  const next = { ...raw };
  delete next.startDate;
  delete next.endDate;
  delete next.customOpen;
  return next;
}

export function SiteControls({
  currentPeriodId,
  currentSearchType,
  currentStartDate,
  currentEndDate,
  compare,
  isCustom,
  rangeSummary,
  freshnessSummary,
  clearFiltersHref,
}: {
  currentPeriodId: string;
  currentSearchType: string;
  currentStartDate?: string;
  currentEndDate?: string;
  compare: boolean;
  isCustom: boolean;
  rangeSummary?: string | null;
  freshnessSummary?: string | null;
  clearFiltersHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = useMemo(() => searchParams.toString(), [searchParams]);
  const [draftStart, setDraftStart] = useState(currentStartDate || '');
  const [draftEnd, setDraftEnd] = useState(currentEndDate || '');
  const [customOpen, setCustomOpen] = useState(isCustom);
  const [lastPreset, setLastPreset] = useState<string>(
    currentPeriodId === 'custom' ? '28d' : currentPeriodId || '28d'
  );

  useEffect(() => {
    setDraftStart(currentStartDate || '');
    setDraftEnd(currentEndDate || '');
    setCustomOpen(isCustom);
    if (currentPeriodId !== 'custom') setLastPreset(currentPeriodId);
  }, [currentStartDate, currentEndDate, isCustom, currentPeriodId]);

  useEffect(() => {
    const payload = scrubLegacyDatePrefs({
      period: currentPeriodId,
      searchType: currentSearchType,
      compare: compare ? '1' : '0',
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      GLOBAL_STORAGE_KEY,
      JSON.stringify({
        period: currentPeriodId === 'custom' ? lastPreset : currentPeriodId,
        searchType: currentSearchType,
      })
    );

    // One-time cleanup of legacy date keys from older builds.
    try {
      const legacy = window.localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as Record<string, unknown>;
        if ('startDate' in parsed || 'endDate' in parsed || 'customOpen' in parsed) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scrubLegacyDatePrefs(parsed)));
        }
      }
    } catch {
      // ignore
    }
  }, [currentPeriodId, currentSearchType, compare, lastPreset]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    let changed = false;

    // Normalize legacy range=1 → period=24h and strip restored custom dates when a preset is active.
    if (!params.get('period') && params.get('range') === '1') {
      params.set('period', '24h');
      params.delete('range');
      params.delete('startDate');
      params.delete('endDate');
      changed = true;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = scrubLegacyDatePrefs(JSON.parse(raw) as Record<string, unknown>) as Record<
          string,
          string
        >;
        for (const key of ['period', 'searchType', 'compare'] as const) {
          if (!params.get(key) && stored[key]) {
            // Never restore dates. Never restore period over an explicit range except via normalize above.
            if (key === 'period' && params.get('range')) continue;
            params.set(key, stored[key]);
            changed = true;
          }
        }
      }

      const globalRaw = window.localStorage.getItem(GLOBAL_STORAGE_KEY);
      if (globalRaw) {
        const storedGlobal = scrubLegacyDatePrefs(JSON.parse(globalRaw) as Record<string, unknown>) as Record<
          string,
          string
        >;
        for (const key of ['period', 'searchType'] as const) {
          if (!params.get(key) && !params.get('range') && storedGlobal[key]) {
            params.set(key, storedGlobal[key]);
            changed = true;
          }
        }
      }
    } catch {
      // ignore
    }

    if (changed) {
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname);
    }
  }, [pathname, queryString, router]);

  function updateParams(nextValues: Record<string, string | undefined>) {
    const params = new URLSearchParams(queryString);
    for (const [key, value] of Object.entries(nextValues)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function selectPeriod(periodId: PeriodId) {
    if (periodId === 'custom') {
      setCustomOpen(true);
      updateParams({
        period: 'custom',
        range: undefined,
        startDate: draftStart || currentStartDate || undefined,
        endDate: draftEnd || currentEndDate || undefined,
      });
      return;
    }

    setCustomOpen(false);
    setLastPreset(periodId);
    const resolved =
      periodId === '24h'
        ? ({ id: '24h', mode: 'hourly', compareDefault: false } as const)
        : ({ id: periodId, mode: 'daily', days: 28, compareDefault: true } as const);
    updateParams({
      ...periodToQueryParams(resolved),
      // Keep compare as-is unless switching to 24h with no explicit compare — leave URL compare untouched.
    });
  }

  function applyCustom() {
    if (!draftStart || !draftEnd) return;
    updateParams({
      period: 'custom',
      range: undefined,
      startDate: draftStart,
      endDate: draftEnd,
    });
  }

  function cancelCustom() {
    setCustomOpen(false);
    const fallback = (lastPreset === 'custom' ? '28d' : lastPreset) as PeriodId;
    selectPeriod(fallback === 'custom' ? '28d' : fallback);
  }

  return (
    <div className="site-controls-wrap">
      <div className="site-controls site-controls-compact">
        <div className="period-chip-row" role="group" aria-label="Период">
          {PRIMARY_CHIPS.map((chip) => {
            const active = chip.id === 'custom' ? customOpen || isCustom : currentPeriodId === chip.id && !isCustom;
            return (
              <button
                key={chip.id}
                type="button"
                className={`period-chip ${active ? 'active' : ''}`}
                onClick={() => selectPeriod(chip.id)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="site-control-group site-control-inline">
          <label htmlFor="site-search-type">Тип поиска</label>
          <select
            id="site-search-type"
            className="site-control-select"
            value={currentSearchType}
            onChange={(event) => updateParams({ searchType: event.target.value })}
          >
            {SEARCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {searchTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <label className="compare-toggle">
          <input
            type="checkbox"
            checked={compare}
            onChange={(event) => updateParams({ compare: event.target.checked ? '1' : '0' })}
          />
          <span>Сравнить</span>
        </label>

        <a className="button ghost small" href={clearFiltersHref}>
          Сбросить фильтры
        </a>
      </div>

      {customOpen ? (
        <div className="site-controls site-controls-custom">
          <div className="site-control-group">
            <label htmlFor="site-start-date">Дата начала</label>
            <input
              id="site-start-date"
              className="site-control-select"
              type="date"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
            />
          </div>
          <div className="site-control-group">
            <label htmlFor="site-end-date">Дата окончания</label>
            <input
              id="site-end-date"
              className="site-control-select"
              type="date"
              value={draftEnd}
              onChange={(event) => setDraftEnd(event.target.value)}
            />
          </div>
          <div className="site-control-group">
            <label>&nbsp;</label>
            <div className="site-control-actions">
              <button type="button" className="button small" onClick={applyCustom} disabled={!draftStart || !draftEnd}>
                Применить
              </button>
              <button type="button" className="button ghost small" onClick={cancelCustom}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rangeSummary ? (
        <div className="period-range-summary">
          <div>{rangeSummary}</div>
          {freshnessSummary ? <div className="muted">{freshnessSummary}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export { CHART_METRICS_KEY };
