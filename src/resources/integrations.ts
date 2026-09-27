import type { HttpTransport } from '../http/transport.js';
import type { JsonBody } from '../types/common.js';
import type { ConnectionTestResult, Integration } from '../types/resources.js';

export type CreateIntegrationInput = JsonBody<'IntegrationsController_create'>;
export type UpdateIntegrationInput = JsonBody<'IntegrationsController_update'>;

/** Conexiones a CRM externos (Odoo / Salesforce) por tenant (`ProviderConnection`). */
export class IntegrationsClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/integrations — conexiones del tenant (bloque `config` sin secretos). */
  list(): Promise<Integration[]> {
    return this.transport.json({ method: 'GET', path: '/v1/integrations' });
  }

  /** POST /v1/integrations — crea una conexión (credenciales se cifran server-side). */
  create(body: CreateIntegrationInput): Promise<Integration> {
    return this.transport.json({ method: 'POST', path: '/v1/integrations', json: body });
  }

  /** GET /v1/integrations/:id */
  get(id: string): Promise<Integration> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/integrations/${encodeURIComponent(id)}`,
    });
  }

  /** PATCH /v1/integrations/:id — edita label / config / credenciales / activo. */
  update(id: string, body: UpdateIntegrationInput): Promise<Integration> {
    return this.transport.json({
      method: 'PATCH',
      path: `/v1/integrations/${encodeURIComponent(id)}`,
      json: body,
    });
  }

  /** DELETE /v1/integrations/:id */
  remove(id: string): Promise<void> {
    return this.transport.json({
      method: 'DELETE',
      path: `/v1/integrations/${encodeURIComponent(id)}`,
    });
  }

  /** POST /v1/integrations/:id/test — prueba la conexión al CRM. */
  test(id: string): Promise<ConnectionTestResult> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/integrations/${encodeURIComponent(id)}/test`,
    });
  }
}
