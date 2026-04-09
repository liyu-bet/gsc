export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

export function formatPercent(value: number): string {
  return `${formatDecimal((value || 0) * 100, 2)}%`;
}

export function deltaPercent(current: number, previous: number): number {
  if (!previous && !current) return 0;
  if (!previous && current > 0) return 100;
  return ((current - previous) / previous) * 100;
}
