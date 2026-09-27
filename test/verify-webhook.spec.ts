import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  constructEvent,
  verifyWebhook,
  WebhookSignatureError,
  type WebhookEventEnvelope,
} from '../src/index.js';

const SECRET = 'whsec_test_secret_do_not_use';

/** Firma un cuerpo como lo haría el worker `webhook-deliver` (header `t=..,v1=..`). */
function sign(rawBody: string, secret: string, ts: number): string {
  const v1 = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

describe('verifyWebhook', () => {
  const now = 1_800_000_000; // segundos epoch fijos para determinismo
  const body = JSON.stringify({ id: 'evt_1', type: 'lead.created', apiVersion: 'v1' });

  it('acepta una firma válida dentro de la tolerancia', () => {
    const header = sign(body, SECRET, now);
    expect(verifyWebhook(body, header, SECRET, { nowSec: now })).toBe(true);
  });

  it('rechaza firma con HMAC alterado', () => {
    const valid = sign(body, SECRET, now);
    // Voltea el último dígito hex del v1 (mismo largo, HMAC distinto).
    const tampered = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0');
    expect(verifyWebhook(body, tampered, SECRET, { nowSec: now })).toBe(false);
  });

  it('rechaza con el secreto equivocado', () => {
    const header = sign(body, SECRET, now);
    expect(verifyWebhook(body, header, 'whsec_otro', { nowSec: now })).toBe(false);
  });

  it('rechaza si el body fue manipulado (firma no cuadra)', () => {
    const header = sign(body, SECRET, now);
    const tampered = body.replace('lead.created', 'lead.stage_changed');
    expect(verifyWebhook(tampered, header, SECRET, { nowSec: now })).toBe(false);
  });

  it('rechaza fuera de la ventana anti-replay (timestamp viejo)', () => {
    const header = sign(body, SECRET, now - 10_000);
    expect(verifyWebhook(body, header, SECRET, { nowSec: now, toleranceSec: 300 })).toBe(false);
  });

  it('rechaza header ausente, malformado o secreto vacío', () => {
    const header = sign(body, SECRET, now);
    expect(verifyWebhook(body, undefined, SECRET, { nowSec: now })).toBe(false);
    expect(verifyWebhook(body, 'no-format', SECRET, { nowSec: now })).toBe(false);
    expect(verifyWebhook(body, header, '', { nowSec: now })).toBe(false);
  });

  it('rechaza timestamp no numérico', () => {
    expect(verifyWebhook(body, 't=abc,v1=deadbeef', SECRET, { nowSec: now })).toBe(false);
  });
});

describe('constructEvent', () => {
  const now = 1_800_000_000;
  const payload = { id: 'evt_9', type: 'lead.stage_changed', apiVersion: 'v1', tenantId: 't1', occurredAt: '2026-07-10T00:00:00Z', data: { leadId: 'l1' } };
  const body = JSON.stringify(payload);

  it('devuelve el sobre tipado cuando la firma es válida', () => {
    const header = sign(body, SECRET, now);
    const evt = constructEvent<{ leadId: string }>(body, header, SECRET, { nowSec: now });
    const typed: WebhookEventEnvelope<{ leadId: string }> = evt;
    expect(typed.id).toBe('evt_9');
    expect(typed.data.leadId).toBe('l1');
  });

  it('lanza WebhookSignatureError con firma inválida', () => {
    expect(() => constructEvent(body, 'bad', SECRET, { nowSec: now })).toThrow(WebhookSignatureError);
  });
});
