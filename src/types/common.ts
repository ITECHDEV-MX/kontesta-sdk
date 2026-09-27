// Tipos base compartidos por los resource clients.
// Derivados del OpenAPI (`../generated/types.js`) donde el spec los provee.

import type { components, operations } from '../generated/types.js';

/**
 * Página keyset. `nextCursor` es un cursor opaco (base64url); `null` = no hay más.
 *
 * ⚠️ El campo es `items` (NO `data`), igual que la respuesta real del servidor. El
 * OpenAPI describe la respuesta como "Paginated<T>" pero todavía no publica su forma
 * (ver la cabecera de `resources.ts`), así que se fija aquí.
 */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Parámetros de paginación keyset comunes a los listados. */
export interface PageParams {
  /** Tamaño de página (1–100 según endpoint; default del servidor si se omite). */
  limit?: number;
  /** Cursor opaco devuelto por `nextCursor` de la página anterior. */
  cursor?: string;
}

/** Extrae el body JSON tipado de una operación del OpenAPI. */
export type JsonBody<T extends keyof operations> = NonNullable<
  operations[T]['requestBody']
>['content']['application/json'];

/** Extrae los query params tipados de una operación del OpenAPI. */
export type QueryParams<T extends keyof operations> = NonNullable<
  operations[T]['parameters']['query']
>;

/**
 * Unión de tipos de evento de webhook, DERIVADA del OpenAPI
 * (`CreateWebhookDto.events`). Todo el catálogo declarado está GA hoy (el `emit` de
 * un tipo reservado aterrizaría en fases posteriores).
 */
export type WebhookEventType = NonNullable<components['schemas']['CreateWebhookDto']['events']>;

/**
 * Los eventos que SÍ disparan hoy — lo que recibe una suscripción con `events: []`.
 * `handoff.requested` se emite cuando el bot, una regla, un agente o la API piden una
 * persona (payload sin datos personales del contacto: ids, motivo, fechas).
 */
export const GA_WEBHOOK_EVENTS = [
  'message.received',
  'message.status_changed',
  'conversation.assigned',
  'conversation.closed',
  'lead.created',
  'lead.stage_changed',
  'review.obtained',
  'appointment.created',
  'appointment.updated',
  'payment.updated',
  'handoff.requested',
] as const satisfies readonly WebhookEventType[];

/**
 * Eventos OPT-IN: disparan, pero una suscripción con `events: []` NO los recibe; hay que
 * elegirlos por nombre.
 */
export const OPT_IN_WEBHOOK_EVENTS = ['call.ended', 'call.recording_ready'] as const satisfies readonly WebhookEventType[];

/** Resultado de una llamada en `call.ended`. */
export type CallEndedResult = 'answered' | 'missed' | 'rejected' | 'no_answer' | 'failed';

/** Motivo estable de falla en `call.ended`. */
export type CallEndedFailureCode =
  | 'permission_required'
  | 'rate_limited'
  | 'not_callable'
  | 'calling_not_enabled'
  | 'number_suspended'
  | 'payment_method_missing'
  | 'media_failure'
  | 'connect_error'
  | 'sdp_error'
  | 'terminate_not_received'
  | 'unknown';

/**
 * `call.ended` · data v1. Sin audio, transcripción ni SDP. Solo se agregan campos.
 */
export interface CallEndedEventData {
  callId: string;
  channelCallId: string | null;
  channel: 'whatsapp';
  channelAccountId: string;
  businessPhone: string;
  direction: 'inbound' | 'outbound';
  result: CallEndedResult;
  rejectedBy: 'agent' | 'contact' | null;
  failure: { code: CallEndedFailureCode; metaCode: number | null } | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string;
  durationSec: number;
  agent: { userId: string; email: string } | null;
  contact: { contactId: string; phone: string | null; waUserId: string | null };
  conversationId: string;
  lead: { leadId: string; crmExternalId: string | null } | null;
  cost: { billable: boolean; pulses: number; estimated: { amount: string; currency: 'MXN' | 'USD' } | null };
  recording: { requested: boolean };
  transcript: { requested: boolean };
}

/**
 * `call.recording_ready` · data v1. OPT-IN. La liga vence (`expiresAt`): descargue
 * el audio al recibir el evento y no la guarde ni la registre en logs.
 */
export interface CallRecordingReadyEventData {
  callId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  lead: { leadId: string; crmExternalId: string | null } | null;
  recording: { url: string; expiresAt: string; mimeType: string; durationSec: number; sizeBytes: number };
  transcript: { text: string; language: string | null } | null;
}
