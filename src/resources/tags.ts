import type { HttpTransport } from '../http/transport.js';
import type { CreateTagInput } from '../types/inputs.js';
import type { Tag } from '../types/resources.js';

export class TagsClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/tags — catálogo de etiquetas del tenant. */
  list(): Promise<Tag[]> {
    return this.transport.json({ method: 'GET', path: '/v1/tags' });
  }

  /** POST /v1/tags — crea una etiqueta. */
  create(body: CreateTagInput): Promise<Tag> {
    return this.transport.json({ method: 'POST', path: '/v1/tags', json: body });
  }

  /** DELETE /v1/tags/:id */
  remove(id: string): Promise<void> {
    return this.transport.json({ method: 'DELETE', path: `/v1/tags/${encodeURIComponent(id)}` });
  }
}
