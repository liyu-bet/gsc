import type { GoogleSitemapResource } from './google-sitemaps';

export type SitemapUiStatus = 'pending' | 'error' | 'warning' | 'success';

export type SitemapViewModel = {
  path: string;
  type: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  lastSubmittedLabel: string;
  lastDownloadedLabel: string;
  warnings: number;
  errors: number;
  warningsLabel: string;
  errorsLabel: string;
  submittedUrlCount: number;
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

function toSafeNumber(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  try {
    return new Intl.NumberFormat('ru-RU').format(value);
  } catch {
    return String(Math.trunc(value));
  }
}

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
      timeZone,
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
  errors: number;
  warnings: number;
  isPending: boolean;
}): SitemapUiStatus {
  if (input.errors > 0) return 'error';
  if (input.isPending) return 'pending';
  if (input.warnings > 0) return 'warning';
  return 'success';
}

export function sumSubmittedUrls(
  contents: GoogleSitemapResource['contents']
): number {
  if (!Array.isArray(contents)) return 0;
  let total = 0;
  for (const item of contents) {
    // contents[].indexed is deprecated — ignore intentionally.
    total += toSafeNumber(item?.submitted);
  }
  return total;
}

export function toSitemapViewModel(
  resource: GoogleSitemapResource,
  options?: { timeZone?: string }
): SitemapViewModel {
  const warnings = toSafeNumber(resource.warnings);
  const errors = toSafeNumber(resource.errors);
  const isPending = Boolean(resource.isPending);
  const submittedUrlCount = sumSubmittedUrls(resource.contents);
  const status = deriveSitemapStatus({ errors, warnings, isPending });
  const path = resource.path?.trim() || '—';

  return {
    path,
    type: resource.type?.trim() || '—',
    isPending,
    isSitemapsIndex: Boolean(resource.isSitemapsIndex),
    lastSubmitted: resource.lastSubmitted ?? null,
    lastDownloaded: resource.lastDownloaded ?? null,
    lastSubmittedLabel: formatSitemapDate(resource.lastSubmitted, options?.timeZone),
    lastDownloadedLabel: formatSitemapDate(resource.lastDownloaded, options?.timeZone),
    warnings,
    errors,
    warningsLabel: formatCount(warnings),
    errorsLabel: formatCount(errors),
    submittedUrlCount,
    submittedUrlCountLabel: formatCount(submittedUrlCount),
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
