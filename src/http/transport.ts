import { randomUUID } from 'node:crypto';

import type { ResolvedConfig } from '../config.js';
import { fromApiError, transportError } from './errors.js';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path relativo a `baseUrl`, con slash inicial (p. ej. `/v1/conversations`). */
  path: string;
  /** Query params (se serializan; `undefined` se omite; arrays repiten la clave). */
  query?: Record<string, string | number | boolean | undefined | (string | number)[]>;
  /** Body JSON (escrituras). */
  json?: unknown;
  /**
   * Clave de idempotencia (cabecera `Idempotency-Key`). En POST, PUT, PATCH y DELETE el SDK genera un UUID si no
   * la pasas, y usa la MISMA en todos los reintentos de esa llamada.
   */
  idempotencyKey?: string;
  /**
   * El servidor deduplica este POST/PATCH por `Idempotency-Key` (hoy: enviar mensaje, abrir conversación y
   * `POST /v1/messaging/send`). Solo entonces se reintenta ante 5xx o fallas de red: sin esa garantía, reintentar
   * podría mandar dos veces el mismo WhatsApp.
   */
  idempotent?: boolean;
}

export interface RawResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Tope de espera que el SDK acepta de `Retry-After` (ms). */
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * ¿Se puede repetir esta petición sin riesgo de duplicar su efecto?
 * - GET, PUT y DELETE son idempotentes por definición.
 * - POST y PATCH solo si el servidor deduplica por `Idempotency-Key` (`opts.idempotent`).
 * Un `429` siempre se puede reintentar: el servidor rechazó la petición sin procesarla.
 */
function puedeReintentar(opts: RequestOptions, status: number | 'red'): boolean {
  if (status === 429) return true;
  if (opts.method === 'GET' || opts.method === 'PUT' || opts.method === 'DELETE') return true;
  return opts.idempotent === true;
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function buildUrl(cfg: ResolvedConfig, opts: RequestOptions): string {
  const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
  const url = new URL(`${cfg.baseUrl}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

function backoffMs(attempt: number, retryAfterMs: number | undefined): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, MAX_RETRY_AFTER_MS) + Math.random() * 250;
  const base = Math.min(1000 * 2 ** attempt, 8000);
  return base + Math.random() * 250;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Parsea `Retry-After` (segundos o HTTP-date) a ms. */
function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

/**
 * Transporte tipado sobre `fetch`: arma la URL, inyecta `Authorization: Bearer ktk_...`,
 * aplica timeout y reintenta 429/5xx/transporte con backoff (respeta `Retry-After`).
 * Al agotar la clasificación de error, lanza una subclase de `KontestaError`.
 */
export class HttpTransport {
  constructor(private readonly cfg: ResolvedConfig) {}

  async request<T = unknown>(opts: RequestOptions): Promise<RawResponse<T>> {
    const url = buildUrl(this.cfg, opts);
    let lastErr: unknown;
    // Una sola llave para todos los intentos de ESTA llamada: el servidor reconoce el reintento.
    const idempotencyKey = opts.method === 'GET' ? undefined : (opts.idempotencyKey ?? randomUUID());

    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

      const headers: Record<string, string> = {
        ...this.cfg.defaultHeaders,
        Authorization: `Bearer ${this.cfg.apiKey}`,
        Accept: 'application/json',
      };
      let body: string | undefined;
      if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.json);
      }
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

      this.cfg.onRequest?.({ method: opts.method, url, attempt });
      const startedAt = Date.now();

      let res: Response;
      try {
        res = await this.cfg.fetchImpl(url, {
          method: opts.method,
          headers,
          body,
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        this.cfg.onResponse?.({
          method: opts.method,
          url,
          status: 0,
          durationMs: Date.now() - startedAt,
          attempt,
          ok: false,
        });
        if (attempt < this.cfg.maxRetries && puedeReintentar(opts, 'red')) {
          await sleep(backoffMs(attempt, undefined));
          continue;
        }
        const isAbort = e instanceof Error && e.name === 'AbortError';
        throw transportError(
          isAbort
            ? `[kontesta] la petición se canceló al pasar ${this.cfg.timeoutMs} ms sin respuesta: ${opts.method} ${opts.path}`
            : `[kontesta] no se pudo conectar con la API: ${opts.method} ${opts.path}`,
          e,
        );
      }
      clearTimeout(timer);

      const respHeaders = headersToObject(res.headers);
      this.cfg.onResponse?.({
        method: opts.method,
        url,
        status: res.status,
        durationMs: Date.now() - startedAt,
        attempt,
        ok: res.ok,
      });

      if (RETRYABLE_STATUS.has(res.status) && attempt < this.cfg.maxRetries && puedeReintentar(opts, res.status)) {
        const retryAfterMs = parseRetryAfter(respHeaders['retry-after']);
        // Consumir el body para liberar la conexión antes del retry.
        await res.text().catch(() => undefined);
        await sleep(backoffMs(attempt, retryAfterMs));
        continue;
      }

      if (!res.ok) {
        let errBody: unknown;
        try {
          errBody = await res.json();
        } catch {
          errBody = await res.text().catch(() => undefined);
        }
        throw fromApiError(res.status, errBody, respHeaders);
      }

      // 204 No Content (DELETE) → sin body.
      if (res.status === 204) {
        return { data: undefined as T, status: res.status, headers: respHeaders };
      }
      const data = (await res.json().catch(() => ({}))) as T;
      return { data, status: res.status, headers: respHeaders };
    }

    throw transportError(`[kontesta] se agotaron los reintentos: ${opts.method} ${opts.path}`, lastErr);
  }

  /** Helper: devuelve directamente el body tipado. */
  async json<T = unknown>(opts: RequestOptions): Promise<T> {
    const res = await this.request<T>(opts);
    return res.data;
  }
}
