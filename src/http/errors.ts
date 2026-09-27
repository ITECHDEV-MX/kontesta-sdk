/**
 * Jerarquía de errores del SDK, normalizada desde el cuerpo de error uniforme de la
 * API de Kontesta (`ApiError`):
 *
 *   { statusCode, error, message, requestId }
 *
 * El campo `error` es un **código estable** del catálogo de errores del servidor: la
 * clasificación se hace por ese código y por el status HTTP, NUNCA parseando el `message`.
 */

/** Código estable del catálogo de errores del servidor (campo `error` de `ApiError`). */
export type KontestaErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REUSED'
  | 'TENANT_NOT_RESOLVED'
  | 'TENANT_MISMATCH'
  | 'FORBIDDEN'
  | 'CROSS_TENANT_DENIED'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'FEATURE_NOT_IN_PLAN'
  | 'PAYMENT_REQUIRED'
  | 'TENANT_SUSPENDED'
  | 'PROVIDER_ERROR'
  | 'INVALID_SIGNATURE'
  | 'REPLAY_DETECTED'
  | 'DUPLICATE_EVENT'
  | 'INVALID_OAUTH_STATE'
  | 'WABA_ALREADY_CLAIMED'
  | 'ONBOARDING_FAILED'
  | 'AUTOMATION_INVALID'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'CONFIG_ERROR'
  // Fallback si el servidor devuelve un código aún no listado aquí:
  | (string & {});

export type KontestaErrorKind =
  | 'auth' // 401 → credenciales/API key inválida o revocada → NO retry
  | 'permission' // 403 → scope/plan insuficiente → NO retry
  | 'validation' // 400/422 → parámetro inválido → NO retry
  | 'not_found' // 404 → recurso inexistente → NO retry
  | 'conflict' // 409 → estado en conflicto → NO retry
  | 'rate_limit' // 429 → retry con backoff (retryAfterMs)
  | 'server' // 5xx → retry
  | 'transport' // timeout/conexión (no llegó respuesta) → retry
  | 'unknown';

export interface KontestaErrorInit {
  message: string;
  httpStatus: number;
  /** Código estable del catálogo (`ApiError.error`), si vino. */
  code?: KontestaErrorCode;
  /** Correlación para soporte/logs (`ApiError.requestId`). */
  requestId?: string;
  retryable: boolean;
  /** Sugerencia de espera antes de reintentar (ms), si aplica (429/5xx). */
  retryAfterMs?: number;
  /** Cuerpo crudo de la respuesta de error (para depurar). */
  raw?: unknown;
}

export abstract class KontestaError extends Error {
  abstract readonly kind: KontestaErrorKind;
  readonly httpStatus: number;
  readonly code?: KontestaErrorCode;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly raw?: unknown;

  constructor(init: KontestaErrorInit) {
    super(init.message);
    this.name = new.target.name;
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.requestId = init.requestId;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.raw = init.raw;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      message: this.message,
      httpStatus: this.httpStatus,
      code: this.code,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

export class KontestaAuthError extends KontestaError {
  readonly kind = 'auth' as const;
}
export class KontestaPermissionError extends KontestaError {
  readonly kind = 'permission' as const;
}
export class KontestaValidationError extends KontestaError {
  readonly kind = 'validation' as const;
}
export class KontestaNotFoundError extends KontestaError {
  readonly kind = 'not_found' as const;
}
export class KontestaConflictError extends KontestaError {
  readonly kind = 'conflict' as const;
}
export class KontestaRateLimitError extends KontestaError {
  readonly kind = 'rate_limit' as const;
}
export class KontestaServerError extends KontestaError {
  readonly kind = 'server' as const;
}
export class KontestaTransportError extends KontestaError {
  readonly kind = 'transport' as const;
}
export class KontestaUnknownError extends KontestaError {
  readonly kind = 'unknown' as const;
}

interface ApiErrorBody {
  statusCode?: number;
  error?: string;
  message?: string | string[];
  requestId?: string | null;
}

/** Parsea `Retry-After` (segundos o HTTP-date) a ms. */
function parseRetryAfterHeader(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

/**
 * Normaliza una respuesta de error de la API a una subclase tipada de `KontestaError`.
 * Clasifica por status HTTP (y por el código estable `error` cuando desambigua).
 */
export function fromApiError(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): KontestaError {
  const parsed = (body ?? {}) as ApiErrorBody;
  const code = typeof parsed.error === 'string' ? (parsed.error as KontestaErrorCode) : undefined;
  const requestId = typeof parsed.requestId === 'string' ? parsed.requestId : undefined;
  const message = Array.isArray(parsed.message)
    ? parsed.message.join('; ')
    : parsed.message || (typeof body === 'string' ? body : `Error de la API de Kontesta (HTTP ${status})`);
  const retryAfterMs = parseRetryAfterHeader(headers?.['retry-after']);

  const base = {
    message,
    httpStatus: status,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
    raw: body,
  };

  if (status === 401) return new KontestaAuthError({ ...base, retryable: false });
  if (status === 403) return new KontestaPermissionError({ ...base, retryable: false });
  if (status === 404) return new KontestaNotFoundError({ ...base, retryable: false });
  if (status === 409) return new KontestaConflictError({ ...base, retryable: false });
  if (status === 400 || status === 422) {
    return new KontestaValidationError({ ...base, retryable: false });
  }
  if (status === 429) {
    return new KontestaRateLimitError({
      ...base,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 60_000,
    });
  }
  if (status >= 500 && status <= 599) {
    return new KontestaServerError({
      ...base,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 2_000,
    });
  }
  return new KontestaUnknownError({ ...base, retryable: false });
}

/** Crea un error de transporte (no llegó respuesta del servidor: timeout/conexión). */
export function transportError(message: string, cause?: unknown): KontestaTransportError {
  return new KontestaTransportError({
    message,
    httpStatus: 0,
    retryable: true,
    retryAfterMs: 1_000,
    raw: cause,
  });
}

export function isKontestaError(e: unknown): e is KontestaError {
  return e instanceof KontestaError;
}
