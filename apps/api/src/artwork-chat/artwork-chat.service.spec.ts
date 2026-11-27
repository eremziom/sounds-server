import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  ArtworkChatService,
  chatRecordId,
  validateChatAnswer,
} from './artwork-chat.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ArtworksService } from '../artworks/artworks.service';
import type { ArtworkJobsService } from '../artwork-jobs/artwork-jobs.service';
import type { LocalCreatorModel, ModelAnswer } from './local-creator-model';
import type { CreatorChatRequest } from '../../../artwork-contracts';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
type Row = { id: string; projectId: string; role: string; text: string };

describe('KRE-05 durable coordinator without model inference', () => {
  function fixture(
    answer: ModelAnswer = { content: 'Który obiekt chcesz zmienić?' },
  ) {
    const rows = new Map<
      string,
      { id: string; projectId: string; role: string; text: string }
    >();
    const projectId = randomUUID(),
      revisionId = randomUUID();
    const project = {
      id: projectId,
      activeRevisionId: revisionId,
      revision: { snapshot: { layers: [{ id: 'drone' }] } },
    };
    const message = {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id) ?? null),
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { id: string; projectId: string; role: string };
        }) =>
          Promise.resolve(
            [...rows.values()].find(
              (r) =>
                r.id === where.id &&
                r.projectId === where.projectId &&
                r.role === where.role,
            ) ?? null,
          ),
      ),
      findMany: jest.fn(() => Promise.resolve([...rows.values()])),
      create: jest.fn(({ data }: { data: Row }) => {
        if (rows.has(data.id))
          throw Object.assign(new Error(), { code: 'P2002' });
        rows.set(data.id, data);
        return Promise.resolve(data);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; text: string };
          data: { text: string };
        }) => {
          const row = rows.get(where.id);
          if (!row || row.text !== where.text)
            return Promise.resolve({ count: 0 });
          rows.set(row.id, { ...row, ...data });
          return Promise.resolve({ count: 1 });
        },
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: Row;
          update: Partial<Row>;
        }) => {
          const next = rows.has(where.id)
            ? { ...rows.get(where.id)!, ...update }
            : create;
          rows.set(where.id, next);
          return Promise.resolve(next);
        },
      ),
    };
    const db = {
      creatorMessage: message,
      $transaction: jest.fn((promises: Promise<unknown>[]) =>
        Promise.all(promises),
      ),
    };
    const artworks = {
      get: jest.fn(() => Promise.resolve(project)),
      artifacts: jest.fn(() => Promise.resolve([])),
      file: jest.fn(),
    };
    const queued = new Map<string, { id: string; state: string }>();
    const jobs = {
      list: jest.fn(() =>
        Promise.resolve([
          {
            id: 'failed-job',
            tool: 'segmentObject',
            state: 'failed',
            errorCode: 'NO_MASK',
            requestKey: 'manual-mask',
            baseRevisionId: revisionId,
            arguments: null as unknown,
          },
        ]),
      ),
      enqueue: jest.fn(
        (_p: string, _o: number, dto: { requestKey: string }) => {
          if (!queued.has(dto.requestKey))
            queued.set(dto.requestKey, { id: randomUUID(), state: 'queued' });
          return Promise.resolve(queued.get(dto.requestKey)!);
        },
      ),
    };
    const model = {
      enabled: jest.fn(() => true),
      complete: jest.fn(() => Promise.resolve(answer)),
    };
    const config = new ConfigService({
      ARTWORK_REPO_ROOT: resolve('../..'),
      ARTWORK_CHAT_HEAVY_JOBS_ENABLED: 'false',
    });
    const service = new ArtworkChatService(
      db as unknown as PrismaService,
      artworks as unknown as ArtworksService,
      jobs as unknown as ArtworkJobsService,
      model as unknown as LocalCreatorModel,
      config,
    );
    const request: CreatorChatRequest = {
      requestId: randomUUID(),
      baseRevisionId: revisionId,
      mode: 'plan',
      text: 'Niech dron leci po łuku.',
    };
    return {
      service,
      request,
      projectId,
      revisionId,
      project,
      artworks,
      jobs,
      model,
      rows,
      queued,
      message,
    };
  }
  const travel = {
    function: {
      name: 'setTravel',
      arguments: JSON.stringify({
        arguments: { layerId: 'drone', travel: { durationSeconds: 24 } },
        inputIds: [],
      }),
    },
  };
  it('keeps a shared trajectory in a single proposal and preserves unmentioned fields', () => {
    const f = fixture();
    const previous = { startSeconds: 2, durationSeconds: 30, x: 90, y: 25 };
    const parameters = { travel: previous, occlusionMaskAssetId: 'shared' };
    const snapshot = {
      layers: [
        { id: 'drone', imageArtifactId: 'drone-source', parameters },
        { id: 'drone-lights', imageArtifactId: 'drone-source', parameters },
        { id: 'other', imageArtifactId: 'other-source', parameters },
        { id: 'static', imageArtifactId: 'drone-source' },
      ],
    };
    const action = validateChatAnswer(
      { tool_calls: [travel] },
      f.request,
      snapshot,
      [],
    )[0];
    expect(action.arguments).toEqual({
      layerId: 'drone',
      linkedLayerIds: ['drone-lights'],
      travel: { ...previous, durationSeconds: 24 },
    });
    expect(() =>
      validateChatAnswer(
        {
          tool_calls: [
            {
              function: {
                name: 'setTravel',
                arguments: JSON.stringify({
                  arguments: {
                    layerId: 'drone',
                    linkedLayerIds: ['static'],
                    travel: { durationSeconds: 24 },
                  },
                  inputIds: [],
                }),
              },
            },
          ],
        },
        f.request,
        snapshot,
        [],
      ),
    ).toThrow();
  });
  it('reports application from the active revision and distinguishes other successful jobs', async () => {
    const f = fixture();
    const appliedRequest = randomUUID();
    const appliedId = randomUUID();
    Object.assign(f.project.revision.snapshot, {
      decisions: [`chat-applied:${appliedRequest}:${appliedId}`],
    });
    f.jobs.list.mockResolvedValue([
      {
        id: appliedId,
        tool: 'setBehaviors',
        state: 'succeeded',
        errorCode: '',
        baseRevisionId: randomUUID(),
        requestKey: `chat-${appliedRequest}-0`,
        arguments: null,
      },
      {
        id: randomUUID(),
        tool: 'setTravel',
        state: 'succeeded',
        errorCode: '',
        baseRevisionId: f.revisionId,
        requestKey: 'another-job',
        arguments: null,
      },
      {
        id: randomUUID(),
        tool: 'setTravel',
        state: 'succeeded',
        errorCode: '',
        baseRevisionId: randomUUID(),
        requestKey: 'older-job',
        arguments: null,
      },
    ]);
    await f.service.send(f.projectId, 1, f.request);
    const prompt = JSON.stringify(f.model.complete.mock.calls[0]);
    expect(prompt).toContain('applied_to_active_revision');
    expect(prompt).toContain('awaiting_application');
    expect(prompt).toContain('absent_from_active_revision');
    expect(prompt).toContain('API potwierdza: użytkownik już zastosował');
  });
  it('answers a direct question about an applied effect from the active revision', async () => {
    const f = fixture();
    const appliedRequest = randomUUID();
    const appliedId = randomUUID();
    const effect = { id: 'west-impulse', params: { frequencyHz: 0.2 } };
    Object.assign(f.project.revision.snapshot.layers[0], {
      parameters: { behaviors: [effect] },
    });
    Object.assign(f.project.revision.snapshot, {
      decisions: [`chat-applied:${appliedRequest}:${appliedId}`],
    });
    f.jobs.list.mockResolvedValue([
      {
        id: appliedId,
        tool: 'setBehaviors',
        state: 'succeeded',
        errorCode: '',
        baseRevisionId: randomUUID(),
        requestKey: `chat-${appliedRequest}-0`,
        arguments: { layerId: 'drone', behaviors: [effect] },
      },
    ]);
    const reply = await f.service.send(f.projectId, 1, {
      ...f.request,
      mode: 'discuss',
      text: 'Czy zmiana west-impulse została zastosowana?',
    });
    expect(reply.status).toBe('answered');
    expect(reply.text).toContain('został zastosowany w aktywnej rewizji');
    expect(reply.text).toContain('0,2 Hz (jeden cykl co 5 s)');
    expect(reply.text).toContain(appliedId);
    const followup = await f.service.send(f.projectId, 1, {
      ...f.request,
      requestId: randomUUID(),
      mode: 'discuss',
      text: 'Jaki jest teraz okres błysku west-impulse?',
    });
    expect(followup.text).toBe(reply.text);
    expect(f.model.complete).not.toHaveBeenCalled();
  });
  it('repairs a concrete travel plan that the model returned as prose', async () => {
    const f = fixture({ tool_calls: [travel] });
    f.model.complete.mockResolvedValueOnce({
      content: 'Dane setTravel: {"kind":"bezier","segments":[...]}',
    });
    const reply = await f.service.send(f.projectId, 1, f.request);
    expect(reply.status).toBe('proposed');
    expect(reply.text).toContain('Propozycja trasy dla warstwy drone');
    expect(f.model.complete).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      true,
      expect.any(AbortSignal),
      'setTravel',
    );
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('preserves sibling effects and unmentioned fields when planning a partial behavior update', () => {
    const f = fixture();
    const colors = { id: 'color', kind: 'colorShift', params: { hue: 2 } };
    const glow = {
      id: 'flash',
      kind: 'glow',
      params: { frequencyHz: 0.25, amount: 0.75 },
      modulation: [{ signal: 'bass' }],
      influenceMaskAssetId: randomUUID(),
    };
    const snapshot = {
      layers: [{ id: 'drone', parameters: { behaviors: [colors, glow] } }],
    };
    const reply = (behaviors: unknown[]) => ({
      tool_calls: [
        {
          function: {
            name: 'setBehaviors',
            arguments: JSON.stringify({
              arguments: { layerId: 'drone', behaviors },
              inputIds: [],
            }),
          },
        },
      ],
    });
    const actions = validateChatAnswer(
      reply([{ id: 'flash', params: { frequencyHz: 0.2 } }]),
      f.request,
      snapshot,
      [],
    );
    expect(actions[0].arguments.behaviors).toEqual([
      colors,
      { ...glow, params: { ...glow.params, frequencyHz: 0.2 } },
    ]);
    expect(
      validateChatAnswer(reply([]), f.request, snapshot, [])[0],
    ).toMatchObject({ arguments: { behaviors: [colors, glow] } });
  });
  it('asks for clarification, persists history and never enqueues during conversation', async () => {
    const f = fixture();
    Object.assign(f.project.revision.snapshot.layers[0], {
      parameters: {
        behaviors: [{ id: 'west-impulse', params: { frequencyHz: 0.2 } }],
      },
    });
    f.request.text += ' Uwzględnij west-impulse.';
    const reply = await f.service.send(f.projectId, 1, f.request);
    expect(reply.status).toBe('answered');
    expect(f.rows.size).toBe(2);
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
    const context = JSON.stringify(f.model.complete.mock.calls[0]);
    expect(context).toContain('NO_MASK');
    expect(context).toContain('Obowiązkowe wytyczne');
    expect(context).not.toContain('## Verification');
    const activeRevision = context.indexOf('Aktywna rewizja projektu');
    const namedEffects = context.indexOf(
      'Bieżące parametry efektów wymienionych',
    );
    expect(context.indexOf('NO_MASK')).toBeLessThan(activeRevision);
    expect(activeRevision).toBeLessThan(namedEffects);
    expect(context.slice(namedEffects)).toContain('frequencyHz');
    expect(namedEffects).toBeLessThan(context.lastIndexOf(f.request.text));
    expect(await f.service.send(f.projectId, 1, f.request)).toEqual(reply);
    expect(f.model.complete).toHaveBeenCalledTimes(1);
  });
  it('requires explicit execution and repeated execution reuses job keys', async () => {
    const f = fixture({ tool_calls: [travel] });
    expect((await f.service.send(f.projectId, 1, f.request)).status).toBe(
      'proposed',
    );
    expect(f.queued.size).toBe(0);
    const first = await f.service.execute(f.projectId, 1, f.request.requestId);
    expect(
      await f.service.execute(f.projectId, 1, f.request.requestId),
    ).toEqual(first);
    expect(f.queued.size).toBe(1);
    expect(first.results[0].state).toBe('queued');
    expect(f.rows.size).toBe(3);
  });
  it('rejects changed requests reusing an id and changed revisions', async () => {
    const f = fixture({ tool_calls: [travel] });
    await f.service.send(f.projectId, 1, f.request);
    await expect(
      f.service.send(f.projectId, 1, { ...f.request, text: 'Inne polecenie' }),
    ).rejects.toThrow();
    f.project.activeRevisionId = randomUUID();
    await expect(
      f.service.execute(f.projectId, 1, f.request.requestId),
    ).rejects.toThrow();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('bounds repair attempts and never accepts unknown objects or arbitrary tools', async () => {
    const f = fixture({
      tool_calls: [{ function: { name: 'exec', arguments: '{}' } }],
    });
    expect((await f.service.send(f.projectId, 1, f.request)).status).toBe(
      'failed',
    );
    expect(f.model.complete).toHaveBeenCalledTimes(2);
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
    expect(() =>
      validateChatAnswer(
        { tool_calls: [travel] },
        f.request,
        { layers: [] },
        [],
      ),
    ).toThrow();
    expect(() =>
      validateChatAnswer(
        { tool_calls: [travel] },
        { ...f.request, mode: 'discuss' },
        f.project.revision.snapshot,
        [],
      ),
    ).toThrow();
    expect(() =>
      validateChatAnswer(
        { tool_calls: [travel, travel, travel, travel] },
        f.request,
        f.project.revision.snapshot,
        [],
      ),
    ).toThrow();
  });
  it('cancellation wins over a late model response and is durable', async () => {
    const f = fixture();
    let resolveModel!: (value: ModelAnswer) => void;
    f.model.complete.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveModel = resolve;
        }),
    );
    const pending = f.service.send(f.projectId, 1, f.request);
    while (!resolveModel) await new Promise((resolve) => setImmediate(resolve));
    await f.service.cancel(f.projectId, 1, f.request.requestId);
    resolveModel({ tool_calls: [travel] });
    expect((await pending).status).toBe('cancelled');
    expect((await f.service.send(f.projectId, 1, f.request)).status).toBe(
      'cancelled',
    );
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('does not call a disabled model, write a foreign project or read a foreign image', async () => {
    const f = fixture();
    f.model.enabled.mockReturnValue(false);
    await expect(f.service.send(f.projectId, 1, f.request)).rejects.toThrow();
    expect(f.rows.size).toBe(0);
    f.model.enabled.mockReturnValue(true);
    await expect(
      f.service.send(f.projectId, 1, {
        ...f.request,
        imageArtifactId: randomUUID(),
      }),
    ).rejects.toThrow();
    f.artworks.get.mockRejectedValueOnce(new Error('Not owned'));
    await expect(f.service.send(f.projectId, 2, f.request)).rejects.toThrow();
    expect(f.model.complete).not.toHaveBeenCalled();
    expect(f.artworks.file).not.toHaveBeenCalled();
  });
  it('preserves model failures and tool failures without reporting success', async () => {
    const f = fixture();
    f.model.complete.mockRejectedValueOnce(new Error('timeout'));
    expect((await f.service.send(f.projectId, 1, f.request)).status).toBe(
      'failed',
    );
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
    const next = fixture({ tool_calls: [travel] });
    await next.service.send(next.projectId, 1, next.request);
    next.jobs.enqueue.mockRejectedValueOnce(
      new Error('Invalid runtime parameters'),
    );
    expect(
      (await next.service.execute(next.projectId, 1, next.request.requestId))
        .results,
    ).toEqual([{ tool: 'setTravel', errorCode: 'ARTWORK_CHAT_TOOL_FAILED' }]);
  });
  it('defers image-model operations without enqueueing or overriding the memory gate', async () => {
    const f = fixture({
      tool_calls: [
        {
          function: {
            name: 'generateImage',
            arguments: JSON.stringify({
              arguments: {
                prompt: 'Nocny ogród z dronem',
                seed: 42,
                width: 1024,
                height: 576,
              },
              inputIds: [],
            }),
          },
        },
      ],
    });
    const reply = await f.service.send(f.projectId, 1, f.request);
    expect(reply.status).toBe('proposed');
    expect(reply.actions[0].arguments.prompt).toContain('Wersja instrukcji');
    await expect(
      f.service.execute(f.projectId, 1, f.request.requestId),
    ).rejects.toThrow();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('uses stable valid UUID record ids for recovery', () => {
    const id = randomUUID();
    expect(chatRecordId(id, 'reply')).toMatch(/^[a-f0-9-]{14}4[a-f0-9-]+$/);
    expect(chatRecordId(id, 'reply')).toBe(chatRecordId(id, 'reply'));
  });
});
