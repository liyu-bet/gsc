/** Pure helpers for URL/localStorage preference rules (tested without DOM). */

export function scrubLegacyDatePreferences(raw: Record<string, unknown>) {
  const next = { ...raw };
  delete next.startDate;
  delete next.endDate;
  delete next.customOpen;
  return next;
}

export function mergePreferenceParams(input: {
  url: Record<string, string | undefined>;
  stored: Record<string, string | undefined>;
  allowedKeys: string[];
}): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.url)) {
    if (value) next[key] = value;
  }

  // URL wins. Never restore date fields from storage.
  const blocked = new Set(['startDate', 'endDate', 'customOpen']);
  for (const key of input.allowedKeys) {
    if (blocked.has(key)) continue;
    if (next[key]) continue;
    if (key === 'period' && input.url.range) continue;
    const storedValue = input.stored[key];
    if (storedValue) next[key] = storedValue;
  }

  return next;
}

export function applyPresetPeriod(period: string) {
  return {
    period,
    range: undefined as string | undefined,
    startDate: undefined as string | undefined,
    endDate: undefined as string | undefined,
  };
}

export function clearDimensionFilters(params: Record<string, string | undefined>) {
  const next = { ...params };
  delete next.query;
  delete next.page;
  delete next.country;
  delete next.device;
  return next;
}
