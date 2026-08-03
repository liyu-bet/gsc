import type { GoogleConnectionStatus } from '@prisma/client';

export function publicConnectionStatusLabel(
  status: GoogleConnectionStatus
): string {
  switch (status) {
    case 'ACTIVE':
      return 'Активно';
    case 'REVOKED':
      return 'Доступ отозван';
    case 'REAUTH_REQUIRED':
      return 'Требуется вход';
    case 'ERROR':
      return 'Временная ошибка';
    default:
      return 'Неизвестно';
  }
}

export function isBlockedConnectionStatus(
  status: GoogleConnectionStatus
): boolean {
  return status === 'REVOKED' || status === 'REAUTH_REQUIRED';
}
