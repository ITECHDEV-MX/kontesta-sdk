import type { HttpTransport } from '../http/transport.js';
import type { JsonBody } from '../types/common.js';
import type { Template } from '../types/resources.js';

export type CreateTemplateInput = JsonBody<'TemplatesController_create'>;

export class TemplatesClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/templates — plantillas de mensaje del tenant. */
  list(): Promise<Template[]> {
    return this.transport.json({ method: 'GET', path: '/v1/templates' });
  }

  /** POST /v1/templates — envía una plantilla a aprobación de Meta. */
  create(body: CreateTemplateInput): Promise<Template> {
    return this.transport.json({ method: 'POST', path: '/v1/templates', json: body });
  }

  /** GET /v1/templates/:id */
  get(id: string): Promise<Template> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/templates/${encodeURIComponent(id)}`,
    });
  }

  /** DELETE /v1/templates/:id */
  remove(id: string): Promise<void> {
    return this.transport.json({
      method: 'DELETE',
      path: `/v1/templates/${encodeURIComponent(id)}`,
    });
  }
}
