import type { HttpTransport } from '../http/transport.js';
import type { QueryParams } from '../types/common.js';
import type { SpeedToLeadReport } from '../types/resources.js';

export type SpeedToLeadParams = QueryParams<'MetricsController_speedToLead'>;

export class MetricsClient {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * GET /v1/metrics/speed-to-lead — reporte de velocidad de respuesta (TTFR: p50/p90,
   * % bajo 5 min) por día, agente, tipo de respondedor y canal (`byChannel`: whatsapp |
   * instagram | messenger). `from`/`to` en el rango, `tz` la zona horaria (default
   * America/Mexico_City), `include=raw` adjunta filas, `channel` acota la población a un canal.
   */
  speedToLead(params: SpeedToLeadParams): Promise<SpeedToLeadReport> {
    return this.transport.json({
      method: 'GET',
      path: '/v1/metrics/speed-to-lead',
      query: params,
    });
  }
}
