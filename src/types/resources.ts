/**
 * Shapes de RESPUESTA de la API pública /v1.
 *
 * ── Por qué están escritos a mano (y no generados) ─────────────────────────────
 * El OpenAPI público de Kontesta emite los **request bodies** y **query params** con
 * tipos completos (`components.schemas`), pero las **respuestas** todavía salen como
 * `{}` / `type: object` sin propiedades, igual que el genérico `Paginated<T>`.
 *
 * Mientras el spec no publique los schemas de respuesta, estos tipos se escriben a
 * mano a partir de las respuestas reales de la API. Cuando el spec las emita, se
 * reemplazan por los tipos generados sin romper la superficie pública (solo se estrecha).
 *
 * Los sub-árboles muy anidados y propios del motor interno (condiciones/acciones de
 * automatización, schedule de horario, bloque `config` de integración) se dejan como
 * `unknown` / `Record<string, unknown>` a propósito: no forman parte estable del
 * contrato público y arrastrarían medio grafo de tipos internos.
 */

import type { WebhookEventType } from './common.js';

// ── Conversaciones e inbox ──────────────────────────────

/** Clave de canal en query params (`list({ channel })`, `speedToLead({ channel })`). */
export type ChannelKey = 'whatsapp' | 'instagram' | 'messenger';

/**
 * Capacidades del canal del hilo: pinta el composer y las
 * acciones por capacidad, nunca por `if (channel === …)`. `ops: 'chat_only'` ⇒ agendar/cobrar/lealtad
 * responden 422 `CHANNEL_OPS_UNSUPPORTED`.
 */
export interface ChannelCapabilities {
  ops: 'full' | 'chat_only';
  outOfWindowTemplates: 'none' | 'whatsapp' | 'messenger_utility';
  mediaOut: boolean;
  reactionsOut: boolean;
  deleteInInbox: boolean;
  reopen: 'template' | 'human_agent_7d';
  paidOutOfWindow: 'none' | 'marketing_messages';
  botAllowed: boolean;
  /** IG cuenta BYTES UTF-8 (1000); FB (2000) y WA (4096) caracteres. */
  maxText: { unit: 'bytes' | 'chars'; max: number };
  entryLink: 'wa.me' | 'ig.me' | 'm.me';
}

export interface Conversation {
  id: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER';
  channelAccountId: string;
  capabilities: ChannelCapabilities;
  /** WA: E.164 canónico (52+10 en MX) o BSUID. IG/FB: IGSID/PSID opaco — no es un teléfono. */
  contactExternalId: string;
  contactName: string | null;
  status: 'OPEN' | 'CLOSED';
  assignedTo: { id: string; name: string | null } | null;
  assignedAt: string | null;
  origin: 'DIRECT' | 'CTWA' | 'QR' | 'WALINK' | 'WIDGET' | 'IG_DIRECT' | 'IG_AD' | 'BOOKING' | 'MSGR_DIRECT' | 'MSGR_AD';
  ctwaClid: string | null;
  firstInboundAt: string | null;
  firstResponseAt: string | null;
  firstResponderType: 'BOT' | 'HUMAN' | null;
  lastMessageAt: string;
  lastInboundAt: string | null;
  within24hWindow: boolean;
  unreadCount: number;
  createdAt: string;
  snippet: {
    text: string;
    direction: 'INBOUND' | 'OUTBOUND';
    responder: 'BOT' | 'HUMAN' | null;
  } | null;
  /**
   * Traspaso bot→humano VIGENTE. `null` = sin traspaso. `answeredAt` null ⇒ nadie ha
   * contestado todavía (filtra con `list({ handoff: 'pending' })`).
   */
  handoff?: {
    id: string;
    reason: HandoffReason;
    requestedAt: string;
    answeredAt: string | null;
    outsideHours: boolean;
  } | null;
}

// ── Traspaso bot→humano ────────────────────────────────

export type HandoffReason =
  | 'CUSTOMER_REQUEST'
  | 'NO_KB_MATCH'
  | 'MAX_TURNS'
  | 'NEGATIVE_SENTIMENT'
  | 'PAYMENT_OR_BOOKING'
  | 'PROVIDER_ERROR'
  | 'META_AGENT_REQUEST'
  | 'RULE'
  | 'MANUAL'
  | 'OTHER';
export type HandoffRequester = 'BOT' | 'META_AGENT' | 'AUTOMATION' | 'USER' | 'API';
export type HandoffStatus = 'PENDING' | 'ANSWERED' | 'RETURNED' | 'CLOSED';

/** Episodio de traspaso (`POST/GET /v1/conversations/:id/handoff(s)`). */
export interface Handoff {
  id: string;
  conversationId: string;
  status: HandoffStatus;
  reason: HandoffReason;
  requestedBy: HandoffRequester;
  requestedByUserId: string | null;
  requestedAt: string;
  outsideHours: boolean;
  assignedTo: { id: string; name: string | null } | null;
  assignmentStrategy: string | null;
  summaryNoteId: string | null;
  summaryStatus: 'fallback' | 'ai' | 'ai_failed';
  answeredAt: string | null;
  answeredById: string | null;
  returnedAt: string | null;
  unattendedNotifiedAt: string | null;
  botTurnsBefore: number;
  /** Solo en la respuesta 200 del POST: ya había un episodio pendiente (idempotente). */
  alreadyPending?: boolean;
}

