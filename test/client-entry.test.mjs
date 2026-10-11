import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../client.cjs', import.meta.url), 'utf8');
function client() {
  let exports;
  const errors = [];
  runInNewContext(source, {
    console: { error: (...args) => errors.push(args) },
    window: { __ModuleLoader__: { load({ factory }) {
      exports = factory(() => ({ createElement: (type, props, ...children) =>
        ({ type, props, children }) }));
    } } },
  });
  return { exports, errors };
}
function host(failAt) {
  const entries = new Map();
  let unsubscribed = 0;
  const effects = [];
  const ctx = {
    get() { if (failAt === 'transport') throw Error('TRANSPORT_SETUP_FAILED'); },
    sessions: { list: {
      getSnapshot() {
        if (failAt === 'session') throw Error('SESSION_SNAPSHOT_FAILED');
        return { byId: { s1: { title: 'Session 1', retainedBy: { mainView: 1 } } } };
      },
      subscribe() { return () => { unsubscribed++; }; },
    } },
    effect(setup) { effects.push(setup()); },
    slots: {
      inject(_name, register) { return register(); },
      register(meta, component) {
        const key = meta.key ?? meta.id;
        if (failAt === 'sidebar' && key === 'hanaworlds-workshop-image-links' && meta.name === 'sidebar.panellist')
          throw Error('IMAGE_SIDEBAR_SETUP_FAILED');
        const id = `${meta.name}:${key}`;
        assert.equal(entries.has(id), false, 'no duplicate slot entries');
        entries.set(id, { meta, component });
        return () => entries.delete(id);
      },
    },
  };
  return { ctx, entries, effects, unsubscribed: () => unsubscribed };
}
function render(element) {
  return typeof element.type === 'function' ? render(element.type(element.props)) :
    { ...element, children: element.children.map(child =>
      child && typeof child === 'object' ? render(child) : child) };
}

for (const [point, reason] of [
  ['transport', 'TRANSPORT_SETUP_FAILED'], ['session', 'SESSION_SNAPSHOT_FAILED'],
  ['sidebar', 'IMAGE_SIDEBAR_SETUP_FAILED'],
]) test(`apply isolates ${point} initialization failure in a named Workshop card`, () => {
  const { exports, errors } = client(), fixture = host(point);
  assert.doesNotThrow(() => exports.apply(fixture.ctx));
  const panel = fixture.entries.get('main:hanaworlds-workshop');
  assert.ok(panel, 'Workshop fault panel stays reachable');
  const card = render(panel.component());
  assert.match(JSON.stringify(card), /hanaworlds-workshop/);
  assert.match(JSON.stringify(card), new RegExp(reason));
  assert.match(JSON.stringify(card), /"role":"alert"/);
  assert.match(fixture.entries.get('sidebar.panellist:hanaworlds-workshop').meta.label(), /故障/);
  assert.equal(fixture.entries.has('main:hanaworlds-workshop-image-links'), false);
  assert.equal(errors.length, 1, 'original initialization failure is recorded');
  if (point === 'sidebar') {
    assert.equal(fixture.unsubscribed(), 1, 'partial subscription is cleaned up');
    fixture.effects.forEach(dispose => dispose());
    assert.equal(fixture.unsubscribed(), 1, 'host unload cannot dispose twice');
  }
  // The same host continues accepting unrelated plugins after Workshop fails.
  assert.doesNotThrow(() => fixture.ctx.slots.register({ name: 'main', key: 'other-plugin' }, () => 'healthy'));
});

test('successful apply retains both normal panels and cleans up its Session subscription on unload', () => {
  const { exports, errors } = client(), fixture = host();
  exports.apply(fixture.ctx);
  assert.equal(errors.length, 0);
  assert.equal(fixture.entries.size, 4);
  assert.equal(fixture.entries.get('main:hanaworlds-workshop').component().type, exports.WorkshopPanel);
  assert.equal(fixture.entries.get('main:hanaworlds-workshop-image-links').component().type, exports.ImageLinkPanel);
  fixture.effects.forEach(dispose => dispose());
  assert.equal(fixture.unsubscribed(), 1);
});
