import type { HttpTransport } from '../http/transport.js';
import type { Paginated, QueryParams } from '../types/common.js';
import type { CreateLeadInput, MoveLeadInput } from '../types/inputs.js';
import type { Board, Lead } from '../types/resources.js';

export type ListLeadsParams = QueryParams<'LeadsController_list'>;
export type BoardParams = QueryParams<'LeadsController_board'>;

export class LeadsClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/leads — listado paginado (keyset), filtrable por etapa/asignado. */
  list(params: ListLeadsParams = {}): Promise<Paginated<Lead>> {
    return this.transport.json({ method: 'GET', path: '/v1/leads', query: params });
  }

  /**
   * Itera TODOS los leads auto-paginando por `nextCursor`.
   * `for await (const lead of kontesta.leads.iterate({ stageId })) { ... }`
   */
  async *iterate(params: ListLeadsParams = {}): AsyncGenerator<Lead> {
    let cursor = params.cursor;
    do {
      const page = await this.list({ ...params, ...(cursor ? { cursor } : {}) });
      for (const item of page.items) yield item;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  /** GET /v1/leads/board — tablero kanban (pipeline + columnas con tarjetas). */
  board(params: BoardParams = {}): Promise<Board> {
    return this.transport.json({ method: 'GET', path: '/v1/leads/board', query: params });
  }

  /** POST /v1/leads — alta manual de lead. */
  create(body: CreateLeadInput = {}): Promise<Lead> {
    return this.transport.json({ method: 'POST', path: '/v1/leads', json: body });
  }

  /** PATCH /v1/leads/:id — mover de etapa, reordenar, asignar o valorar. */
  move(id: string, body: MoveLeadInput): Promise<Lead> {
    return this.transport.json({
      method: 'PATCH',
      path: `/v1/leads/${encodeURIComponent(id)}`,
      json: body,
    });
  }
}
