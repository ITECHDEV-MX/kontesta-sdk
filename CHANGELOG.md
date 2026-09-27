# Changelog de @kontesta/sdk

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado: [semver](https://semver.org/lang/es/),
atado al contrato de llave de la API `/v1` (las operaciones que alcanza una llave de API):

- **Mayor**: el contrato cambió de forma incompatible (se quitó una operación, cambió el scope que exige, apareció un
  parámetro o campo obligatorio, desapareció un evento de webhook). La integración continua del proyecto no deja pasar
  una ruptura sin subir la mayor.
- **Menor**: recursos, métodos, operaciones o eventos nuevos.
- **Parche**: correcciones sin cambio de contrato.

Cada versión se publica en npm desde este repositorio al crear la etiqueta `v<versión>`, con procedencia verificable
(npm provenance).

## [1.0.0] — sin publicar

Primera versión pública.

### Incluye
- Cliente `Kontesta` con los recursos `conversations` (mensajes, etiquetas, traspaso a una persona), `leads`,
  `pipelines`, `automations`, `tags`, `templates`, `metrics`, `webhooks` e `integrations`.
- Autenticación con llave de API (`ktk_…`), reintentos con espera creciente en `429`/`5xx` respetando `Retry-After`,
  errores tipados por código estable y paginación automática por cursor.
- Verificación de firma de webhooks (`verifyWebhook`, `constructEvent`).
- Tipos de petición generados del OpenAPI público de la API de llave (solo las operaciones que alcanza una llave).
- Mensajes de error del SDK en español.
- Reintentos que no duplican mensajes: `POST` y `PATCH` solo se reintentan ante `5xx` o fallas de red cuando el
  servidor los deduplica por `Idempotency-Key` (hoy, enviar un mensaje). Cada llamada que modifica algo lleva su
  `Idempotency-Key`, la misma en todos sus reintentos. `Retry-After` se respeta con un tope de 60 s.
- `baseUrl` solo acepta `https`.
- URL base por defecto: `https://api.kontesta.app`.

### Permisos de la API ajustados antes de la primera publicación
- Enviar un producto, el saldo o el pase de lealtad, o un formulario de WhatsApp, a una conversación, y confirmar
  una cita (`POST …/catalog/send-product`, `…/loyalty/send-balance`, `…/loyalty/send-wallet-pass`, `…/flows`,
  `POST /v1/appointments/{id}/confirm`) ahora exige
  también `messages:send`, porque manda un mensaje al cliente.
- Tres lecturas piden ahora permiso de lectura: `GET /v1/payment-accounts/{id}/webhook-url` (`payments:read`),
  `GET /v1/reputation/connect/{kind}` (`reputation:read`) y `GET /v1/whatsapp/recipient-check` (`messages:read`).
- Sugerir y reescribir respuestas con IA (`GET /v1/ai/suggest`, `POST /v1/ai/rewrite`) exigen `ai:write`, porque
  consumen el cupo de IA de tu cuenta.
