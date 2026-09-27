import type { HttpTransport } from '../http/transport.js';
import type { CreateStageInput, UpdateStageInput } from '../types/inputs.js';
import type { Pipeline, Stage } from '../types/resources.js';

export class PipelinesClient {
  constructor(private readonly transport: HttpTransport) {}

  /** GET /v1/pipelines — pipelines del tenant con sus etapas. */
  list(): Promise<Pipeline[]> {
    return this.transport.json({ method: 'GET', path: '/v1/pipelines' });
  }

  /** POST /v1/pipelines/:id/stages — crea una etapa en el pipeline. */
  createStage(pipelineId: string, body: CreateStageInput): Promise<Stage> {
    return this.transport.json({
      method: 'POST',
      path: `/v1/pipelines/${encodeURIComponent(pipelineId)}/stages`,
      json: body,
    });
  }

  /** PATCH /v1/stages/:id — renombra / reordena / marca ganada-perdida una etapa. */
  updateStage(stageId: string, body: UpdateStageInput): Promise<Stage> {
    return this.transport.json({
      method: 'PATCH',
      path: `/v1/stages/${encodeURIComponent(stageId)}`,
      json: body,
    });
  }

  /** DELETE /v1/stages/:id — elimina la etapa. */
  removeStage(stageId: string): Promise<void> {
    return this.transport.json({
      method: 'DELETE',
      path: `/v1/stages/${encodeURIComponent(stageId)}`,
    });
  }
}
