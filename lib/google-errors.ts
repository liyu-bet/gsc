export type GoogleApiErrorCode =
  | 'INVALID_GRANT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INSUFFICIENT_SCOPE'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_5XX'
  | 'NETWORK'
  | 'INVALID_RESPONSE'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_ERROR'
  | 'REAUTH_REQUIRED'
  | 'UNKNOWN';

export class GoogleApiError extends Error {
  code: GoogleApiErrorCode;
  status?: number;
  retryable: boolean;
  safeMessage: string;

  constructor(input: {
    code: GoogleApiErrorCode;
    safeMessage: string;
    status?: number;
    retryable?: boolean;
  }) {
    super(input.safeMessage);
    this.name = 'GoogleApiError';
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.safeMessage = input.safeMessage;
  }
}

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /access_token["']?\s*[:=]\s*["'][^"']+/gi,
  /refresh_token["']?\s*[:=]\s*["'][^"']+/gi,
  /client_secret["']?\s*[:=]\s*["'][^"']+/gi,
  /ya29\.[A-Za-z0-9._\-]+/g,
  /1\/\/[A-Za-z0-9_\-]+/g,
];

const QUOTA_REASONS = new Set([
  'dailylimitexceeded',
  'dailylimitexceededunreg',
  'quotaexceeded',
  'limitexceeded',
  'servinglimitexceeded',
  'variabletermexpireddailyexceeded',
  'variabletermlimitexceeded',
]);

const RATE_REASONS = new Set([
  'ratelimitexceeded',
  'ratelimitexceededunreg',
  'userratelimitexceeded',
  'userratelimitexceededunreg',
]);

const FORBIDDEN_SCOPE_REASONS = new Set(['insufficientpermissions']);

export function redactSecrets(text: string): string {
  let next = text;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, '[REDACTED]');
  }
  // Drop obvious HTML dumps and truncate long payloads.
  if (/<\/?[a-z][\s\S]*>/i.test(next)) {
    return '[REDACTED_HTML]';
  }
  if (next.length > 280) {
    return `${next.slice(0, 280)}…`;
  }
  return next;
}

function safeSnippet(text: string): string {
  return redactSecrets(text).replace(/\s+/g, ' ').trim();
}

function parseOAuthErrorBody(bodyText: string): { error?: string; error_description?: string } {
  try {
    const parsed = JSON.parse(bodyText) as { error?: string; error_description?: string };
    return {
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
      error_description:
        typeof parsed.error_description === 'string' ? parsed.error_description : undefined,
    };
  } catch {
    return {};
  }
}

