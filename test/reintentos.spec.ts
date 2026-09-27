import { describe, expect, it } from 'vitest';

import { Kontesta, KontestaServerError } from '../src/index.js';
import { MAX_RETRY_AFTER_MS } from '../src/http/transport.js';
import { makeMockFetch } from './helpers.js';

// Llave FALSA para las pruebas (no es una credencial).
const API_KEY = 'ktk_prueba00.no-es-una-llave-real';
const ERROR_503 = { status: 503, json: { statusCode: 503, error: 'SERVICE_UNAVAILABLE', message: 'caído' } };

describe('reintentos sin duplicar WhatsApps', () => {
  it('enviar mensaje: reintenta el 503 con la MISMA Idempotency-Key', async () => {
    const { fetch, calls } = makeMockFetch([ERROR_503, { status: 201, json: { id: 'm1' } }]);
    const k = new Kontesta({ apiKey: API_KEY, maxRetries: 2, fetchImpl: fetch });
    await k.conversations.messages.send('c1', { kind: 'text', text: 'hola' });
    expect(calls.length).toBe(2);
    const [a, b] = calls.map((c) => c.headers['idempotency-key'] ?? c.headers['Idempotency-Key']);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });

  it('respeta la Idempotency-Key que pasa el integrador', async () => {
    const { fetch, calls } = makeMockFetch({ status: 201, json: { id: 'm1' } });
    const k = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });
    await k.conversations.messages.send('c1', { kind: 'text', text: 'hola' }, { idempotencyKey: 'mi-llave-1' });
    expect(calls[0]!.headers['idempotency-key'] ?? calls[0]!.headers['Idempotency-Key']).toBe('mi-llave-1');
  });

  it('un POST que el servidor no deduplica NO se reintenta ante 5xx', async () => {
    const { fetch, calls } = makeMockFetch([ERROR_503, { status: 201, json: {} }]);
    const k = new Kontesta({ apiKey: API_KEY, maxRetries: 2, fetchImpl: fetch });
    await expect(k.tags.create({ name: 'vip' })).rejects.toBeInstanceOf(KontestaServerError);
    expect(calls.length).toBe(1);
  });

  it('un POST sí se reintenta ante 429 (el servidor no lo procesó)', async () => {
    const { fetch, calls } = makeMockFetch([
      { status: 429, json: { statusCode: 429, error: 'RATE_LIMITED', message: 'espera' }, headers: { 'retry-after': '0' } },
      { status: 201, json: { id: 't1' } },
    ]);
    const k = new Kontesta({ apiKey: API_KEY, maxRetries: 1, fetchImpl: fetch });
    await k.tags.create({ name: 'vip' });
    expect(calls.length).toBe(2);
  });

  it('un GET sí se reintenta ante 5xx', async () => {
    const { fetch, calls } = makeMockFetch([ERROR_503, { status: 200, json: [] }]);
    const k = new Kontesta({ apiKey: API_KEY, maxRetries: 1, fetchImpl: fetch });
    await k.tags.list();
    expect(calls.length).toBe(2);
  });

  it('el GET no manda Idempotency-Key', async () => {
    const { fetch, calls } = makeMockFetch({ status: 200, json: [] });
    const k = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });
    await k.tags.list();
    expect(calls[0]!.headers['idempotency-key'] ?? calls[0]!.headers['Idempotency-Key']).toBeUndefined();
  });

  it('Retry-After tiene un tope de 60 s', () => {
    expect(MAX_RETRY_AFTER_MS).toBe(60_000);
  });
});

describe('baseUrl solo por https', () => {
  it('rechaza http hacia un host remoto', () => {
    expect(() => new Kontesta({ apiKey: API_KEY, baseUrl: 'http://api.example.test' })).toThrow(/https/);
  });

  it('acepta https', () => {
    expect(() => new Kontesta({ apiKey: API_KEY, baseUrl: 'https://api.example.test' })).not.toThrow();
  });

  it('rechaza http aunque sea el host local', () => {
    expect(() => new Kontesta({ apiKey: API_KEY, baseUrl: 'http://localhost:3001' })).toThrow(/https/);
  });

  it('rechaza una URL inválida', () => {
    expect(() => new Kontesta({ apiKey: API_KEY, baseUrl: 'no es url' })).toThrow(/no es una URL válida/);
  });
});
