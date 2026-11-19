import SchemaBuilder from '@pothos/core';
import type { Ctx } from '../context.js';

export const builder = new SchemaBuilder<{
  Context: Ctx;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    JSON: { Input: unknown; Output: unknown };
  };
}>({});

builder.scalarType('DateTime', {
  description: 'Дата и время в ISO-8601 (UTC)',
  serialize: (d) => d.toISOString(),
  parseValue: (v) => {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new Error('Не похоже на дату');
    return d;
  },
});

builder.scalarType('JSON', {
  description: 'Данные приложения как есть — сервер их не разбирает',
  serialize: (v) => v,
  parseValue: (v) => v,
});

builder.queryType({});
builder.mutationType({});
