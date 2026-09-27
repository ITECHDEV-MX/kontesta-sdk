/**
 * Shapes de ENTRADA (request bodies).
 *
 * Regla: donde el OpenAPI declara el body con un DTO (`components.schemas`), el tipo
 * se DERIVA del spec vía `JsonBody<...>` (ver los resource clients). Los tipos de este
 * archivo cubren dos huecos del spec:
 *
 *  1. **Endpoints con body pero SIN schema en el OpenAPI** — usan validación zod
 *     (`@Body() body: unknown`) en vez de DTOs class-validator, así que el plugin
 *     Swagger de NestJS no emite su request body: `POST /v1/leads`, `PATCH /v1/leads/:id`,
 *     `POST /v1/pipelines/:id/stages`, `POST /v1/tags`, `POST /v1/conversations/:id/tags`.
 *     Se tipan aquí a mano, con la misma validación que aplica el servidor.
 *  2. **`events` de webhooks** — el spec lo declara como `string` (enum simple), pero el
 *     contrato real es un ARREGLO `WebhookEventType[]`. Se corrige aquí.
 */

import type { WebhookEventType } from './common.js';

// ── Leads / pipelines (body no emitido por el spec) ────────────────────────────

export interface CreateLeadInput {
  name?: string | null;
  conversationId?: string | null;
  stageId?: string;
  assignedToId?: string | null;
  valueMinor?: number | null;
}

/**
 * Mover / asignar / valorar un lead. La POSICIÓN se calcula server-side desde
 * `beforeLeadId`/`afterLeadId` (el cliente nunca manda un float). `stageId` requerido
 * al cambiar de columna.
 */
export interface MoveLeadInput {
  stageId?: string;
  beforeLeadId?: string | null;
  afterLeadId?: string | null;
  assignedToId?: string | null;
  valueMinor?: number | null;
  /**
   * Precondición de concurrencia: la etapa (o el valor) que crees que tiene el lead. Si ya no coincide, el API
   * responde 409 `LEAD_CHANGED` con `{ lead, lastChange }` y no escribe nada. Omitirlas = sin precondición.
   */
  expectedStageId?: string | null;
  expectedValueMinor?: number | null;
}

export interface CreateStageInput {
  name: string;
  kind: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';
  position?: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface UpdateStageInput {
  name?: string;
  position?: number;
  isWon?: boolean;
  isLost?: boolean;
}

// ── Tags (body no emitido por el spec) ─────────────────────────────────────────

export interface CreateTagInput {
  name: string;
  /** Hex `#rrggbb` o null. */
  color?: string | null;
}

export interface AddConversationTagInput {
  tagId: string;
}

// ── Webhooks (corrige `events: string` → `WebhookEventType[]`) ──────────────────

export interface CreateWebhookInput {
  url: string;
  /** Eventos a los que suscribirse. `[]` u omitido = todos los eventos GA. */
  events?: WebhookEventType[];
  description?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: WebhookEventType[];
  enabled?: boolean;
  description?: string;
}

/**
 * Alta/edición de una regla de automatización. El motor de reglas tiene un contrato de
 * entrada extenso (trigger/conditions/actions anidados) que el spec no emite y que no
 * pertenece a la superficie pública estable; se acepta como objeto validado server-side.
 */
export type CreateAutomationInput = Record<string, unknown>;
export type UpdateAutomationInput = Record<string, unknown>;
