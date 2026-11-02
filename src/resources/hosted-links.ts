import type { HttpTransport } from '../http/transport.js';

/**
 * Ligas hospedadas — flujo tipo 3-D Secure (guía: https://kontesta.mx/integracion).
 *
 * Tu sistema pide una liga de un solo uso, la abre en un popup (o redirige) para que TU cliente complete el flujo en
 * la web de Kontesta, y se entera del resultado por `postMessage`, por consulta (`get`) o por los webhooks
 * `hosted_link.completed` / `hosted_link.failed`. Hoy el único flujo es `whatsapp_onboarding`: conectar el número de
 * WhatsApp del negocio (Embedded Signup de Meta, incluido Coexistence).
 *
 * Scopes: `hostedlinks:write` para crear y cancelar; `hostedlinks:read` para consultar.
 */

export type HostedLinkFlow = 'whatsapp_onboarding';
export type HostedLinkStatus = 'PENDING' | 'OPENED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface CreateHostedLinkInput {
  flow: HostedLinkFlow;
  /** Origen https exacto de la ventana que abre la liga (sin ruta ni barra final). Destino del `postMessage`. */
  returnOrigin?: string;
  /**
   * URL https a la que se redirige al terminar si la liga NO se abrió como popup. Mismo origen que `returnOrigin`
   * (si omites `returnOrigin`, se toma de aquí).
   */
  returnUrl?: string;
  /** Objeto libre (≤ 2 KB en JSON) que vuelve tal cual en `get` y en los webhooks. */
  metadata?: Record<string, unknown>;
  /** Vigencia en segundos: 300–3600 (por defecto 900). */
  ttlSeconds?: number;
  /** `whatsapp_business_app_onboarding` = Coexistence (el número conserva la app WhatsApp Business del teléfono). */
  featureType?: 'whatsapp_business_app_onboarding';
}

/**
 * Resultado de `whatsapp_onboarding`. `phoneNumberId` y `wabaId` son los ids INTERNOS de Kontesta (los que acepta
 * `POST /v1/messaging/send` y devuelve `GET /v1/templates`); `metaPhoneNumberId` / `metaWabaId` son los de Meta.
 */
export interface HostedLinkWhatsappResult {
  phoneNumberId: string | null;
  wabaId: string;
  metaPhoneNumberId: string | null;
  metaWabaId: string;
  displayPhoneNumber: string | null;
}

export interface CreatedHostedLink {
  id: string;
  flow: HostedLinkFlow;
  status: HostedLinkStatus;
  /** Liga a abrir. Contiene el token: se entrega una sola vez; no la guardes ni la registres en logs. */
  url: string;
  expiresAt: string;
}

export interface HostedLink {
  id: string;
  flow: HostedLinkFlow;
  status: HostedLinkStatus;
  expiresAt: string;
  openedAt: string | null;
  completedAt: string | null;
  result: HostedLinkWhatsappResult | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

/** `data` de los webhooks `hosted_link.completed` y `hosted_link.failed`. */
export interface HostedLinkEventData {
  id: string;
  flow: HostedLinkFlow;
  status: 'COMPLETED' | 'FAILED';
  result: HostedLinkWhatsappResult | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

/** Mensaje que la página hospedada manda a `window.opener` (a tu `returnOrigin`). */
export interface HostedLinkPostMessage {
  type: 'kontesta.hosted_link';
  id: string;
  flow: HostedLinkFlow;
  status: 'completed' | 'failed' | 'cancelled';
  result?: HostedLinkWhatsappResult;
}

export class HostedLinksClient {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * POST /v1/hosted-links — emite una liga de un solo uso. El servidor deduplica por `Idempotency-Key`: repetir con la
   * misma clave devuelve la MISMA liga (por eso es seguro reintentar).
   */
  create(body: CreateHostedLinkInput, opts: { idempotencyKey?: string } = {}): Promise<CreatedHostedLink> {
    return this.transport.json({
      method: 'POST',
      path: '/v1/hosted-links',
      json: body,
      idempotent: true,
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
  }

  /** GET /v1/hosted-links/:id — estado y resultado (polling). */
  get(id: string): Promise<HostedLink> {
    return this.transport.json({ method: 'GET', path: `/v1/hosted-links/${encodeURIComponent(id)}` });
  }

  /** POST /v1/hosted-links/:id/cancel — cancela una liga que aún no se usó (PENDING/OPENED). 409 si ya avanzó. */
  cancel(id: string): Promise<HostedLink> {
    return this.transport.json({ method: 'POST', path: `/v1/hosted-links/${encodeURIComponent(id)}/cancel` });
  }
}
