'use client';

export function PeriodFreshness({
  mode,
  currentStart,
  currentEnd,
  latestAvailableHour,
  firstIncompleteHour,
  dailyStart,
  dailyEnd,
  updatedLabel,
}: {
  mode: 'hourly' | 'daily' | 'custom';
  currentStart?: string | null;
  currentEnd?: string | null;
  latestAvailableHour?: string | null;
  firstIncompleteHour?: string | null;
  dailyStart?: string | null;
  dailyEnd?: string | null;
  updatedLabel?: string | null;
}) {
  if (mode === 'hourly' && currentStart && currentEnd) {
    const startLabel = formatRangeBound(currentStart);
    const endLabel = formatRangeBound(currentEnd);
    const availableLabel = latestAvailableHour
      ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(latestAvailableHour)
        )
      : null;

    return (
      <div className="period-range-summary">
        <div>
          Последние доступные 24 часа:
          <br />
          {startLabel} — {endLabel}
        </div>
        <div className="muted">
          {firstIncompleteHour ? 'Данные предварительные · ' : ''}
          {availableLabel ? `Данные доступны по: ${availableLabel}` : null}
          {updatedLabel ? ` · обновлено ${updatedLabel}` : null}
        </div>
      </div>
    );
  }

  if ((mode === 'daily' || mode === 'custom') && dailyStart && dailyEnd) {
    return (
      <div className="period-range-summary">
        <div>
          Период: {dailyStart} — {dailyEnd}
        </div>
      </div>
    );
  }

  return null;
}

function formatRangeBound(isoHour: string) {
  const date = new Date(isoHour);
  if (Number.isNaN(date.getTime())) return isoHour;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
