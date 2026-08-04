import { GoogleApiError, type GoogleApiErrorCode } from './google-errors';

export type SitemapRouteErrorBody = {
  ok: false;
  code: string;
  message: string;
};

export type SitemapRouteErrorMapped = {
  httpStatus: number;
  body: SitemapRouteErrorBody;
};

const CODE_TO_STATUS: Partial<Record<GoogleApiErrorCode, number>> = {
  INVALID_GRANT: 409,
  REAUTH_REQUIRED: 409,
  UNAUTHORIZED: 409,
  INSUFFICIENT_SCOPE: 403,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  UPSTREAM_5XX: 502,
  NETWORK: 502,
  INVALID_RESPONSE: 502,
  CONNECTION_NOT_FOUND: 404,
  UNKNOWN: 502,
};

export function mapSitemapRouteError(error: unknown): SitemapRouteErrorMapped {
  if (error instanceof GoogleApiError) {
    const httpStatus = CODE_TO_STATUS[error.code] ?? 502;
    return {
      httpStatus,
      body: {
        ok: false,
        code: error.code,
        message: error.safeMessage,
      },
    };
  }

  return {
    httpStatus: 502,
    body: {
      ok: false,
      code: 'UNKNOWN',
      message: 'Не удалось выполнить операцию с картами сайта',
    },
  };
}

export function validationRouteError(message: string): SitemapRouteErrorMapped {
  return {
    httpStatus: 400,
    body: {
      ok: false,
      code: 'VALIDATION',
      message,
    },
  };
}
