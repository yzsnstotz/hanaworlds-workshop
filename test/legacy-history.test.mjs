import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { LegacyHistoryService, LegacyHistoryStore } from '../archive/workshop-01/src/legacy-history.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value === null || typeof value !== 'object'
  ? JSON.stringify(value) : Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;

function fixture() {
  const projectId = 'proj-old';
  const creationSessionId = 'cs-old';
  const actorName = 'HanaOwner';
  const turns = [
    { seq: 2, utterance: '先画一座门', action: { kind: 'ask_one', text: '请给尺寸' } },
    { seq: 4, utterance: '宽三格', action: { kind: 'propose_design', text: '三格宽小门' } },
  ];
  const events = [{ type: 'project.created', seq: 1,
    project: { projectId, creationSessionId, ownerId: actorName } }];
  const evidence = [];
  for (const item of turns) {
    const response = { projectId, creationSessionId, revision: item.seq,
      summary: { text: item.action.text }, action: item.action };
    const clientRequestId = `request-${item.seq}`;
    events.push({ type: 'turn.committed', seq: item.seq, projectId,
      turn: { utterance: item.utterance, response, record: { projectId,
        clientRequestId, utteranceDigest: sha(item.utterance),
        responseDigest: sha(canonical(response)) } } });
    evidence.push(JSON.stringify({ schema: 'hanaworlds.workshop-turn-evidence.v1',
      actorId: actorName, projectId, clientRequestIdDigest: sha(clientRequestId),
      utteranceDigest: sha(item.utterance), actionKind: item.action.kind }));
  }
  return { projectId, creationSessionId, actorName,
    panelJson: JSON.stringify({ schema: 'hanaworlds.workshop-panel-sessions.v1',
      sessions: { [actorName]: { projectId, creationSessionId } } }),
    projectMemoryJson: JSON.stringify({ global: { events } }), evidenceJson: evidence };
}

async function mount(root) {
  const ctx = new Context();
  for (const [plugin, config] of [
    [Storage, undefined], [StorageJson, { root }],
    [StorageDomain, { backend: 'json' }],
  ]) await ctx.plugin(plugin, config).await();
  const store = new LegacyHistoryStore(() => ctx.get('storageDomain'));
  return { ctx, store, service: new LegacyHistoryService(store) };
}

test('imports exact legacy text and response into a separate durable read-only archive', async () => {
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-ELECTRON-HISTORY-01');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'legacy-domain-'));
  const source = fixture();
  try {
    const first = await mount(root);
    try {
      assert.equal((await first.service.importArchive(source)).status, 'IMPORTED');
      assert.equal((await first.service.importArchive(source)).status, 'ALREADY_IMPORTED');
      const archive = await first.service.readArchive(source);
      assert.equal(archive.kind, 'LEGACY_PROJECT_ARCHIVE');
      assert.equal(archive.readOnly, true);
      assert.deepEqual(archive.turns.map(turn => turn.utterance),
        ['先画一座门', '宽三格']);
      assert.equal(archive.turns[1].response.action.text, '三格宽小门');
      assert.deepEqual(archive.turns.map(turn => turn.source.seq), [2, 4]);
      assert.equal(Object.hasOwn(archive, 'sessionRef'), false);
      assert.equal(Object.hasOwn(archive, 'grantRef'), false);
    } finally { await first.store.close(); await first.ctx.fiber.dispose(); }
    const second = await mount(root);
    try {
      assert.equal((await second.service.readArchive(source)).turns.length, 2);
      assert.equal((await second.service.listArchives({ actorName: source.actorName })).length, 1);
    } finally { await second.store.close(); await second.ctx.fiber.dispose(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing content, wrong project, missing evidence and conflicting reimport never publish history', async () => {
  const source = fixture();
  const records = new Map();
  const store = { get: async id => records.get(id) ?? null,
    put: async (id, value) => { records.set(id, structuredClone(value)); },
    list: async () => [...records.values()] };
  const service = new LegacyHistoryService(store);
  const badText = structuredClone(source);
  const memory = JSON.parse(badText.projectMemoryJson);
  delete memory.global.events[1].turn.utterance;
  badText.projectMemoryJson = JSON.stringify(memory);
  await assert.rejects(() => service.importArchive(badText), /SOURCE_CONTENT_MISSING/);
  const wrongProject = { ...source, projectId: 'proj-other' };
  await assert.rejects(() => service.importArchive(wrongProject), /SOURCE_ASSOCIATION_MISMATCH/);
  const noEvidence = { ...source, evidenceJson: source.evidenceJson.slice(1) };
  await assert.rejects(() => service.importArchive(noEvidence), /SOURCE_EVIDENCE_MISSING/);
  const falseEvidence = { ...source, evidenceJson: [...source.evidenceJson] };
  const changed = JSON.parse(falseEvidence.evidenceJson[0]);
  changed.utteranceDigest = '0'.repeat(64);
  falseEvidence.evidenceJson[0] = JSON.stringify(changed);
  await assert.rejects(() => service.importArchive(falseEvidence), /SOURCE_EVIDENCE_MISMATCH/);
  assert.equal(records.size, 0);
  await service.importArchive(source);
  const different = { ...source, evidenceJson: [...source.evidenceJson].reverse() };
  await assert.rejects(() => service.importArchive(different), /ARCHIVE_CONFLICT/);
  await assert.rejects(() => service.readArchive({ ...source,
    creationSessionId: 'cs-other' }), /SOURCE_ASSOCIATION_MISMATCH/);
  assert.equal((await service.readArchive(source)).turns.length, 2);
});

test('concurrent imports cannot overwrite a different archived source', async () => {
  const source = fixture();
  const different = { ...source, evidenceJson: [...source.evidenceJson].reverse() };
  const records = new Map();
  const service = new LegacyHistoryService({
    async get(id) { await new Promise(resolve => setImmediate(resolve));
      return records.get(id) ?? null; },
    async put(id, value) { await new Promise(resolve => setImmediate(resolve));
      records.set(id, structuredClone(value)); },
  });
  const results = await Promise.allSettled([
    service.importArchive(source), service.importArchive(different),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' &&
    result.reason?.code === 'ARCHIVE_CONFLICT').length, 1);
  assert.equal(records.size, 1);
});
