'use client';

import type { GoogleConnectionStatus } from '@prisma/client';
import { publicConnectionStatusLabel } from '@/lib/connection-status';

type ConnectionStatusBadgeProps = {
  status: GoogleConnectionStatus;
  lastSuccessAt?: string | null;
  lastErrorMessage?: string | null;
  compact?: boolean;
};

function StatusIcon({ status }: { status: GoogleConnectionStatus }) {
  if (status === 'ACTIVE') {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
      </svg>
    );
  }
  if (status === 'REVOKED') {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    );
  }
  if (status === 'REAUTH_REQUIRED') {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function formatSuccessAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function ConnectionStatusBadge({
  status,
  lastSuccessAt,
  lastErrorMessage,
  compact = false,
}: ConnectionStatusBadgeProps) {
  const label = publicConnectionStatusLabel(status);
  const successLabel = formatSuccessAt(lastSuccessAt);

  return (
    <div className={`connection-status connection-status-${status.toLowerCase()}${compact ? ' connection-status-compact' : ''}`}>
      <span className="connection-status-main">
        <StatusIcon status={status} />
        <span>{label}</span>
      </span>
      {!compact && status === 'ACTIVE' && successLabel ? (
        <span className="connection-status-meta muted small-text">
          Последний успешный запрос: {successLabel}
        </span>
      ) : null}
      {!compact && status === 'ERROR' && lastErrorMessage ? (
        <span className="connection-status-meta muted small-text">{lastErrorMessage}</span>
      ) : null}
    </div>
  );
}
