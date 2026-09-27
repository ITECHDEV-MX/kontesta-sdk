import { describe, expect, it } from 'vitest';

import {
  Kontesta,
  KontestaAuthError,
  KontestaRateLimitError,
  KontestaValidationError,
  isKontestaError,
} from '../src/index.js';
import { makeMockFetch } from './helpers.js';

// Llave FALSA para las pruebas (no es una credencial): solo tiene la forma ktk_<prefijo>.<secreto>.
const API_KEY = 'ktk_prueba00.no-es-una-llave-real';

describe('Kontesta client — construcción y auth', () => {
  it('rechaza apiKey vacío o sin prefijo ktk_', () => {
    expect(() => new Kontesta({ apiKey: '' })).toThrow(/apiKey es obligatorio/);
    expect(() => new Kontesta({ apiKey: 'nope' })).toThrow(/formato/);
  });

  it('envía Authorization: Bearer ktk_... y arma URL + query correctamente', async () => {
    const { fetch, calls } = makeMockFetch({ json: { items: [], nextCursor: null } });
    const kontesta = new Kontesta({
      apiKey: API_KEY,
      baseUrl: 'https://api.example.test',
      fetchImpl: fetch,
    });

    await kontesta.conversations.list({ status: 'open', limit: 10 });

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.method).toBe('GET');
    expect(req.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(req.headers.Accept).toBe('application/json');
    const url = new URL(req.url);
    expect(url.pathname).toBe('/v1/conversations');
    expect(url.searchParams.get('status')).toBe('open');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('serializa el body JSON y fija Content-Type en escrituras + Idempotency-Key', async () => {
    const { fetch, calls } = makeMockFetch({
      status: 201,
      json: { messageId: 'm1', conversationId: 'c1', status: 'QUEUED' },
    });
    const kontesta = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });

    const res = await kontesta.conversations.messages.send(
      'c1',
      { kind: 'text', text: '¡Hola!' },
      { idempotencyKey: 'idem-123' },
    );

    const req = calls[0]!;
    expect(req.method).toBe('POST');
    expect(new URL(req.url).pathname).toBe('/v1/conversations/c1/messages');
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(req.headers['Idempotency-Key']).toBe('idem-123');
    expect(req.body).toEqual({ kind: 'text', text: '¡Hola!' });
    expect(res.status).toBe('QUEUED');
  });

  it('webhooks.create manda events como ARREGLO (corrige el hueco del spec)', async () => {
    const { fetch, calls } = makeMockFetch({
      status: 201,
      json: { id: 'wh1', url: 'https://x.test/hook', events: ['lead.created'], secret: 'whsec_x' },
    });
    const kontesta = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });

    await kontesta.webhooks.create({
      url: 'https://x.test/hook',
      events: ['lead.created', 'lead.stage_changed'],
    });

    expect(calls[0]!.body).toEqual({
      url: 'https://x.test/hook',
      events: ['lead.created', 'lead.stage_changed'],
    });
  });

  it('encodeURIComponent en path params', async () => {
    const { fetch, calls } = makeMockFetch({ status: 204 });
    const kontesta = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });
    await kontesta.tags.remove('tag/with space');
    expect(new URL(calls[0]!.url).pathname).toBe('/v1/tags/tag%2Fwith%20space');
  });
});

describe('Kontesta client — errores tipados', () => {
  it('401 → KontestaAuthError (no retryable)', async () => {
    const { fetch } = makeMockFetch({
      status: 401,
      json: { statusCode: 401, error: 'UNAUTHENTICATED', message: 'sin credenciales' },
    });
    const kontesta = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });
    await expect(kontesta.leads.list()).rejects.toBeInstanceOf(KontestaAuthError);
  });

  it('400 → KontestaValidationError con code estable y requestId', async () => {
    const { fetch } = makeMockFetch({
      status: 400,
      json: {
        statusCode: 400,
        error: 'VALIDATION_FAILED',
        message: ['name es requerido'],
        requestId: 'req_1',
      },
    });
    const kontesta = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });
    try {
      await kontesta.tags.create({ name: '' });
      throw new Error('debió lanzar');
    } catch (e) {
      expect(isKontestaError(e)).toBe(true);
      const err = e as KontestaValidationError;
      expect(err.kind).toBe('validation');
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(err.requestId).toBe('req_1');
      expect(err.message).toContain('name es requerido');
      expect(err.retryable).toBe(false);
    }
  });

  it('429 → reintenta respetando el status y luego resuelve', async () => {
    const { fetch, calls } = makeMockFetch([
      { status: 429, json: { statusCode: 429, error: 'RATE_LIMITED', message: 'slow down' }, headers: { 'retry-after': '0' } },
      { status: 200, json: [] },
    ]);
    const kontesta = new Kontesta({ apiKey: API_KEY, maxRetries: 1, fetchImpl: fetch });
    const res = await kontesta.tags.list();
    expect(res).toEqual([]);
    expect(calls.length).toBe(2); // 1 reintento
  });

  it('429 sin reintentos disponibles → KontestaRateLimitError con retryAfterMs', async () => {
    const { fetch } = makeMockFetch({
      status: 429,
      json: { statusCode: 429, error: 'RATE_LIMITED', message: 'slow down' },
      headers: { 'retry-after': '30' },
    });
    const kontesta = new Kontesta({ apiKey: API_KEY, maxRetries: 0, fetchImpl: fetch });
    try {
      await kontesta.tags.list();
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(KontestaRateLimitError);
      expect((e as KontestaRateLimitError).retryAfterMs).toBe(30_000);
    }
  });
});

describe('Kontesta client — auto-paginación', () => {
  it('leads.iterate recorre todas las páginas siguiendo nextCursor', async () => {
    const { fetch, calls } = makeMockFetch([
      { json: { items: [{ id: 'l1' }, { id: 'l2' }], nextCursor: 'c2' } },
      { json: { items: [{ id: 'l3' }], nextCursor: null } },
    ]);
    const kontesta = new Kontesta({ apiKey: API_KEY, fetchImpl: fetch });

    const ids: string[] = [];
    for await (const lead of kontesta.leads.iterate({ stageId: 's1' })) ids.push(lead.id);

    expect(ids).toEqual(['l1', 'l2', 'l3']);
    expect(calls.length).toBe(2);
    // Segunda página lleva el cursor de la primera.
    expect(new URL(calls[1]!.url).searchParams.get('cursor')).toBe('c2');
    expect(new URL(calls[0]!.url).searchParams.get('stageId')).toBe('s1');
  });
});
