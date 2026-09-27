/** Hook de observabilidad de request (el SDK NO loguea por su cuenta). */
export interface RequestInfo {
  method: string;
  url: string;
  attempt: number;
}

/** Hook de observabilidad de response. */
export interface ResponseInfo {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  attempt: number;
  ok: boolean;
}

export interface KontestaConfig {
  /** Llave de API del negocio, con formato `ktk_<prefijo>.<secreto>`. Obligatoria. */
  apiKey: string;
  /** Base URL de la API. Default `https://api.kontesta.app`. */
  baseUrl?: string;
  /** Timeout por request, ms. Default 30000. */
  timeoutMs?: number;
  /** Reintentos automáticos en 429/5xx/transporte (respeta `Retry-After`). Default 2. */
  maxRetries?: number;
  /** Headers extra por request (p. ej. tracing). Nunca sobreescriben `Authorization`. */
  defaultHeaders?: Record<string, string>;
  /** Hook de observabilidad (el SDK no loguea). */
  onRequest?: (info: RequestInfo) => void;
  onResponse?: (info: ResponseInfo) => void;
  /** `fetch` inyectable (tests / undici). Default `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/** Config normalizada consumida por el transporte. */
export interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  defaultHeaders: Record<string, string>;
  onRequest?: (info: RequestInfo) => void;
  onResponse?: (info: ResponseInfo) => void;
  fetchImpl: typeof fetch;
}

export const DEFAULT_BASE_URL = 'https://api.kontesta.app';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;

/** Prefijo del token de API key (formato `ktk_<prefijo>.<secreto>`). */
export const API_KEY_PREFIX = 'ktk_';

export function resolveConfig(config: KontestaConfig): ResolvedConfig {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('[kontesta] apiKey es obligatorio: pasa la llave de API de tu negocio');
  }
  if (!config.apiKey.startsWith(API_KEY_PREFIX)) {
    throw new Error(`[kontesta] apiKey no tiene el formato de una llave de Kontesta ("${API_KEY_PREFIX}<prefijo>.<secreto>")`);
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      '[kontesta] no hay fetch global en este entorno; pasa config.fetchImpl (por ejemplo, el de undici) o usa Node 18.17 o superior',
    );
  }
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  // La llave viaja en cada petición: solo por https.
  let destino: URL;
  try {
    destino = new URL(baseUrl);
  } catch {
    throw new Error(`[kontesta] baseUrl no es una URL válida: ${baseUrl}`);
  }
  if (destino.protocol !== 'https:') {
    throw new Error('[kontesta] baseUrl debe usar https');
  }
  const resolved: ResolvedConfig = {
    apiKey: config.apiKey,
    baseUrl,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    defaultHeaders: config.defaultHeaders ?? {},
    fetchImpl,
  };
  if (config.onRequest) resolved.onRequest = config.onRequest;
  if (config.onResponse) resolved.onResponse = config.onResponse;
  return resolved;
}
