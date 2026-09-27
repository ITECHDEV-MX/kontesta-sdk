/**
 * Verificación de firma de los webhooks SALIENTES de Kontesta — lo que ejecuta el
 * INTEGRADOR para confiar en lo que Kontesta le envía.
 *
 * Es la misma verificación que usa el servidor para firmar. Sin dependencias: solo
 * `node:crypto`.
 *
 * Esquema con timestamp anti-replay (familiar tipo Stripe):
 *
 *   firma = HMAC-SHA256(`${timestamp}.${rawBody}`, secret)   →  header `t=<unix>,v1=<hex>`
 *
 * ⚠️ `rawBody` DEBE ser el cuerpo crudo EXACTO recibido (los bytes que llegaron), no
 * un JSON reparseado y re-serializado: cualquier reordenamiento invalida la firma.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { WebhookEventType } from '../types/common.js';

/** Nombre del header de firma que envía Kontesta. */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Kontesta-Signature';
/** Tolerancia por defecto del anti-replay de la firma (segundos). */
export const WEBHOOK_SIGNATURE_TOLERANCE_SEC = 300;

/** Sobre canónico entregado a cada suscripción. */
export interface WebhookEventEnvelope<T = unknown> {
  /** cuid estable = idempotencia del consumidor. */
  id: string;
  type: WebhookEventType;
  apiVersion: 'v1';
  tenantId: string;
  /** ISO-8601. */
  occurredAt: string;
  data: T;
}

export interface VerifyWebhookOptions {
  /** Tolerancia anti-replay en segundos (default 300). */
  toleranceSec?: number;
  /** Reloj actual en segundos (inyectable para tests). Default ahora. */
  nowSec?: number;
}

/** Se lanza cuando `constructEvent` no puede verificar la firma o parsear el sobre. */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
    Object.setPrototypeOf(this, WebhookSignatureError.prototype);
  }
}

/** Comparación HMAC en tiempo constante (hex). `false` si longitudes distintas/vacías. */
function safeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** HMAC-SHA256 de `${timestamp}.${rawBody}` en hex. */
export function computeWebhookHmac(rawBody: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/** Parsea el header `t=<unix>,v1=<hex>`. `null` si el formato es inválido. */
export function parseWebhookSignatureHeader(
  header: string | undefined | null,
): { t: string; v1: string } | null {
  if (!header) return null;
  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (k === 't') t = val;
    else if (k === 'v1') v1 = val;
  }
  if (!t || !v1) return null;
  return { t, v1 };
}

/**
 * Verifica la firma `X-Kontesta-Signature` de un webhook entregado por Kontesta.
 * Devuelve `true` SOLO si el HMAC coincide (`timingSafeEqual`) Y el timestamp está
 * dentro de la ventana anti-replay. Nunca lanza.
 *
 * @param rawBody         Cuerpo crudo EXACTO recibido (string).
 * @param signatureHeader Valor del header `X-Kontesta-Signature` (`t=..,v1=..`).
 * @param secret          Secreto de la suscripción (`whsec_...`).
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined | null,
  secret: string,
  opts: VerifyWebhookOptions = {},
): boolean {
  if (!secret) return false;
  const parsed = parseWebhookSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const toleranceSec = opts.toleranceSec ?? WEBHOOK_SIGNATURE_TOLERANCE_SEC;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const t = Number(parsed.t);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;

  const expected = computeWebhookHmac(rawBody, t, secret);
  return safeEqualHex(parsed.v1, expected);
}

/**
 * Verifica la firma y devuelve el sobre parseado y tipado. Lanza
 * `WebhookSignatureError` si la firma es inválida o el cuerpo no es JSON válido.
 * Un `try/catch` alrededor de esta llamada es todo lo que el integrador necesita.
 */
export function constructEvent<T = unknown>(
  rawBody: string,
  signatureHeader: string | undefined | null,
  secret: string,
  opts: VerifyWebhookOptions = {},
): WebhookEventEnvelope<T> {
  if (!verifyWebhook(rawBody, signatureHeader, secret, opts)) {
    throw new WebhookSignatureError('La firma del webhook no es válida o su marca de tiempo está fuera de la ventana permitida (protección contra reenvíos)');
  }
  try {
    return JSON.parse(rawBody) as WebhookEventEnvelope<T>;
  } catch {
    throw new WebhookSignatureError('El cuerpo del webhook no es JSON válido');
  }
}
