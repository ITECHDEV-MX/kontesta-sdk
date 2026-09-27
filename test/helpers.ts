/** Captura de la última request que armó el SDK, para aserciones. */
export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockFetchOptions {
  status?: number;
  /** Body JSON de la respuesta. */
  json?: unknown;
  /** Headers de respuesta. */
  headers?: Record<string, string>;
}

/**
 * Crea un `fetch` falso que registra cada llamada en `calls` y responde con lo
 * indicado. Si `responses` es un arreglo, responde en secuencia (para reintentos).
 */
export function makeMockFetch(responses: MockFetchOptions | MockFetchOptions[]): {
  fetch: typeof fetch;
  calls: CapturedRequest[];
} {
  const calls: CapturedRequest[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers as Record<string, string> | undefined;
    if (rawHeaders) for (const [k, v] of Object.entries(rawHeaders)) headers[k] = v;

    let body: unknown;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url: url.toString(), method: init?.method ?? 'GET', headers, body });

    const spec = queue.length > 1 ? queue.shift()! : queue[0]!;
    const status = spec.status ?? 200;
    const respHeaders = new Headers(spec.headers ?? {});
    return new Response(spec.json !== undefined ? JSON.stringify(spec.json) : null, {
      status,
      headers: respHeaders,
    });
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls };
}
