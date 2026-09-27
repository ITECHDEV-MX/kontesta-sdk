import type { HttpTransport } from '../http/transport.js';
import type { Paginated, QueryParams } from '../types/common.js';
import type { CreateWebhookInput, UpdateWebhookInput } from '../types/inputs.js';
import type {
  CreatedWebhookSubscription,
  WebhookDelivery,
  WebhookSubscription,
} from '../types/resources.js';

export type ListDeliveriesParams = QueryParams<'WebhooksOutController_deliveries'>;

/**
 * Gestión de suscripciones a webhooks SALIENTES (Kontesta → tu endpoint).
 * El `secret` para verificar firmas solo se ve UNA vez, en `create` y `rotateSecret`.
 */
export class WebhooksClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/webhooks — suscripciones del tenant (sin secreto). */
  list(): Promise<WebhookSubscription[]> {
    return this.transport.json({ method: 'GET', path: '/v1/webhooks' });
  }

  /**
   * POST /v1/webhooks — crea una suscripción. La respuesta incluye el `secret`
   * (`whsec_...`) UNA sola vez: guárdalo para `verifyWebhook`.
   */
  create(body: CreateWebhookInput): Promise<CreatedWebhookSubscription> {
    return this.transport.json({ method: 'POST', path: '/v1/webhooks', json: body });
  }

  /** GET /v1/webhooks/:id */
  get(id: string): Promise<WebhookSubscription> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /** PATCH /v1/webhooks/:id — cambia url / eventos / habilitado / descripción. */
  update(id: string, body: UpdateWebhookInput): Promise<WebhookSubscription> {
    return this.transport.json({
      method: 'PATCH',
      path: `/v1/webhooks/${encodeURIComponent(id)}`,
      json: body,
    });
  }

  /** DELETE /v1/webhooks/:id */
  remove(id: string): Promise<void> {
    return this.transport.json({
      method: 'DELETE',
      path: `/v1/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /** GET /v1/webhooks/:id/deliveries — log de entregas (paginado keyset). */
  deliveries(id: string, params: ListDeliveriesParams = {}): Promise<Paginated<WebhookDelivery>> {
    return this.transport.json({
      method: 'GET',
      path: `/v1/webhooks/${encodeURIComponent(id)}/deliveries`,
      query: params,
    });
  }

  /** POST /v1/webhooks/:id/ping — envía un evento `test.ping` firmado al endpoint. */
  ping(id: string): Promise<WebhookDelivery> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/webhooks/${encodeURIComponent(id)}/ping`,
    });
  }

  /**
   * POST /v1/webhooks/:id/rotate-secret — genera un secreto nuevo (visible UNA vez).
   * Firmas viejas dejan de validar; actualiza el secreto guardado.
   */
  rotateSecret(id: string): Promise<CreatedWebhookSubscription> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/webhooks/${encodeURIComponent(id)}/rotate-secret`,
    });
  }

  /** POST /v1/webhooks/deliveries/:id/redeliver — reintenta manualmente una entrega. */
  redeliver(deliveryId: string): Promise<WebhookDelivery> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/webhooks/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
    });
  }
}
