import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { WorkshopV3 } from '../src/index.mjs';

// Real public DSH JSONL metadata; no World, Canvas, projection or model is mounted.
async function tree(root, prefix = '') {
  const out = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(out, await tree(root, path));
    else out[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
  return out;
}
async function runtime(fn) {
  const base = process.env.HW_RUNTIME_ROOT;
  assert.ok(base, 'Set HW_RUNTIME_ROOT to this card own isolated run');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'metadata-'));
  const ctx = new Context();
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' }).await();
  const p = ctx.sessionPersistence;
  try {
    for (const [id, time] of [['s1', 100], ['s2', 200]]) {
      const writer = await p.create({ version: SESSION_FORMAT_VERSION, id,
        createdAt: time, cwd: root, isSeeded: false });
      await writer.append([{ type: 'turn/start', seq: 0, time: time + 1, data: { turn: 1 } }]);
      await writer.close();
    }
    await fn(new WorkshopV3({ sessionPersistence: p }), p, root);
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

test('trusted unbound Session metadata observes exact official snapshot without a Workshop projection', async () => {
  await runtime(async (workshop, p, root) => {
    const before = await tree(root);
    const expected = await p.stat('s1');
    const observed = await workshop.readSessionMetadata('s1');
    assert.deepEqual(observed, expected);
    assert.equal(observed.header.id, 's1');
    assert.equal(observed.header.createdAt, 100);
    assert.equal(typeof observed.revision, 'string');
    observed.header.id = 'detached-copy';
    assert.equal((await workshop.readSessionMetadata('s1')).header.id, 's1');
    assert.deepEqual(await tree(root), before);
  });
});
test('trusted Session enumeration includes both unbound official Sessions and has no side effects', async () => {
  await runtime(async (workshop, p, root) => {
    const before = await tree(root);
    const sort = rows => rows.sort((a, b) => a.header.id.localeCompare(b.header.id));
    assert.deepEqual(sort(await workshop.listSessionMetadata()), sort([...await p.list()]));
    assert.deepEqual((await workshop.listSessionMetadata()).map(x => x.header.id).sort(), ['s1', 's2']);
    assert.deepEqual(await tree(root), before);
  });
});
test('a syntactically valid unknown Session fails by name and is never created', async () => {
  await runtime(async (workshop, p, root) => {
    const before = await tree(root);
    await assert.rejects(workshop.readSessionMetadata('unknown-session'), error => error.code === 'SESSION_NOT_FOUND');
    assert.equal(await p.stat('unknown-session'), undefined);
    assert.deepEqual(await tree(root), before);
  });
});
test('absence of the official metadata port rejects instead of using a projection or fabricated list', async () => {
  const workshop = new WorkshopV3({ projectionStore: { get() { assert.fail('projection is not Session authority'); } } });
  await assert.rejects(workshop.readSessionMetadata('s1'), error => error.code === 'CAPABILITY_UNAVAILABLE');
  await assert.rejects(workshop.listSessionMetadata(), error => error.code === 'CAPABILITY_UNAVAILABLE');
});
