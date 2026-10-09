import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Skills from '@deepseek-ai/dsh-skill';
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill';
let BuildingSkill; try { BuildingSkill = (await import(process.env.HW_WORKSHOP_BUILDING_SKILL_ENTRY ?? '../src/building-skill.mjs')).default; } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const { default: Workshop, WRITE_METHOD_PORTS } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');

// SOURCE/FIXTURE: official services + Workshop package's own late skill plugin.
// Full-content SHA oracles: exact bd964cdf/426ca1b1 stage0 baseline (40d72a58/3d0ec2c5/15f8e350 on main 5a63915f)
// plus only the contracts v1 edits: step-1 siteRules proposal sentence and renamed wire ids (rc.2: incl. canvas-region/v2); no duplicated production formatter.
// Peer ports advertise fixture handshakes only; the agents service is a fixture.
// No AgentLoop/model/world/auth/server/profile is created or called.
const metadata = { name: 'hanaworlds-building' };
const expectedSha = { 'object-available': '90a96943e573aac565615a5284fe7fa02c3863b6a16667ea8c722428ada14c9a', 'object-unavailable': '053617699aa6f5e11586e070dd29260cafd890981c451af9ac80f067f373d45b', 'rejected-catch-null': 'a3a29f85355ec9d8b40b0f6f22647831225e25cbd842119713e1d85e7ae3134f', 'resolved-null': 'a3a29f85355ec9d8b40b0f6f22647831225e25cbd842119713e1d85e7ae3134f', 'config-undefined': 'a3a29f85355ec9d8b40b0f6f22647831225e25cbd842119713e1d85e7ae3134f' };
const results = [];
const hash = value => createHash('sha256').update(value).digest('hex');
function peerPorts() {
  return Object.fromEntries(Object.values(WRITE_METHOD_PORTS).flat().map(spec => {
    const match = /^(.*)\/[vV]?(\d+)$/.exec(spec.wire);
    assert.ok(match, spec.wire);
    return [spec.field, {
      fixtureIdentity: 'stage0-handshake-only-' + spec.field,
      protocolHandshake: {
        profileVersion: 'protocol-handshake/v1', component: 'stage0-' + spec.field,
        protocols: [{ protocol: match[1], major: Number(match[2]), minor: spec.minMinor ?? 0 }],
        capabilities: [...spec.capabilities].sort(), provenance: { packageName: 'stage0-' + spec.field, packageVersion: '0.0.99-fixture', sourceRevision: 'a'.repeat(40), artifactDigest: 'b'.repeat(64) },
      },
    }];
  }));
}

