import { resolveConfig, type KontestaConfig } from './config.js';
import { HttpTransport } from './http/transport.js';
import { AutomationsClient } from './resources/automations.js';
import { ConversationsClient } from './resources/conversations.js';
import { IntegrationsClient } from './resources/integrations.js';
import { LeadsClient } from './resources/leads.js';
import { MetricsClient } from './resources/metrics.js';
import { PipelinesClient } from './resources/pipelines.js';
import { TagsClient } from './resources/tags.js';
import { TemplatesClient } from './resources/templates.js';
import { WebhooksClient } from './resources/webhooks.js';

/**
 * Cliente oficial de la API pública de Kontesta (`/v1`).
 *
 * ```ts
 * const kontesta = new Kontesta({ apiKey: 'ktk_...' });
 * const page = await kontesta.conversations.list({ status: 'open' });
 * await kontesta.conversations.messages.send(convoId, { kind: 'text', text: '¡Hola!' });
 * for await (const lead of kontesta.leads.iterate({ stageId })) console.log(lead.id);
 * ```
 *
 * Autentica con `Authorization: Bearer ktk_...`. Los métodos exponen SOLO la
 * superficie GA de la API (callable por API key); la gestión de llaves, billing y el
 * control-plane requieren sesión humana y no forman parte de este SDK.
 */
export class Kontesta {
  readonly conversations: ConversationsClient;
  readonly leads: LeadsClient;
  readonly pipelines: PipelinesClient;
  readonly automations: AutomationsClient;
  readonly tags: TagsClient;
  readonly templates: TemplatesClient;
  readonly metrics: MetricsClient;
  readonly webhooks: WebhooksClient;
  readonly integrations: IntegrationsClient;

  private readonly transport: HttpTransport;

  constructor(config: KontestaConfig) {
    this.transport = new HttpTransport(resolveConfig(config));
    this.conversations = new ConversationsClient(this.transport);
    this.leads = new LeadsClient(this.transport);
    this.pipelines = new PipelinesClient(this.transport);
    this.automations = new AutomationsClient(this.transport);
    this.tags = new TagsClient(this.transport);
    this.templates = new TemplatesClient(this.transport);
    this.metrics = new MetricsClient(this.transport);
    this.webhooks = new WebhooksClient(this.transport);
    this.integrations = new IntegrationsClient(this.transport);
  }
}

export function createKontesta(config: KontestaConfig): Kontesta {
  return new Kontesta(config);
}
