import type { HttpTransport } from '../http/transport.js';
import type { Paginated, QueryParams } from '../types/common.js';
import type { CreateAutomationInput, UpdateAutomationInput } from '../types/inputs.js';
import type { Automation, AutomationRun, BusinessHours } from '../types/resources.js';

export type ListRunsParams = QueryParams<'AutomationsController_runs'>;

/**
 * Horario de atención. El body no está en el OpenAPI (validado por zod server-side);
 * `schedule` es un mapa por día validado por el servidor.
 */
export interface SetBusinessHoursInput {
  timezone: string;
  schedule: Record<string, unknown>;
}

export class AutomationsClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/automations — reglas de automatización del tenant. */
  list(): Promise<Automation[]> {
    return this.transport.json({ method: 'GET', path: '/v1/automations' });
  }

  /** POST /v1/automations — crea una regla. */
  create(body: CreateAutomationInput): Promise<Automation> {
    return this.transport.json({ method: 'POST', path: '/v1/automations', json: body });
  }

  /** GET /v1/automations/:id */
  get(id: string): Promise<Automation> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/automations/${encodeURIComponent(id)}`,
    });
  }

  /** PATCH /v1/automations/:id — edita una regla. */
  update(id: string, body: UpdateAutomationInput): Promise<Automation> {
    return this.transport.json({
      method: 'PATCH',
      path: `/v1/automations/${encodeURIComponent(id)}`,
      json: body,
    });
  }

  /** DELETE /v1/automations/:id */
  remove(id: string): Promise<void> {
    return this.transport.json({
      method: 'DELETE',
      path: `/v1/automations/${encodeURIComponent(id)}`,
    });
  }

  /** GET /v1/automations/:id/runs — historial de ejecuciones (paginado keyset). */
  runs(id: string, params: ListRunsParams = {}): Promise<Paginated<AutomationRun>> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/automations/${encodeURIComponent(id)}/runs`,
      query: params,
    });
  }

  /** POST /v1/automations/:id/test — prueba una regla contra datos de muestra. */
  test(id: string, body: Record<string, unknown> = {}): Promise<unknown> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/automations/${encodeURIComponent(id)}/test`,
      json: body,
    });
  }

  /** GET /v1/automations/business-hours — horario de atención del tenant. */
  getBusinessHours(): Promise<BusinessHours> {
    return this.transport.json({ method: 'GET', path: '/v1/automations/business-hours' });
  }

  /** PUT /v1/automations/business-hours — fija el horario de atención. */
  setBusinessHours(body: SetBusinessHoursInput): Promise<BusinessHours> {
    return this.transport.json({
      method: 'PUT',
      path: '/v1/automations/business-hours',
      json: body,
    });
  }
}
