// @kontesta/sdk — SDK oficial de TypeScript para la API pública /v1 de Kontesta.
// Cliente tipado + verificación de webhooks. Público y self-serve.

// ── Cliente y factory ──
export { Kontesta, createKontesta } from './client.js';
export { resolveConfig } from './config.js';
export type { KontestaConfig, ResolvedConfig, RequestInfo, ResponseInfo } from './config.js';
export { DEFAULT_BASE_URL, API_KEY_PREFIX } from './config.js';

// ── Resource clients (para tipado / DI fino) ──
export { ConversationsClient, MessagesClient, ConversationTagsClient } from './resources/conversations.js';
export type {
  ListConversationsParams,
  ListMessagesParams,
  UpdateConversationInput,
  SendMessageInput,
  RequestHandoffInput,
} from './resources/conversations.js';
export { LeadsClient } from './resources/leads.js';
export type { ListLeadsParams, BoardParams } from './resources/leads.js';
export { PipelinesClient } from './resources/pipelines.js';
export { AutomationsClient } from './resources/automations.js';
export type { ListRunsParams, SetBusinessHoursInput } from './resources/automations.js';
export { TagsClient } from './resources/tags.js';
export { TemplatesClient } from './resources/templates.js';
export type { CreateTemplateInput } from './resources/templates.js';
export { MetricsClient } from './resources/metrics.js';
export type { SpeedToLeadParams } from './resources/metrics.js';
export { WebhooksClient } from './resources/webhooks.js';
export type { ListDeliveriesParams } from './resources/webhooks.js';
export { IntegrationsClient } from './resources/integrations.js';
export type { CreateIntegrationInput, UpdateIntegrationInput } from './resources/integrations.js';

// ── HTTP / transporte ──
export { HttpTransport } from './http/transport.js';
export type { RequestOptions, RawResponse } from './http/transport.js';

// ── Errores ──
export {
  KontestaError,
  KontestaAuthError,
  KontestaPermissionError,
  KontestaValidationError,
  KontestaNotFoundError,
  KontestaConflictError,
  KontestaRateLimitError,
  KontestaServerError,
  KontestaTransportError,
  KontestaUnknownError,
  fromApiError,
  transportError,
  isKontestaError,
} from './http/errors.js';
export type { KontestaErrorKind, KontestaErrorCode, KontestaErrorInit } from './http/errors.js';

// ── Webhooks (verificación de firma — lo que ejecuta el integrador) ──
export {
  verifyWebhook,
  constructEvent,
  computeWebhookHmac,
  parseWebhookSignatureHeader,
  WebhookSignatureError,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_TOLERANCE_SEC,
} from './webhook/verify.js';
export type { VerifyWebhookOptions, WebhookEventEnvelope } from './webhook/verify.js';

// ── Tipos: entradas (request bodies) ──
export type {
  CreateLeadInput,
  MoveLeadInput,
  CreateStageInput,
  UpdateStageInput,
  CreateTagInput,
  AddConversationTagInput,
  CreateWebhookInput,
  UpdateWebhookInput,
  CreateAutomationInput,
  UpdateAutomationInput,
} from './types/inputs.js';

// ── Tipos: comunes ──
export type { Paginated, PageParams, WebhookEventType, JsonBody, QueryParams, CallEndedEventData, CallEndedResult, CallEndedFailureCode, CallRecordingReadyEventData } from './types/common.js';
export { GA_WEBHOOK_EVENTS, OPT_IN_WEBHOOK_EVENTS } from './types/common.js';

// ── Tipos: recursos (respuestas) ──
export type {
  Conversation,
  Message,
  SendMessageResult,
  Handoff,
  HandoffReason,
  HandoffRequester,
  HandoffStatus,
  HandoffReturnResult,
  HandoffRequestedEventData,
  Lead,
  Stage,
  Pipeline,
  Board,
  BoardColumn,
  Automation,
  AutomationRun,
  BusinessHours,
  Tag,
  Template,
  SpeedToLeadReport,
  SpeedToLeadBucket,
  SpeedToLeadRawRow,
  ChannelKey,
  ChannelCapabilities,
  WebhookSubscription,
  CreatedWebhookSubscription,
  WebhookDelivery,
  WebhookDeliveryStatus,
  Integration,
  ConnectionTestResult,
} from './types/resources.js';

// ── Tipos generados del OpenAPI (acceso avanzado a paths/operations/components) ──
export type { paths, operations, components } from './generated/types.js';
