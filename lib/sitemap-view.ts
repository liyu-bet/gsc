import type { GoogleSitemapResource } from './google-sitemaps';

export type SitemapUiStatus = 'pending' | 'error' | 'warning' | 'success';

export type SitemapViewModel = {
  path: string;
  type: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  warningsLabel: string;
  errorsLabel: string;
  warningsGreaterThanZero: boolean;
  errorsGreaterThanZero: boolean;
  submittedUrlCountLabel: string;
  status: SitemapUiStatus;
  statusLabel: string;
};

const STATUS_RANK: Record<SitemapUiStatus, number> = {
  error: 0,
  warning: 1,
  pending: 2,
  success: 3,
};

/** Parse Google int64-like counts without losing precision for large integers. */
export function parseInt64Count(value: string | number | null | undefined): bigint {
  if (value == null || value === '') return 0n;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return 0n;
    if (!Number.isSafeInteger(value)) return 0n;
    return BigInt(value);
  }
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) return 0n;
  try {
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
}

export function formatBigIntCount(value: bigint): string {
  if (value < 0n) return '0';
  const asString = value.toString();
  try {
    // Intl may lose precision for unsafe integers — format digit groups manually for large values.
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return asString.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    }
    return new Intl.NumberFormat('ru-RU').format(Number(value));
  } catch {
    return asString;
  }
}

export function countGreaterThanZero(value: string | number | null | undefined): boolean {
  return parseInt64Count(value) > 0n;
}

/**
 * Format ISO timestamp for display. Pass timeZone for deterministic tests;
 * omit in browser to use the runtime local zone.
 */
export function formatSitemapDate(
  value: string | null | undefined,
  timeZone?: string
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return '—';
  }
}

export function sitemapStatusLabel(status: SitemapUiStatus): string {
  switch (status) {
    case 'pending':
      return 'Обработка';
    case 'error':
      return 'Ошибки';
    case 'warning':
      return 'Предупреждения';
    default:
      return 'Успешно';
  }
}

export function deriveSitemapStatus(input: {
  errorsGreaterThanZero: boolean;
  warningsGreaterThanZero: boolean;
  isPending: boolean;
}): SitemapUiStatus {
  if (input.errorsGreaterThanZero) return 'error';
  if (input.isPending) return 'pending';
  if (input.warningsGreaterThanZero) return 'warning';
  return 'success';
}

export function sumSubmittedUrls(contents: GoogleSitemapResource['contents']): bigint {
  if (!Array.isArray(contents)) return 0n;
  let total = 0n;
  for (const item of contents) {
    // contents[].indexed is deprecated — ignore intentionally.
    total += parseInt64Count(item?.submitted);
  }
  return total;
}

export function toSitemapViewModel(resource: GoogleSitemapResource): SitemapViewModel {
  const warningsGreaterThanZero = countGreaterThanZero(resource.warnings);
  const errorsGreaterThanZero = countGreaterThanZero(resource.errors);
  const isPending = Boolean(resource.isPending);
  const submitted = sumSubmittedUrls(resource.contents);
  const status = deriveSitemapStatus({
    errorsGreaterThanZero,
    warningsGreaterThanZero,
    isPending,
  });
  const path = resource.path?.trim() || '—';

  return {
    path,
    type: resource.type?.trim() || '—',
    isPending,
    isSitemapsIndex: Boolean(resource.isSitemapsIndex),
    lastSubmitted: resource.lastSubmitted ?? null,
    lastDownloaded: resource.lastDownloaded ?? null,
    warningsLabel: formatBigIntCount(parseInt64Count(resource.warnings)),
    errorsLabel: formatBigIntCount(parseInt64Count(resource.errors)),
    warningsGreaterThanZero,
    errorsGreaterThanZero,
    submittedUrlCountLabel: formatBigIntCount(submitted),
    status,
    statusLabel: sitemapStatusLabel(status),
  };
}

export function sortSitemapViewModels(rows: SitemapViewModel[]): SitemapViewModel[] {
  return [...rows].sort((a, b) => {
    const statusDelta = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDelta !== 0) return statusDelta;

    const aSubmitted = a.lastSubmitted ? Date.parse(a.lastSubmitted) : 0;
    const bSubmitted = b.lastSubmitted ? Date.parse(b.lastSubmitted) : 0;
    const aValid = Number.isFinite(aSubmitted) ? aSubmitted : 0;
    const bValid = Number.isFinite(bSubmitted) ? bSubmitted : 0;
    if (aValid !== bValid) return bValid - aValid;

    return a.path.localeCompare(b.path);
  });
}
