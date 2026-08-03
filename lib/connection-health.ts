import type { GoogleConnection, GoogleConnectionStatus } from '@prisma/client';
import { prisma } from './prisma';
import {
  GoogleApiError,
  type GoogleApiErrorCode,
} from './google-errors';
import {
  isBlockedConnectionStatus,
  publicConnectionStatusLabel,
} from './connection-status';

export { isBlockedConnectionStatus, publicConnectionStatusLabel };
export const SUCCESS_WRITE_THROTTLE_MS = 5 * 60 * 1000;

export function shouldPersistSuccessWrite(input: {
  status: GoogleConnectionStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: Date | null;
  lastSuccessAt: Date | null;
  force?: boolean;
  now?: number;
}): boolean {
  if (input.force) return true;
  const needsClear =
    input.status !== 'ACTIVE' ||
    input.lastErrorCode != null ||
    input.lastErrorMessage != null ||
    input.lastErrorAt != null;
  if (needsClear) return true;
  const lastSuccess = input.lastSuccessAt?.getTime() ?? 0;
  const now = input.now ?? Date.now();
  return now - lastSuccess >= SUCCESS_WRITE_THROTTLE_MS;
}

export function connectionStatusFromError(
  error: GoogleApiError
): GoogleConnectionStatus {
  switch (error.code) {
    case 'INVALID_GRANT':
      return 'REVOKED';
    case 'UNAUTHORIZED':
    case 'REAUTH_REQUIRED':
      return 'REAUTH_REQUIRED';
    default:
      return 'ERROR';
  }
}

export async function persistConnectionError(
  connectionId: string,
  error: GoogleApiError
): Promise<void> {
  const status = connectionStatusFromError(error);
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: {
      status,
      lastErrorCode: error.code,
      lastErrorMessage: error.safeMessage,
      lastErrorAt: new Date(),
    },
  });
}

/**
 * Persist ACTIVE + clear errors after a successful Google call.
 *
 * Write-storm prevention: skip the DB write when the connection is already
 * ACTIVE with no error fields and lastSuccessAt was updated within 5 minutes.
 * Force the write after token refresh / sites.list / explicit retry so those
 * paths always clear a prior ERROR and bump lastSuccessAt.
 */
export async function persistConnectionSuccess(
  connectionId: string,
  options?: { force?: boolean; connection?: GoogleConnection }
): Promise<void> {
  const connection =
    options?.connection ||
    (await prisma.googleConnection.findUnique({ where: { id: connectionId } }));
  if (!connection) return;

  if (
    !shouldPersistSuccessWrite({
      status: connection.status,
      lastErrorCode: connection.lastErrorCode,
      lastErrorMessage: connection.lastErrorMessage,
      lastErrorAt: connection.lastErrorAt,
      lastSuccessAt: connection.lastSuccessAt,
      force: options?.force,
    })
  ) {
    return;
  }

  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: {
      status: 'ACTIVE',
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      lastSuccessAt: new Date(),
    },
  });
}

export type PublicConnectionView = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  status: GoogleConnectionStatus;
  statusLabel: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  propertiesCount: number;
  canRetry: boolean;
  canReconnect: boolean;
};

const FORBIDDEN_PUBLIC_KEYS = [
  'encryptedAccess',
  'encryptedRefresh',
  'tokenExpiry',
  'scope',
  'googleUserId',
] as const;

export function serializePublicConnection(input: {
  id: string;
  email: string;
  name: string | null;
  picture?: string | null;
  status: GoogleConnectionStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: Date | null;
  lastSuccessAt: Date | null;
  propertiesCount?: number;
}): PublicConnectionView {
  const view: PublicConnectionView = {
    id: input.id,
    email: input.email,
    name: input.name,
    picture: input.picture ?? null,
    status: input.status,
    statusLabel: publicConnectionStatusLabel(input.status),
    lastErrorCode: input.lastErrorCode,
    lastErrorMessage: input.lastErrorMessage,
    lastErrorAt: input.lastErrorAt ? input.lastErrorAt.toISOString() : null,
    lastSuccessAt: input.lastSuccessAt ? input.lastSuccessAt.toISOString() : null,
    propertiesCount: input.propertiesCount ?? 0,
    canRetry: input.status === 'ERROR',
    canReconnect:
      input.status === 'REVOKED' ||
      input.status === 'REAUTH_REQUIRED' ||
      input.status === 'ERROR',
  };

  for (const key of FORBIDDEN_PUBLIC_KEYS) {
    if (key in (view as Record<string, unknown>)) {
      delete (view as Record<string, unknown>)[key];
    }
  }

  return view;
}

export function assertNoSecretsInJson(payload: unknown): void {
  const raw = JSON.stringify(payload);
  for (const key of [
    'encryptedAccess',
    'encryptedRefresh',
    'tokenExpiry',
    'GOOGLE_CLIENT_SECRET',
    'client_secret',
    'refresh_token',
    'access_token',
  ]) {
    if (raw.includes(key)) {
      throw new Error(`Secret field leaked in public JSON: ${key}`);
    }
  }
}

export function errorCodeNeedsReconnect(code: GoogleApiErrorCode | string | null): boolean {
  return (
    code === 'INVALID_GRANT' ||
    code === 'UNAUTHORIZED' ||
    code === 'REAUTH_REQUIRED'
  );
}