for (const scenario of ['object-available', 'object-unavailable', 'rejected-catch-null', 'resolved-null', 'config-undefined']) {
  test(scenario + ': native plugin await orders one registration and official tool consumes exact full content', async () => {
    assert.ok(BuildingSkill?.apply, 'Workshop own public late registration plugin must exist');
    const ctx = new Context();
    const order = [];
    const counts = { describe: 0, register: 0, consume: 0 };
    const ports = scenario === 'object-available' ? peerPorts() : {};
    let ready = false, beforeAssembly, loadedContent;
    try {
      await ctx.plugin(SystemPrompt).await();
      await ctx.plugin(Tools).await();
      await ctx.plugin(Skills).await();
      ctx.provide('agents', { fixtureIdentity: 'stage0-no-model-agents-service' });
      await ctx.plugin(Workshop).await();
      const ws = ctx.get('hanaworldsWorkshop');
      const actualDescribe = ws.describeWriteTools.bind(ws);
      if (scenario === 'object-available') beforeAssembly = await actualDescribe(null);

      const peerPlugin = { name: 'stage0-peer-composition-fixture', async apply(peerCtx) {
        order.push('peers:apply');
        await Promise.resolve(); // async fixture apply; awaited via official Fiber.await, no scheduler or polling.
        for (const spec of Object.values(WRITE_METHOD_PORTS).flat()) {
          if (ports[spec.field]) peerCtx.provide(spec.service, ports[spec.field]);
        }
        ready = true;
        order.push('peers:ready');
      } };
      const peerFiber = ctx.plugin(peerPlugin);
      await peerFiber.await();
      assert.equal(ready, true);
      order.push('peers:await-settled');

      ws.describeWriteTools = async sessionRef => {
        counts.describe++;
        assert.equal(sessionRef, null);
        assert.equal(ready, true);
        if (scenario === 'rejected-catch-null') throw Error('FIXTURE_DESCRIPTION_REJECTED');
        if (scenario === 'resolved-null') return null;
        if (scenario === 'config-undefined') return undefined;
        return actualDescribe(sessionRef);
      };
      const registry = ctx.get('skills');
      const originalRegister = registry.register;
      registry.register = function(definition) {
        assert.equal(ready, true);
        counts.register++;
        loadedContent = definition.content;
        order.push('skill:registered');
        return originalRegister.call(this, definition);
      };
      assert.equal((await ctx.skills.list()).length, 0, 'Workshop service does not register early');
      const registration = BuildingSkill;
      const registrationFiber = ctx.plugin(registration);
      await registrationFiber.await();
      await registrationFiber.await(); // awaiting the same settled fiber must not reapply/register.
      assert.equal(registrationFiber.state, 2); // official Cordis FiberState.ACTIVE
      assert.equal(counts.register, 1);
      assert.equal(counts.describe, 1);
      assert.equal(hash(loadedContent), expectedSha[scenario], 'full byte digest equals exact Desktop source baseline at the same peer composition');
      assert.ok(order.indexOf('peers:await-settled') < order.indexOf('skill:registered'));
      if (scenario === 'object-available') {
        assert.ok(beforeAssembly.tools.every(t => !t.availability.available), 'before peer composition the original public descriptions differ');
        assert.ok(!loadedContent.includes('Unavailable when loaded:'));
      } else if (scenario === 'object-unavailable') {
        assert.ok(loadedContent.includes('Unavailable when loaded: PEER_UNAVAILABLE'));
      } else {
        assert.ok(loadedContent.includes("Workshop's self-description was unavailable"));
      }
      await ctx.plugin(ToolSkill).await();
      order.push('tool-skill:loaded');
      const summaries = await ctx.skills.list();
      assert.equal(summaries.filter(s => s.name === metadata.name).length, 1);
      const definition = await ctx.skills.get(metadata.name);
      assert.equal(definition.content, loadedContent);
      const tool = ctx.tools.get('skill');
      assert.ok(tool, 'official model-facing skill tool registered');
      const output = await tool.execute({ name: metadata.name }, { signal: new AbortController().signal });
      counts.consume++;
      order.push('skill:consumed');
      assert.equal(output.content, loadedContent);
      assert.equal(hash(output.content), expectedSha[scenario]);
      assert.equal(output.name, metadata.name);
      assert.equal(counts.register, 1);
      // Changing peer state after load does not trigger a refresh or a second registration.
      let afterLoadUnchanged = true;
      if (scenario === 'object-available') {
        ports.brush.protocolHandshake = null;
        const changed = await actualDescribe(null);
        assert.equal(changed.tools[0].availability.available, false);
        afterLoadUnchanged = (await ctx.skills.get(metadata.name)).content === loadedContent;
        assert.equal(afterLoadUnchanged, true);
        assert.equal(counts.register, 1);
      }
      results.push({ scenario, fixtureIdentity: 'stage0-' + scenario, order, counts,
        source: 'Desktop bd964cdf/426ca1b1 baseline; current Workshop source/package; official packages 0.2.0-rc.2/Cordis 4.0.4',
        generatedBranch: scenario.startsWith('object-') ? 'object' : 'null', inputRejected: scenario === 'rejected-catch-null',
        configNullishCoalescingPreserved: true, fullContentBytes: Buffer.byteLength(loadedContent),
        fullContentSha256: hash(loadedContent), fullContent: loadedContent, consumedContentSha256: hash(output.content),
        originalBaselineEqual: true, afterLoadUnchanged, realModelCalls: 0, worldWrites: 0, productRuntime: false });
    } finally { await ctx.fiber.dispose(); }
  });
}
test.after(async () => {
  if (process.env.HW_SKILL_EVIDENCE_PATH) await writeFile(process.env.HW_SKILL_EVIDENCE_PATH, JSON.stringify(results, null, 2) + '\n');
});
