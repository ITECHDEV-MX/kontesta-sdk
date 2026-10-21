# @kontesta/sdk

SDK oficial de TypeScript para la **API pública `/v1` de Kontesta**. Con él, tu sistema
lee y contesta conversaciones de WhatsApp, mueve leads por tu embudo y recibe los eventos
de tu negocio en tu propio backend, con la firma verificada.

- **Tipado de punta a punta**: los cuerpos de petición y los parámetros de consulta salen
  del contrato OpenAPI de Kontesta.
- **Sin dependencias en tiempo de ejecución**: usa el `fetch` global y `node:crypto`.
- **Reintentos que no duplican mensajes**: espera creciente en `429` y `5xx`, respetando `Retry-After`
  (hasta 60 s), y solo donde repetir la petición es seguro.
- **Errores tipados** por código estable, no por el texto del mensaje.
- **Paginación automática** con `for await` sobre cursores.

> Requiere Node 18.17 o superior (o cualquier entorno con `fetch` global). El verificador
> de webhooks usa `node:crypto`, así que corre en Node.

Guía completa de la API: <https://kontesta.mx/integracion>

---

## Instalación

```bash
npm install @kontesta/sdk
# o
pnpm add @kontesta/sdk
```

## Tu llave de API

1. Entra a Kontesta con una cuenta de administrador de tu negocio.
2. Ve a **Ajustes → Llaves de API** y toca **Generar llave**. Dale solo los permisos que
   tu integración necesita.
3. Copia la llave en ese momento: **se muestra una sola vez**. Tiene el formato
   `ktk_<prefijo>.<secreto>` y el SDK la manda como `Authorization: Bearer ktk_...`.

> Trata la llave como una contraseña: cárgala de una variable de entorno o de tu gestor de
> secretos, nunca la escribas en el código ni la subas al repositorio. Si se filtra,
> revócala en la misma pantalla y genera otra.

```ts
import { Kontesta } from '@kontesta/sdk';

const kontesta = new Kontesta({
  apiKey: process.env.KONTESTA_API_KEY!, // 'ktk_...'
  // timeoutMs: 30000, // tiempo máximo por petición
  // maxRetries: 2,    // reintentos en 429/5xx
});
```

## Ejemplo mínimo

```ts
// Conversaciones abiertas, de 20 en 20
const page = await kontesta.conversations.list({ status: 'open', limit: 20 });
console.log(page.items, page.nextCursor);

// Contestar con un mensaje de texto. Si tu sistema repite la llamada (por ejemplo, al
// reprocesar un trabajo), pasa tu propia clave: el servidor no manda el mensaje dos veces.
await kontesta.conversations.messages.send(
  conversationId,
  { kind: 'text', text: '¡Hola! ¿En qué te ayudamos?' },
  { idempotencyKey: `pedido-${pedidoId}-aviso-envio` },
);

// Recorrer todos los leads de una etapa (pagina solo)
for await (const lead of kontesta.leads.iterate({ stageId })) {
  console.log(lead.id, lead.name);
}

// Pasar un lead a la siguiente etapa
await kontesta.leads.move(leadId, { stageId: nextStageId });

// Velocidad de respuesta: qué porcentaje de conversaciones tuvo primera respuesta en menos de 5 minutos
const report = await kontesta.metrics.speedToLead({ from, to });
console.log(report.summary.pctUnder5m);
```

## Paginación

Los listados devuelven `{ items, nextCursor }`. Pasa `nextCursor` como `cursor` para pedir
la siguiente página, o usa `iterate(...)` para recorrer todo:

```ts
// A mano
let cursor: string | undefined;
do {
  const page = await kontesta.leads.list({ stageId, cursor });
  handle(page.items);
  cursor = page.nextCursor ?? undefined;
} while (cursor);

// Automático (conversaciones y leads tienen iterate())
for await (const c of kontesta.conversations.iterate({ status: 'all' })) handle(c);
```

## Manejo de errores

Toda respuesta que no sea 2xx lanza una subclase de `KontestaError`, ya clasificada:

```ts
import { KontestaRateLimitError, KontestaValidationError, isKontestaError } from '@kontesta/sdk';

try {
  await kontesta.tags.create({ name: '' });
} catch (err) {
  if (err instanceof KontestaValidationError) {
    console.error(err.code, err.message); // por ejemplo, 'VALIDATION_FAILED'
  } else if (err instanceof KontestaRateLimitError) {
    await sleep(err.retryAfterMs ?? 60_000);
  } else if (isKontestaError(err)) {
    console.error(err.kind, err.httpStatus, err.requestId);
  }
}
```

