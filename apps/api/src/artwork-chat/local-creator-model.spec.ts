import { ConfigService } from '@nestjs/config';
import { LocalCreatorModel, creatorModelTools } from './local-creator-model';

describe('local creator model transport (no inference)', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  it('never contacts a model while disabled or with a remote/redirectable URL', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(
      new LocalCreatorModel(new ConfigService()).complete(
        [],
        true,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    for (const url of [
      'https://example.test',
      'http://example.test',
      'http://user:secret@127.0.0.1:8080',
      'http://127.0.0.1:8080/path',
    ]) {
      await expect(
        new LocalCreatorModel(
          new ConfigService({
            ARTWORK_CHAT_ENABLED: 'true',
            ARTWORK_CHAT_URL: url,
          }),
        ).complete([], true, new AbortController().signal),
      ).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends bounded OpenAI-compatible tools to loopback and reads actual response', async () => {
    const fetchMock = jest.fn(
      (_url: string | URL | Request, init: RequestInit) => {
        if (typeof init.body !== 'string')
          throw new Error('Expected JSON text');
        const request = JSON.parse(init.body) as Record<string, unknown>;
        expect(request.tool_choice).toBe('auto');
        expect(request.max_tokens).toBe(1800);
        expect(request.tools).toEqual(creatorModelTools);
        expect(init.redirect).toBe('error');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'stop',
                  message: { content: 'Który obiekt?' },
                },
              ],
            }),
          ),
        );
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const model = new LocalCreatorModel(
      new ConfigService({ ARTWORK_CHAT_ENABLED: 'true' }),
    );
    expect(
      (
        await model.complete(
          [{ role: 'user', content: 'Zmień kolor' }],
          true,
          new AbortController().signal,
        )
      ).content,
    ).toBe('Który obiekt?');
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe(
      'http://127.0.0.1:8080/v1/chat/completions',
    );
  });
  it('omits tools from discussion and identifies a context overflow from llama.cpp', async () => {
    global.fetch = jest.fn((_url, init: RequestInit) => {
      if (typeof init.body !== 'string') throw new Error('Expected JSON text');
      expect(JSON.parse(init.body)).not.toHaveProperty('tools');
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { type: 'exceed_context_size_error' } }),
          { status: 400 },
        ),
      );
    });
    const model = new LocalCreatorModel(
      new ConfigService({ ARTWORK_CHAT_ENABLED: 'true' }),
    );
    await expect(
      model.complete([], false, new AbortController().signal),
    ).rejects.toThrow('ARTWORK_CHAT_CONTEXT_LIMIT');
  });
  it('rejects truncated or oversized replies rather than accepting partial tool instructions', async () => {
    const model = new LocalCreatorModel(
      new ConfigService({ ARTWORK_CHAT_ENABLED: 'true' }),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: 'length', message: { content: 'niekompletne' } },
            ],
          }),
        ),
      ),
    );
    await expect(
      model.complete([], true, new AbortController().signal),
    ).rejects.toThrow();
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('x'.repeat(65000))),
    );
    await expect(
      model.complete([], true, new AbortController().signal),
    ).rejects.toThrow();
  });
  it('derives schema bounds and input count from the existing tool registry', () => {
    const generation = creatorModelTools.find(
      (t) => t.function.name === 'generateImage',
    )!;
    expect(
      generation.function.parameters.properties.arguments.properties,
    ).toBeDefined();
    expect(generation.function.parameters.properties.inputIds.maxItems).toBe(0);
  });
});
