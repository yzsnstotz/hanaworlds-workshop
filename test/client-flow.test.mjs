import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function clientModule() {
  let definition;
  runInNewContext(readFileSync(new URL('../client.cjs', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
  });
  return definition.factory(name => {
    if (name === 'react') return { createElement() {} };
    if (name === 'dsh-tauri') return { invoke() {} };
    throw Error(`unexpected module ${name}`);
  });
}

function packet(requestId, result, error = null) {
  return { contractVersion: 'session/v2', requestId, result, error };
}

test('client flow sends the current DSH Session through the desktop bridge without identity refs', async () => {
  const client = clientModule();
  const requests = [];
  const snapshot = revision => ({ context: { currentSession: 'session-a',
    activeWorldRef: revision === 'rev-1' ? null : 'world-a', sessionRevision: revision,
    orderedSelectedObjectRefs: [], selectionRevision: 'sel-1' }, turns: [],
    capabilities: {}, sessionDeleteSupported: false });
  const calls = [packet('id-1', snapshot('rev-1')),
    packet('id-2', snapshot('rev-2')),
    packet('id-3', { sessionRef: 'session-a', turnRef: 'id-4',
      turnRevision: 'rev-turn', briefDigest: null, model: 'gpt-5.6-luna',
      resultText: '请确认一块方块，尺寸为 1×1×1。',
      clarification: { turnRef: 'id-4', clarificationId: 'clarify-1' } }),
    packet('id-5', { ...snapshot('rev-3'), turns: [{ turnRef: 'id-4',
      text: '放一个方块', referenceBriefDigest: null }] })];
  let n = 0;
  const flow = client.createWorkshopFlow({
    currentSessionRef: () => 'session-a',
    newId: () => `id-${++n}`,
    invoke: async (command, args) => {
      assert.equal(command, 'hanaworlds_request');
      requests.push(args);
      if (args.operation === 'context') return args.input.sessionRef
        ? { status: 'bound', sessionRef: 'session-a', worldRef: 'world-a' }
        : { sessions: [{ sessionRef: 'session-a', label: 'Session 1' }] };
      return calls.shift();
    },
  });
  await flow.open();
  await flow.submit('放一个方块');
  const operations = requests.filter(item => item.operation === 'workshop')
    .map(item => item.input.operation);
  assert.deepEqual(operations, ['StartOrResumeSession', 'SwitchWorldContext',
    'AppendMultimodalTurn', 'StartOrResumeSession']);
  for (const request of requests.filter(item => item.operation === 'workshop')) {
    assert.equal(request.input.sessionRef, 'session-a');
    for (const key of ['actorRef', 'sessionRef', 'authorizationRef', 'worldRef'])
      assert.equal(Object.hasOwn(request.input.payload, key), false, key);
  }
  assert.equal(requests.find(item => item.input?.operation === 'AppendMultimodalTurn')
    .input.payload.text, '放一个方块');
  assert.equal(flow.snapshot().turns[0].text, '放一个方块');
  assert.equal(flow.snapshot().reply, '请确认一块方块，尺寸为 1×1×1。');
});

test('client flow refuses missing trusted binding before calling Workshop', async () => {
  const client = clientModule();
  const requests = [];
  const flow = client.createWorkshopFlow({
    currentSessionRef: () => 'session-a', newId: () => 'id-1',
    invoke: async (_command, args) => {
      requests.push(args);
      return args.input.sessionRef
        ? { status: 'unbound', sessionRef: 'session-a' }
        : { sessions: [{ sessionRef: 'session-a', label: 'Session 1' }] };
    },
  });
  await flow.open();
  assert.match(flow.snapshot().error, /绑定/);
  assert.equal(flow.snapshot().ready, false);
  assert.deepEqual(requests.map(item => item.operation), ['context', 'context']);
  await flow.submit('放一个方块');
  assert.deepEqual(requests.map(item => item.operation), ['context', 'context']);
});

test('client chooses only a Shell-listed bound live Session when DSH has no current conversation', async () => {
  const client = clientModule();
  const requests = [];
  const flow = client.createWorkshopFlow({
    currentSessionRef: () => null, newId: () => 'id-1',
    invoke: async (_command, args) => {
      requests.push(args);
      if (args.operation === 'context') return args.input.sessionRef
        ? { status: args.input.sessionRef === 'session-b' ? 'bound' : 'unbound',
          sessionRef: args.input.sessionRef, worldRef: 'world-b' }
        : { sessions: [
          { sessionRef: 'session-a', label: 'Session 1' },
          { sessionRef: 'session-b', label: 'Session 2' },
        ] };
      return packet('id-1', { context: { currentSession: 'session-b',
        activeWorldRef: 'world-b', sessionRevision: 'rev-1' }, turns: [] });
    },
  });
  await flow.open();
  assert.equal(flow.snapshot().ready, false);
  assert.deepEqual(JSON.parse(JSON.stringify(flow.snapshot().sessions.map(item => item.label))),
    ['Session 2']);
  flow.chooseSession('session-a');
  assert.equal(flow.snapshot().selectedSessionRef, null);
  flow.chooseSession('session-b');
  await flow.open();
  assert.equal(flow.snapshot().ready, true);
  assert.equal(flow.snapshot().sessionRef, 'session-b');
  assert.deepEqual(requests.filter(item => item.operation === 'workshop')
    .map(item => item.input.sessionRef), ['session-b']);
});