| Clase | HTTP | `kind` | Se reintenta |
|---|---|---|---|
| `KontestaAuthError` | 401 | `auth` | no |
| `KontestaPermissionError` | 403 | `permission` | no |
| `KontestaValidationError` | 400/422 | `validation` | no |
| `KontestaNotFoundError` | 404 | `not_found` | no |
| `KontestaConflictError` | 409 | `conflict` | no |
| `KontestaRateLimitError` | 429 | `rate_limit` | sí, solo |
| `KontestaServerError` | 5xx | `server` | según el método (ver abajo) |
| `KontestaTransportError` | — | `transport` | según el método (ver abajo) |

### Qué se reintenta

El SDK reintenta solo, hasta `maxRetries`, cuando repetir la petición no puede duplicar
nada:

- `429`: siempre. El servidor rechazó la petición sin procesarla. La espera respeta
  `Retry-After`, con un tope de 60 s.
- `5xx` y fallas de conexión: en `GET`, `PUT` y `DELETE`, y en los envíos que el servidor
  deduplica por `Idempotency-Key`. Hoy eso cubre `conversations.messages.send` y `hostedLinks.create`.
  Si el servidor no puede garantizar que no se duplique, responde `503` sin mandar nada, y el
  SDK lo reintenta con la misma clave.
- Cualquier otro `POST` o `PATCH` que falle con `5xx` o por la red **no se reintenta**:
  te llega el error y tú decides. Un reintento a ciegas podría mandar dos veces el mismo
  WhatsApp.

En `POST`, `PUT`, `PATCH` y `DELETE` el SDK manda una `Idempotency-Key` (un UUID, o la
tuya si la pasas) y usa la misma en todos los reintentos de esa llamada. El campo `code` es un código **estable**
del catálogo de errores (`ApiError.error`): decide con él, nunca con el `message`.

## Webhooks: verificar la firma

Kontesta firma cada webhook con HMAC-SHA256 sobre `${timestamp}.${rawBody}` y lo manda en
la cabecera `X-Kontesta-Signature: t=<unix>,v1=<hex>`. Si la marca de tiempo tiene más de
5 minutos de diferencia, la firma se rechaza, para que nadie pueda reenviar un evento viejo.

Verifica siempre con el **cuerpo crudo**, los bytes exactos que recibiste:

```ts
import express from 'express';
import { constructEvent, WebhookSignatureError } from '@kontesta/sdk';

const app = express();

// Importante: necesitas el cuerpo CRUDO, no el JSON ya interpretado.
app.post('/webhooks/kontesta', express.raw({ type: '*/*' }), (req, res) => {
  const raw = req.body.toString('utf8');
  const signature = req.header('X-Kontesta-Signature');
  try {
    const event = constructEvent(raw, signature, process.env.KONTESTA_WEBHOOK_SECRET!);
    switch (event.type) {
      case 'lead.stage_changed':
        // event.data trae los datos del evento
        break;
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookSignatureError) return res.sendStatus(401);
    throw err;
  }
});
```

El secreto (`whsec_...`) se muestra **una sola vez**, al crear la suscripción o al rotarlo;
guárdalo en tu gestor de secretos. Si prefieres solo un sí o no:

```ts
import { verifyWebhook } from '@kontesta/sdk';
const ok = verifyWebhook(raw, signature, secret); // true o false, nunca lanza
```

Administra tus suscripciones desde el SDK:

```ts
const sub = await kontesta.webhooks.create({
  url: 'https://tu-sistema.example.com/webhooks/kontesta',
  events: ['lead.created', 'lead.stage_changed'],
});
console.log(sub.secret); // whsec_... — solo se ve aquí
await kontesta.webhooks.ping(sub.id); // manda un evento test.ping firmado para probar tu endpoint
```

Con `events: []` recibes todos los eventos, menos `call.ended` y `call.recording_ready`: esos hay
que pedirlos por nombre.

## Qué cubre el SDK

