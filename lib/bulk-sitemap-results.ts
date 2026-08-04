export type BulkSitemapResultStatus = 'submitted' | 'failed' | 'skipped';

export type BulkSitemapResultRow = {
  propertyId: string;
  siteUrl: string;
  sitemapUrl: string | null;
  status: BulkSitemapResultStatus;
  code?: string;
  message?: string;
};

export type BulkSitemapOperationSnapshot = {
  propertyIds: string[];
  relativePath: string;
  domainScheme: 'https' | 'http';
};

/**
 * Merge a failed-only retry into previous results without dropping success/skipped.
 * Order follows originalOrder (selection snapshot); unknown new IDs append deterministically.
 */
export function mergeBulkRetryResults(
  previousResults: BulkSitemapResultRow[],
  retryResults: BulkSitemapResultRow[],
  originalOrder: string[]
): BulkSitemapResultRow[] {
  const byId = new Map<string, BulkSitemapResultRow>();
  for (const row of previousResults) {
    byId.set(row.propertyId, row);
  }
  for (const row of retryResults) {
    byId.set(row.propertyId, row);
  }

  const seen = new Set<string>();
  const ordered: BulkSitemapResultRow[] = [];
  for (const id of originalOrder) {
    const row = byId.get(id);
    if (!row || seen.has(id)) continue;
    ordered.push(row);
    seen.add(id);
  }

  const extras = [...byId.keys()]
    .filter((id) => !seen.has(id))
    .sort((a, b) => a.localeCompare(b));
  for (const id of extras) {
    ordered.push(byId.get(id)!);
  }

  return ordered;
}

export function partitionBulkResults(results: BulkSitemapResultRow[]): {
  submittedIds: string[];
  failedIds: string[];
  skippedIds: string[];
} {
  return {
    submittedIds: results.filter((r) => r.status === 'submitted').map((r) => r.propertyId),
    failedIds: results.filter((r) => r.status === 'failed').map((r) => r.propertyId),
    skippedIds: results.filter((r) => r.status === 'skipped').map((r) => r.propertyId),
  };
}

export function remainingBulkIds(
  snapshotIds: string[],
  attemptedIds: Iterable<string>
): string[] {
  const attempted = new Set(attemptedIds);
  return snapshotIds.filter((id) => !attempted.has(id));
}