/** Extract Google API `error.errors[].reason` values (and top-level reason if present). */
export function extractGoogleErrorReasons(bodyText: string): string[] {
  if (!bodyText.trim()) return [];
  try {
    const parsed = JSON.parse(bodyText) as {
      error?:
        | string
        | {
            errors?: Array<{ reason?: string }>;
            reason?: string;
            message?: string;
            code?: number;
          };
      reason?: string;
    };

    const reasons: string[] = [];
    if (typeof parsed.reason === 'string') reasons.push(parsed.reason);

    if (parsed.error && typeof parsed.error === 'object') {
      if (typeof parsed.error.reason === 'string') reasons.push(parsed.error.reason);
      if (Array.isArray(parsed.error.errors)) {
        for (const item of parsed.error.errors) {
          if (item && typeof item.reason === 'string') reasons.push(item.reason);
        }
      }
    }

    return [...new Set(reasons.map((r) => r.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function normalizeReason(reason: string): string {
  return reason.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mentionsInsufficientScopeText(bodyText: string): boolean {
  const lower = bodyText.toLowerCase();
  return (
    (lower.includes('insufficient') && lower.includes('scope')) ||
    lower.includes('accessnotconfigured') ||
    lower.includes('insufficient authentication scopes')
  );
}

function classifyByReasons(reasons: string[]): GoogleApiErrorCode | null {
  const normalized = reasons.map(normalizeReason);
  if (normalized.some((r) => QUOTA_REASONS.has(r))) return 'QUOTA_EXCEEDED';
  if (normalized.some((r) => RATE_REASONS.has(r))) return 'RATE_LIMITED';
  if (normalized.some((r) => FORBIDDEN_SCOPE_REASONS.has(r))) return 'INSUFFICIENT_SCOPE';
  return null;
}

export function classifyGoogleHttpError(input: {
  status: number;
  bodyText?: string;
  context?: 'token_refresh' | 'api';
}): GoogleApiError {
  const bodyText = input.bodyText || '';
  const oauth = parseOAuthErrorBody(bodyText);
  const context = input.context || 'api';
  const reasons = extractGoogleErrorReasons(bodyText);

  if (context === 'token_refresh') {
    if (
      (input.status === 400 || input.status === 401) &&
      (oauth.error === 'invalid_grant' || bodyText.toLowerCase().includes('invalid_grant'))
    ) {
      return new GoogleApiError({
        code: 'INVALID_GRANT',
        status: input.status,
        retryable: false,
        safeMessage: 'Доступ отозван — переподключите аккаунт',
      });
    }

    if (input.status === 400 || input.status === 401) {
      return new GoogleApiError({
        code: 'UNAUTHORIZED',
        status: input.status,
        retryable: false,
        safeMessage: 'Не удалось обновить доступ Google. Требуется повторный вход.',
      });
    }
  }

  if (input.status === 401) {
    return new GoogleApiError({
      code: 'UNAUTHORIZED',
      status: 401,
      retryable: false,
      safeMessage: 'Требуется повторный вход в аккаунт Google',
    });
  }

  if (input.status === 403) {
    const byReason = classifyByReasons(reasons);
    if (byReason === 'QUOTA_EXCEEDED') {
      return new GoogleApiError({
        code: 'QUOTA_EXCEEDED',
        status: 403,
        retryable: true,
        safeMessage: 'Исчерпана квота Google API. Повторите позже.',
      });
    }
    if (byReason === 'RATE_LIMITED') {
      return new GoogleApiError({
        code: 'RATE_LIMITED',
        status: 403,
        retryable: true,
        safeMessage: 'Слишком много запросов к Google. Повторите позже.',
      });
    }
    if (byReason === 'INSUFFICIENT_SCOPE' || mentionsInsufficientScopeText(bodyText)) {
      return new GoogleApiError({
        code: 'INSUFFICIENT_SCOPE',
        status: 403,
        retryable: false,
        safeMessage: 'Недостаточно прав Google для этой операции',
      });
    }
    return new GoogleApiError({
      code: 'FORBIDDEN',
      status: 403,
      retryable: false,
      safeMessage: 'Google отклонил запрос (нет доступа к ресурсу)',
    });
  }

  if (input.status === 429) {
    const byReason = classifyByReasons(reasons);
    if (byReason === 'QUOTA_EXCEEDED') {
      return new GoogleApiError({
        code: 'QUOTA_EXCEEDED',
        status: 429,
        retryable: true,
        safeMessage: 'Исчерпана квота Google API. Повторите позже.',
      });
    }
    return new GoogleApiError({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      safeMessage: 'Слишком много запросов к Google. Повторите позже.',
    });
  }

  if (input.status >= 500) {
    return new GoogleApiError({
      code: 'UPSTREAM_5XX',
      status: input.status,
      retryable: true,
      safeMessage: 'Временная ошибка Google. Повторите позже.',
    });
  }

  return new GoogleApiError({
    code: 'UNKNOWN',
    status: input.status,
    retryable: input.status >= 500,
    safeMessage: `Ошибка Google API (${input.status})`,
  });
}

export function classifyNetworkError(error: unknown): GoogleApiError {
  return new GoogleApiError({
    code: 'NETWORK',
    retryable: true,
    safeMessage: 'Сетевая ошибка при обращении к Google',
  });
}

export function classifyInvalidResponse(detail?: string): GoogleApiError {
  return new GoogleApiError({
    code: 'INVALID_RESPONSE',
    retryable: false,
    safeMessage: detail
      ? `Некорректный ответ Google: ${safeSnippet(detail)}`
      : 'Некорректный ответ Google',
  });
}

export function connectionNotFoundError(): GoogleApiError {
  return new GoogleApiError({
    code: 'CONNECTION_NOT_FOUND',
    retryable: false,
    safeMessage: 'Подключение не найдено',
  });
}

export function reauthRequiredError(safeMessage = 'Требуется повторный вход в аккаунт Google'): GoogleApiError {
  return new GoogleApiError({
    code: 'REAUTH_REQUIRED',
    retryable: false,
    safeMessage,
  });
}

export function statusLabel(code: GoogleApiErrorCode | string | null | undefined): string {
  switch (code) {
    case 'INVALID_GRANT':
      return 'Доступ отозван — переподключите аккаунт';
    case 'UNAUTHORIZED':
    case 'REAUTH_REQUIRED':
      return 'Требуется вход';
    case 'INSUFFICIENT_SCOPE':
      return 'Недостаточно прав';
    case 'FORBIDDEN':
      return 'Нет доступа';
    case 'RATE_LIMITED':
      return 'Лимит запросов';
    case 'QUOTA_EXCEEDED':
      return 'Квота исчерпана';
    case 'UPSTREAM_5XX':
    case 'NETWORK':
      return 'Временная ошибка';
    case 'CONNECTION_NOT_FOUND':
      return 'Подключение не найдено';
    default:
      return 'Ошибка Google';
  }
}