| Recurso | Métodos |
|---|---|
| `conversations` | `list`, `iterate`, `get`, `update`, `markRead`, `requestHandoff`, `returnHandoff`, `listHandoffs` |
| `conversations.messages` | `list`, `send` |
| `conversations.tags` | `add`, `remove` |
| `leads` | `list`, `iterate`, `board`, `create`, `move` |
| `pipelines` | `list`, `createStage`, `updateStage`, `removeStage` |
| `automations` | `list`, `create`, `get`, `update`, `remove`, `runs`, `test`, `getBusinessHours`, `setBusinessHours` |
| `tags` | `list`, `create`, `remove` |
| `templates` | `list`, `create`, `get`, `remove` |
| `metrics` | `speedToLead` |
| `webhooks` | `list`, `create`, `get`, `update`, `remove`, `deliveries`, `redeliver`, `ping`, `rotateSecret` |
| `integrations` | `list`, `create`, `get`, `update`, `remove`, `test` |
| `hostedLinks` | `create`, `get`, `cancel` |

`requestHandoff` y `returnHandoff` pasan la conversación a una persona de tu equipo y la
regresan al bot.

La API de llave tiene más áreas que el SDK todavía no envuelve (citas, catálogo, bots,
llamadas, facturación, entre otras). Están en la guía, <https://kontesta.mx/integracion>, y
en el contrato OpenAPI de este repositorio ([`openapi/openapi.json`](./openapi/openapi.json));
se llaman con peticiones HTTP directas y la misma llave. Crear o revocar llaves y
administrar la cuenta del negocio se hace desde la app, con sesión de una persona: una
llave de API no llega ahí.

## Ligas hospedadas: que tu cliente conecte su WhatsApp

Una liga hospedada funciona como el 3-D Secure de un pago: tu sistema pide una liga de un solo uso, la abres en
un popup, tu cliente completa el paso en la web de Kontesta y tú te enteras del resultado. Hoy el único flujo es
`whatsapp_onboarding`: conectar el número de WhatsApp del negocio (también con Coexistence, donde el número sigue
en la app WhatsApp Business del teléfono). La llave necesita `hostedlinks:write` para crear y `hostedlinks:read`
para consultar.

Emitir ligas requiere un negocio activo con plan de pago **y habilitado por Kontesta** (se activa por negocio; pídelo a
soporte). Si no, `create` falla con 403: `HOSTED_LINKS_NOT_ALLOWED` (sin plan de pago vigente),
`HOSTED_LINKS_NOT_ENABLED` (el negocio aún no está habilitado) o `EMAIL_NOT_VERIFIED` (sesión con correo sin
confirmar). `get` y `cancel` de ligas ya emitidas no dependen de la habilitación.

```ts
// En tu backend
const link = await kontesta.hostedLinks.create({
  flow: 'whatsapp_onboarding',
  returnOrigin: 'https://erp.example.com', // origen exacto de tu página, sin ruta
  metadata: { cliente: 'C-1042' },         // vuelve tal cual en get() y en los webhooks
});
// link.url → ábrela en un popup desde tu página. Contiene el token: no la guardes.

// En tu página (linkUrl = la url que te pasó tu backend)
window.open(linkUrl, 'kontesta', 'popup,width=480,height=720');
window.addEventListener('message', (e) => {
  if (e.origin !== new URL(linkUrl).origin || e.data?.type !== 'kontesta.hosted_link') return;
  if (e.data.status === 'completed') console.log('conectado', e.data.result.phoneNumberId);
});

// Confirma siempre del lado del servidor (o espera el webhook hosted_link.completed)
const estado = await kontesta.hostedLinks.get(link.id);
if (estado.status === 'COMPLETED') {
  // estado.result.phoneNumberId es el id de Kontesta que acepta el envío de mensajes
}
```

El mensaje del popup solo avisa; la verdad es `hostedLinks.get` o el webhook firmado.

## Tipos generados del OpenAPI

Los tipos de petición se generan del contrato OpenAPI de la API de llave
([`openapi/openapi.json`](./openapi/openapi.json)) con [`openapi-typescript`][ot] y se
reexportan (`paths`, `operations`, `components`) para uso avanzado. En esta versión, los
tipos de **respuesta** están escritos a mano.

[ot]: https://github.com/openapi-ts/openapi-typescript

## Versiones

Semver atado al contrato de la API de llave: `1.x` corresponde a `/v1`. Un cambio
incompatible en lo que alcanza una llave sube la versión mayor; lo nuevo que no rompe nada
sale en una menor. El detalle de cada versión está en [`CHANGELOG.md`](./CHANGELOG.md).

## Licencia

MIT © ITechdev MX, S.A. de C.V. Ver [`LICENSE`](./LICENSE).

---

_Kontesta — el que contesta primero, vende._
