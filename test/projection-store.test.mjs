import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import { WorkshopProjectionStore } from '../src/projection-store.mjs';

async function mount(root) {
  const ctx = new Context();
  try {
    for (const [plugin, config] of [
      [Storage, undefined], [StorageJson, { root }],
      [StorageDomain, { backend: 'json' }],
    ]) await ctx.plugin(plugin, config).await();
    return { ctx, store: new WorkshopProjectionStore(() => ctx.get('storageDomain')) };
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}

test('real DSH JSON domain durably reopens one Workshop projection by live Core Session identity', async () => {
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-INPUT-01');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'projection-test-'));
  const identity = { id: 'session-live', version: 4,
    createdAt: 100, cwd: '/tmp/workshop-test' };
  const state = { context: { currentSession: identity.id,
    activeWorldRef: null, orderedSelectedObjectRefs: [],
    sessionRevision: 'rev-1', selectionRevision: '0' }, turns: [] };
  try {
    const first = await mount(root);
    try {
      await first.store.create(identity.id, identity, state);
      await first.store.replace(identity.id, identity, 'rev-1', {
        ...state, context: { ...state.context, sessionRevision: 'rev-2' },
        turns: [{ turnRef: 'turn-1', turnRevision: 'turn-rev-1',
          text: '放一个方块', resultText: '请说明尺寸。' }],
      });
      assert.equal((await first.store.get(identity.id, identity)).turns[0].text,
        '放一个方块');
    } finally { await first.store.close(); await first.ctx.fiber.dispose(); }
    const second = await mount(root);
    try {
      const reopened = await second.store.get(identity.id, identity);
      assert.equal(reopened.context.sessionRevision, 'rev-2');
      assert.equal(reopened.turns[0].resultText, '请说明尺寸。');
      await assert.rejects(() => second.store.get(identity.id,
        { ...identity, createdAt: 101 }), /another Core Session lifecycle/);
    } finally { await second.store.close(); await second.ctx.fiber.dispose(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
