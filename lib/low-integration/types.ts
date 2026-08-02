export type LowHealthResponse = {
  ok: true;
  service: 'gsc';
  generatedAt: string;
};

export type LowPropertyConnection = {
  id: string;
  email: string;
  name: string | null;
};

export type LowPropertyItem = {
  id: string;
  siteUrl: string;
  permissionLevel: string | null;
  label: string | null;
  isSelected: boolean;
  firstSeenAt: string;
  updatedAt: string;
  connection: LowPropertyConnection;
};

export type LowPropertiesResponse = {
  items: LowPropertyItem[];
  nextCursor: string | null;
  generatedAt: string;
};

export type LowLifecycleResponse = {
  propertyId: string;
  siteUrl: string;
  firstImpressionDate: string | null;
  firstClickDate: string | null;
  searchedFrom: string;
  searchedTo: string;
  dateMeaning: 'earliest_available_in_search_console_api';
  generatedAt: string;
};

/** Keys that must never appear in LOW API JSON payloads. */
export const LOW_FORBIDDEN_RESPONSE_KEYS = [
  'encryptedAccess',
  'encryptedRefresh',
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'tokenExpiry',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'ADMIN_PASSWORD',
  'DATABASE_URL',
  'GSC_LOW_API_TOKEN',
  'Authorization',
  'authorization',
] as const;

export function collectJsonKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key);
      collectJsonKeys(child, keys);
    }
  }
  return keys;
}
