import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOOL_REGISTRY, type Schema } from '../artwork-tools/tool-registry';

// Convert the existing validator schema, rather than maintain a second tool catalogue.
export function modelSchema(schema: Schema): Record<string, unknown> {
  const { min, max, properties, items, ...rest } = schema;
  const result: Record<string, unknown> = { ...rest };
  if (schema.type === 'object' && properties) {
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, child]) => [
        key,
        modelSchema(child),
      ]),
    );
    result.additionalProperties = false;
  }
  if (items) result.items = modelSchema(items);
  const bounds =
    schema.type === 'string'
      ? ['minLength', 'maxLength']
      : schema.type === 'array'
        ? ['minItems', 'maxItems']
        : ['minimum', 'maximum'];
  if (min !== undefined) result[bounds[0]] = min;
  if (max !== undefined) result[bounds[1]] = max;
  return result;
}
export const creatorModelTools = Object.entries(TOOL_REGISTRY).map(
  ([name, tool]) => ({
    type: 'function',
    function: {
      name,
      description: `Propose ${name}; ordered input artifact kinds: ${tool.inputs.join(', ') || 'none'}. Results are not applied automatically.`,
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['arguments', 'inputIds'],
        properties: {
          arguments: modelSchema(tool.schema),
          inputIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: tool.inputs.length,
            maxItems: tool.inputs.length,
          },
        },
      },
    },
  }),
);
export type ModelMessage = { role: string; content: unknown };
export interface ModelAnswer {
  content?: string | null;
  tool_calls?: { function: { name: string; arguments: string } }[];
}
@Injectable()
export class LocalCreatorModel {
  constructor(private readonly config: ConfigService) {}
  enabled() {
    return this.config.get<string>('ARTWORK_CHAT_ENABLED') === 'true';
  }
  async complete(
    messages: ModelMessage[],
    plan: boolean,
    signal: AbortSignal,
    requiredTool?: 'setTravel',
  ): Promise<ModelAnswer> {
    if (!this.enabled())
      throw new ServiceUnavailableException({ code: 'ARTWORK_CHAT_DISABLED' });
    const url = new URL(
      this.config.get<string>('ARTWORK_CHAT_URL') ?? 'http://127.0.0.1:8080',
    );
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new ServiceUnavailableException({
        code: 'ARTWORK_CHAT_CONFIGURATION',
      });
    const response = await fetch(new URL('/v1/chat/completions', url), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local',
        messages,
        temperature: 0.1,
        max_tokens: 1800,
        chat_template_kwargs: { enable_thinking: false },
        ...(plan
          ? {
              tools: requiredTool
                ? creatorModelTools.filter(
                    (tool) => tool.function.name === requiredTool,
                  )
                : creatorModelTools,
              tool_choice: requiredTool ? 'required' : 'auto',
            }
          : {}),
      }),
    });
    if (!response.ok && response.status !== 400)
      throw new ServiceUnavailableException({
        code: 'ARTWORK_CHAT_UNAVAILABLE',
      });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('ARTWORK_CHAT_INVALID_RESPONSE');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 64000) throw new Error('ARTWORK_CHAT_INVALID_RESPONSE');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!response.ok) {
      const error = data as { error?: { type?: string } } | null;
      if (error?.error?.type === 'exceed_context_size_error')
        throw new Error('ARTWORK_CHAT_CONTEXT_LIMIT');
      throw new ServiceUnavailableException({
        code: 'ARTWORK_CHAT_UNAVAILABLE',
      });
    }
    const invalid = (): never => {
      throw new Error('ARTWORK_CHAT_INVALID_RESPONSE');
    };
    const object = (value: unknown): Record<string, unknown> => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalid();
      return value as Record<string, unknown>;
    };
    const choices = object(data).choices;
    if (!Array.isArray(choices) || !choices.length) return invalid();
    const choice = object(choices[0]),
      message = object(choice.message);
    if (
      !message ||
      choice.finish_reason === 'length' ||
      (message.content != null && typeof message.content !== 'string') ||
      (message.tool_calls != null && !Array.isArray(message.tool_calls))
    )
      throw new Error('ARTWORK_CHAT_INVALID_RESPONSE');
    const calls = message.tool_calls;
    const tool_calls = calls?.map((value) => {
      const fn = object(object(value).function);
      if (typeof fn.name !== 'string' || typeof fn.arguments !== 'string')
        return invalid();
      return { function: { name: fn.name, arguments: fn.arguments } };
    });
    return {
      content: message.content,
      ...(tool_calls ? { tool_calls } : {}),
    };
  }
}
