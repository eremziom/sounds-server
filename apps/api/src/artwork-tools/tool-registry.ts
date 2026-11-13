import { BadRequestException } from '@nestjs/common';

export type Schema = {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  min?: number;
  max?: number;
  enum?: unknown[];
};
const num = (min: number, max: number): Schema => ({
  type: 'number',
  min,
  max,
});
const integer = (min: number, max: number): Schema => ({
  type: 'integer',
  min,
  max,
});
const str = (max = 100): Schema => ({ type: 'string', min: 1, max });
const enumeration = (...values: string[]): Schema => ({
  type: 'string',
  enum: values,
});
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: 'object', properties, required });
const array = (items: Schema, min = 0, max = 100): Schema => ({
  type: 'array',
  items,
  min,
  max,
});
const point = object({ x: num(0, 16384), y: num(0, 16384) });
const generation = object({
  prompt: str(12000),
  seed: integer(0, 2147483647),
  width: integer(512, 1024),
  height: integer(288, 576),
});
const role = enumeration(
  'visibility-mask',
  'occlusion-mask',
  'material-mask',
  'influence-map',
  'delay-map',
);
export const TOOL_REGISTRY = {
  generateImage: { inputs: [], gpu: 'klein', schema: generation },
  editImage: {
    inputs: ['image', 'mask'],
    gpu: 'klein',
    schema: object({ prompt: str(12000), seed: integer(0, 2147483647) }),
  },
  segmentObject: {
    inputs: ['image'],
    gpu: 'sam',
    schema: object(
      {
        points: array(
          object({ x: num(0, 16384), y: num(0, 16384), label: integer(0, 1) }),
          1,
          32,
        ),
        box: array(num(0, 16384), 4, 4),
        role,
      },
      ['points', 'role'],
    ),
  },
  fillBackground: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object({ dilation: integer(0, 50) }),
  },
  createColorPlate: {
    inputs: [],
    gpu: null,
    schema: object({
      width: integer(16, 8192),
      height: integer(9, 8192),
      rgb: array(integer(0, 255), 3, 3),
    }),
  },
  createMask: {
    inputs: ['image'],
    gpu: null,
    schema: object(
      { role, value: integer(0, 255), polygon: array(point, 3, 64) },
      ['role', 'value'],
    ),
  },
  composeMasks: {
    inputs: ['image', 'mask', 'mask'],
    gpu: null,
    schema: object({
      operation: enumeration('union', 'intersect', 'subtract'),
      role,
    }),
  },
  registerMap: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object({ role }),
  },
  inspectSelection: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object({}),
  },
  registerImage: {
    inputs: ['image'],
    gpu: null,
    schema: object({ width: integer(16, 8192), height: integer(9, 8192) }),
  },
  extractLayer: { inputs: ['image', 'mask'], gpu: null, schema: object({}) },
  refineMask: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object(
      {
        operation: enumeration(
          'dilate',
          'erode',
          'feather',
          'threshold',
          'invert',
        ),
        radius: integer(0, 50),
        threshold: integer(0, 255),
        role,
      },
      ['operation', 'role'],
    ),
  },
  deriveLightSelection: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object(
      {
        minLuma: num(0, 255),
        minSaturation: num(0, 1),
        hueFrom: num(0, 360),
        hueTo: num(0, 360),
        detailRadius: integer(1, 12),
        detailContrast: num(1, 64),
      },
      ['minLuma', 'minSaturation'],
    ),
  },
  buildInfluenceMap: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object({ feather: num(0, 50) }),
  },
  buildDelayMap: {
    inputs: ['image', 'mask'],
    gpu: null,
    schema: object(
      {
        direction: enumeration('x', 'y', 'radial', 'path'),
        reverse: { type: 'boolean' },
        origin: point,
        path: array(point, 2, 64),
      },
      ['direction'],
    ),
  },
  setBehaviors: {
    inputs: [],
    gpu: null,
    schema: object({
      layerId: str(),
      behaviors: array({ type: 'object' }, 0, 32),
    }),
  },
  setTravel: {
    inputs: [],
    gpu: null,
    schema: object({ layerId: str(), travel: { type: 'object' } }),
  },
  buildPreviewPackage: {
    inputs: [],
    gpu: null,
    schema: object(
      {
        environmentLayerIds: array(str(), 0, 100),
        lightLayerIds: array(str(), 0, 100),
      },
      [],
    ),
  },
} as const;
export type ToolName = keyof typeof TOOL_REGISTRY;

export function validateTool(tool: string, args: unknown, inputIds: string[]) {
  const fail = (path: string): never => {
    throw new BadRequestException({
      code: 'ARTWORK_TOOL_ARGUMENTS',
      message: `Invalid tool input: ${path}`,
    });
  };
  if (!Object.hasOwn(TOOL_REGISTRY, tool)) fail('tool');
  const definition = TOOL_REGISTRY[tool as ToolName];
  if (
    inputIds.length !== definition.inputs.length ||
    new Set(inputIds).size !== inputIds.length
  )
    fail('inputIds');
  const visit = (value: unknown, schema: Schema, path: string) => {
    if (schema.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(path);
      const record = value as Record<string, unknown>;
      if (schema.properties) {
        for (const key of Object.keys(record))
          if (!Object.hasOwn(schema.properties, key)) fail(`${path}.${key}`);
        for (const key of schema.required ?? [])
          if (!Object.hasOwn(record, key)) fail(`${path}.${key}`);
        for (const [key, child] of Object.entries(schema.properties))
          if (Object.hasOwn(record, key))
            visit(record[key], child, `${path}.${key}`);
      }
    } else if (schema.type === 'array') {
      if (
        !Array.isArray(value) ||
        value.length < (schema.min ?? 0) ||
        value.length > (schema.max ?? 100)
      )
        fail(path);
      (value as unknown[]).forEach((item, i) =>
        visit(item, schema.items!, `${path}[${i}]`),
      );
    } else if (schema.type === 'string') {
      if (
        typeof value !== 'string' ||
        value.length < (schema.min ?? 0) ||
        value.length > (schema.max ?? 16000)
      )
        fail(path);
    } else if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') fail(path);
    } else if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (schema.type === 'integer' && !Number.isSafeInteger(value)) ||
      value < (schema.min ?? -Infinity) ||
      value > (schema.max ?? Infinity)
    )
      fail(path);
    if (schema.enum && !schema.enum.includes(value)) fail(path);
  };
  visit(args, definition.schema, 'arguments');
  if (JSON.stringify(args).length > 32000) fail('arguments size');
  if (tool === 'generateImage') {
    const a = args as { width: number; height: number };
    if (
      !(
        (a.width === 512 && a.height === 288) ||
        (a.width === 1024 && a.height === 576)
      )
    )
      fail('unmeasured generation dimensions');
  }
  if (tool === 'buildDelayMap') {
    const a = args as Record<string, unknown>;
    if (
      (a.direction === 'path' && !a.path) ||
      (a.direction === 'radial' && !a.origin)
    )
      fail('direction configuration');
  }
  return definition;
}

export function matchesInput(expected: string, kind: string) {
  return expected === 'mask'
    ? [
        'visibility-mask',
        'occlusion-mask',
        'material-mask',
        'influence-map',
        'delay-map',
      ].includes(kind)
    : expected === kind;
}