/** Respuesta de `POST /v1/conversations/:id/handoff/return`. */
export interface HandoffReturnResult {
  conversationId: string;
  botState: 'ACTIVE';
  threadOwner: 'KONTESTA' | 'META_AGENT' | 'EXTERNAL_APP';
  returnedHandoffId: string | null;
  changed: boolean;
}

/** `data` del webhook `handoff.requested` — SIN datos del contacto (ids, motivo, fechas). */
export interface HandoffRequestedEventData {
  conversationId: string;
  handoffId: string;
  channel: string;
  reason: HandoffReason;
  requestedBy: HandoffRequester;
  requestedAt: string;
  outsideHours: boolean;
  assignedToId: string | null;
  summaryNoteId: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  payload: unknown;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';
  senderType: 'CONTACT' | 'AGENT' | 'BOT' | 'SYSTEM';
  source: 'API' | 'ECHO' | 'HISTORY';
  sentByUserId: string | null;
  sentAt: string;
  createdAt: string;
  viaPhone: boolean;
}

/** Resultado de `conversations.messages.send` (POST encola el envío). */
export interface SendMessageResult {
  messageId: string;
  conversationId: string;
  status: 'QUEUED';
}

// ── Leads / pipelines ──────────────────────────────────

export interface Lead {
  id: string;
  name: string | null;
  stageId: string;
  position: number;
  assignedTo: { id: string; name: string | null } | null;
  valueMinor: number | null;
  currency: string | null;
  conversationId: string | null;
  origin: string | null;
  firstInboundAt: string | null;
  firstResponseAt: string | null;
  ttfrSeconds: number | null;
  tagIds: string[];
  contactName: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  /** Embudo del lead. */
  pipelineId: string | null;
  /** Cuándo llegó a la etapa actual (ISO). */
  stageChangedAt: string | null;
}

export interface Stage {
  id: string;
  name: string;
  /** Kind canónico (NEW|CONTACTED|QUALIFIED|WON|LOST) — estable para métricas/CRM. */
  kind: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  autoCreateLeads: boolean;
  stages: Stage[];
}

export interface BoardColumn {
  stageId: string;
  cards: Lead[];
  total: number;
}

export interface Board {
  pipeline: Pipeline;
  columns: BoardColumn[];
}

// ── Automatizaciones y tags ───────────────────────

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  /** Disparador de la regla (forma interna del motor; contrato estable = el nombre). */
  trigger: unknown;
  enabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  conditions: unknown;
  actions: unknown[];
  slaMinutes: number | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  ruleId: string;
  dedupeKey: string;
  status: string;
  conversationId: string | null;
  leadId: string | null;
  actionsRun: unknown | null;
  error: string | null;
  createdAt: string;
}

export interface BusinessHours {
  timezone: string;
  /** Schedule por día (forma validada server-side). */
  schedule: Record<string, unknown>;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

// ── Plantillas ─────────────────────────────────────────────────────────────────

/**
 * Plantilla de mensaje. La respuesta todavía no tiene schema publicado, por eso el
 * shape es laxo salvo la identidad. Se estrechará cuando el spec lo emita.
 */
export interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

// ── Métricas speed-to-lead ──────────────────────────────

export interface SpeedToLeadBucket {
  total: number;
  answered: number;
  p50Sec: number | null;
  p90Sec: number | null;
  pctUnder5m: number;
}

export interface SpeedToLeadRawRow {
  conversationId: string;
  firstInboundAt: string;
  firstResponseAt: string | null;
  firstResponderType: string | null;
  firstResponderId: string | null;
}

export interface SpeedToLeadReport {
  /** `channel` presente solo si se pidió `?channel=` (la población queda acotada a ese canal). */
  range: { from: string; to: string; tz: string; channel?: ChannelKey };
  summary: SpeedToLeadBucket;
  byDay: Array<{ day: string } & SpeedToLeadBucket>;
  byAgent: Array<{ userId: string; name: string | null } & SpeedToLeadBucket>;
  byResponder: Array<{ responderType: 'BOT' | 'HUMAN' } & SpeedToLeadBucket>;
  /** Speed-to-lead POR CANAL: siempre las tres claves (bucket vacío = total 0). */
  byChannel: Record<ChannelKey, SpeedToLeadBucket>;
  raw?: SpeedToLeadRawRow[];
}

// ── Webhooks salientes ─────────────────────────────────

export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'EXHAUSTED';

/** Ficha de suscripción. JAMÁS incluye el secreto. */
export interface WebhookSubscription {
  id: string;
  url: string;
  /** `[]` = todos los eventos GA. */
  events: WebhookEventType[];
  enabled: boolean;
  description: string | null;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Respuesta de creación / rotación de secreto: el `secret` (`whsec_...`) se muestra
 * UNA sola vez y es irrecuperable después. Guárdalo para verificar firmas.
 */
export interface CreatedWebhookSubscription extends WebhookSubscription {
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  responseSnippet: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

// ── Integraciones / CRM ──────────────────────────

export interface Integration {
  id: string;
  kind: string;
  purpose: string;
  label: string | null;
  /** Bloque NO-secreto ({url, db} Odoo | {instanceUrl} Salesforce). */
  config: Record<string, unknown>;
  status: string;
  lastCheckAt: string | null;
  /** Saneado (sin credenciales ni IP/puerto interno). */
  lastError: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Resultado de `integrations.test` / `webhooks.ping` (chequeo de conectividad). */
export interface ConnectionTestResult {
  ok: boolean;
  detail?: string;
  [key: string]: unknown;
}
