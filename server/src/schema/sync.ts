// GraphQL для синхронизации коллекций.
import { builder } from './builder.js';
import { requireUser } from './types.js';
import { audit } from '../audit.js';
import * as sync from '../sync/service.js';
import type { CollectionHead, CollectionState } from '../sync/service.js';

const CollectionHeadRef = builder.objectRef<CollectionHead>('CollectionHead').implement({
  description: 'Состояние коллекции на сервере без самих данных',
  fields: (t) => ({
    name: t.exposeString('name'),
    rev: t.exposeInt('rev'),
    checksum: t.exposeString('checksum'),
    itemCount: t.exposeInt('itemCount'),
    deviceId: t.exposeString('deviceId', { nullable: true }),
    updatedAt: t.field({ type: 'DateTime', resolve: (c) => c.updatedAt }),
  }),
});

const CollectionStateRef = builder.objectRef<CollectionState>('CollectionState').implement({
  description: 'Коллекция вместе с данными',
  fields: (t) => ({
    name: t.exposeString('name'),
    rev: t.exposeInt('rev'),
    checksum: t.exposeString('checksum'),
    itemCount: t.exposeInt('itemCount'),
    deviceId: t.exposeString('deviceId', { nullable: true }),
    updatedAt: t.field({ type: 'DateTime', resolve: (c) => c.updatedAt }),
    payload: t.field({ type: 'JSON', resolve: (c) => c.payload }),
  }),
});

const CollectionRevInput = builder.inputType('CollectionRev', {
  fields: (t) => ({
    name: t.string({ required: true }),
    rev: t.int({ required: true }),
  }),
});

const CollectionPushInput = builder.inputType('CollectionPush', {
  fields: (t) => ({
    name: t.string({ required: true }),
    /** Ревизия, которую клиент считает актуальной. 0 — коллекции на сервере ещё нет */
    baseRev: t.int({ required: true }),
    payload: t.field({ type: 'JSON', required: true }),
  }),
});

const PullRef = builder
  .objectRef<{ changed: CollectionState[]; heads: CollectionHead[] }>('SyncPull')
  .implement({
    fields: (t) => ({
      changed: t.field({ type: [CollectionStateRef], resolve: (r) => r.changed }),
      heads: t.field({ type: [CollectionHeadRef], resolve: (r) => r.heads }),
      serverTime: t.field({ type: 'DateTime', resolve: () => new Date() }),
    }),
  });

const PushResultRef = builder
  .objectRef<{ accepted: CollectionHead[]; conflicts: CollectionState[] }>('PushResult')
  .implement({
    description: 'conflicts — серверные версии коллекций, которые не удалось записать',
    fields: (t) => ({
      accepted: t.field({ type: [CollectionHeadRef], resolve: (r) => r.accepted }),
      conflicts: t.field({ type: [CollectionStateRef], resolve: (r) => r.conflicts }),
    }),
  });

const UsageRef = builder.objectRef<{ bytes: number; collections: number }>('SyncUsage').implement({
  fields: (t) => ({
    bytes: t.exposeInt('bytes'),
    collections: t.exposeInt('collections'),
    maxBytesPerCollection: t.int({ resolve: () => sync.MAX_BYTES }),
  }),
});

builder.queryFields((t) => ({
  sync: t.field({
    type: PullRef,
    description: 'Коллекции, которые на сервере новее указанных ревизий',
    args: { since: t.arg({ type: [CollectionRevInput], required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      return sync.pull(
        user.id,
        args.since.map((s) => ({ name: s.name, rev: s.rev })),
      );
    },
  }),

  collection: t.field({
    type: CollectionStateRef,
    nullable: true,
    description: 'Одна коллекция целиком — например, чтобы показать серверную версию в конфликте',
    args: { name: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => sync.collection(requireUser(ctx).id, args.name),
  }),

  syncUsage: t.field({
    type: UsageRef,
    resolve: async (_p, _a, ctx) => sync.usage(requireUser(ctx).id),
  }),
}));

builder.mutationFields((t) => ({
  pushCollections: t.field({
    type: PushResultRef,
    args: {
      deviceId: t.arg.string({ required: true }),
      items: t.arg({ type: [CollectionPushInput], required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const device = args.deviceId.slice(0, 40);
      const result = await sync.push(
        user.id,
        device,
        args.items.map((i) => ({ name: i.name, baseRev: i.baseRev, payload: i.payload })),
      );
      if (result.conflicts.length) {
        await audit('sync_conflict', {
          userId: user.id,
          ip: ctx.ip,
          meta: { collections: result.conflicts.map((c) => c.name), device },
        });
      }
      return result;
    },
  }),

  overwriteCollection: t.field({
    type: CollectionHeadRef,
    description: 'Записать свою версию поверх серверной — только по явному выбору человека',
    args: {
      deviceId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      payload: t.arg({ type: 'JSON', required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = requireUser(ctx);
      const res = await sync.overwrite(user.id, args.deviceId.slice(0, 40), {
        name: args.name,
        payload: args.payload,
      });
      await audit('sync_overwrite', { userId: user.id, ip: ctx.ip, meta: { name: args.name, rev: res.rev } });
      return res;
    },
  }),
}));
