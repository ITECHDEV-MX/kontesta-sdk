import type { HttpTransport } from '../http/transport.js';
import type { JsonBody, Paginated, QueryParams } from '../types/common.js';
import type { AddConversationTagInput } from '../types/inputs.js';
import type {
  Conversation,
  Handoff,
  HandoffReturnResult,
  Message,
  SendMessageResult,
} from '../types/resources.js';

export type ListConversationsParams = QueryParams<'ConversationsController_list'>;
export type ListMessagesParams = QueryParams<'ConversationsController_messages'>;
export type UpdateConversationInput = JsonBody<'ConversationsController_update'>;
export type SendMessageInput = JsonBody<'ConversationsController_send'>;
export type RequestHandoffInput = JsonBody<'HandoffController_request'>;

/** Mensajes dentro de una conversación (`conversations.messages`). */
export class MessagesClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/conversations/:id/messages — historial paginado (keyset). */
  list(conversationId: string, params: ListMessagesParams = {}): Promise<Paginated<Message>> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      query: params,
    });
  }

  /**
   * POST /v1/conversations/:id/messages — envía un mensaje (texto o plantilla).
   * Encola el envío y devuelve `{ messageId, conversationId, status: 'QUEUED' }`.
   */
  send(
    conversationId: string,
    body: SendMessageInput,
    opts: { idempotencyKey?: string } = {},
  ): Promise<SendMessageResult> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      json: body,
      // El servidor deduplica este envío por Idempotency-Key: se puede reintentar sin mandar dos WhatsApps.
      idempotent: true,
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
  }
}

/** Etiquetas de una conversación (`conversations.tags`). */
export class ConversationTagsClient {
  constructor(private readonly transport: HttpTransport) {}

  /** POST /v1/conversations/:id/tags — asocia una etiqueta a la conversación. */
  add(conversationId: string, body: AddConversationTagInput): Promise<void> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/conversations/${encodeURIComponent(conversationId)}/tags`,
      json: body,
    });
  }

  /** DELETE /v1/conversations/:id/tags/:tagId — quita la etiqueta. */
  remove(conversationId: string, tagId: string): Promise<void> {
    return this.transport.json({
      method: 'DELETE',
      path: `/v1/conversations/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`,
    });
  }
}

export class ConversationsClient {
  readonly messages: MessagesClient;
  readonly tags: ConversationTagsClient;

  constructor(private readonly transport: HttpTransport) {
    this.messages = new MessagesClient(transport);
    this.tags = new ConversationTagsClient(transport);
  }

  /** GET /v1/conversations — listado paginado (keyset) con filtros. */
  list(params: ListConversationsParams = {}): Promise<Paginated<Conversation>> {
    return this.transport.json({ method: 'GET', path: '/v1/conversations', query: params });
  }

  /**
   * Itera TODAS las conversaciones auto-paginando por `nextCursor`.
   * `for await (const c of kontesta.conversations.iterate({ status: 'open' })) { ... }`
   */
  async *iterate(params: ListConversationsParams = {}): AsyncGenerator<Conversation> {
    let cursor = params.cursor;
    do {
      const page = await this.list({ ...params, ...(cursor ? { cursor } : {}) });
      for (const item of page.items) yield item;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  /** GET /v1/conversations/:id */
  get(id: string): Promise<Conversation> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/conversations/${encodeURIComponent(id)}`,
    });
  }

  /** PATCH /v1/conversations/:id — cambia estado (OPEN/CLOSED) o asignación. */
  update(id: string, body: UpdateConversationInput): Promise<Conversation> {
    return this.transport.json({
      method: 'PATCH',
      path: `/v1/conversations/${encodeURIComponent(id)}`,
      json: body,
    });
  }

  /** POST /v1/conversations/:id/read — marca la conversación como leída. */
  markRead(id: string): Promise<void> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/conversations/${encodeURIComponent(id)}/read`,
    });
  }

  /**
   * POST /v1/conversations/:id/handoff — pide que una persona tome la conversación (tu bot externo
   * devuelve el hilo). Idempotente: si ya había un traspaso pendiente devuelve el vigente con
   * `alreadyPending: true`. La `note` va a la nota interna del equipo, nunca al cliente.
   */
  requestHandoff(id: string, body: RequestHandoffInput = {}): Promise<Handoff> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/conversations/${encodeURIComponent(id)}/handoff`,
      json: body,
    });
  }

  /** POST /v1/conversations/:id/handoff/return — devuelve la conversación al bot (cierra el episodio). */
  returnHandoff(id: string): Promise<HandoffReturnResult> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/conversations/${encodeURIComponent(id)}/handoff/return`,
    });
  }

  /** GET /v1/conversations/:id/handoffs — historial de traspasos (más reciente primero). */
  listHandoffs(id: string): Promise<Handoff[]> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/conversations/${encodeURIComponent(id)}/handoffs`,
    });
  }
}
