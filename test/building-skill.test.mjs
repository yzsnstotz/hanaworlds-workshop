import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Skills, { renderSkillContent } from '@deepseek-ai/dsh-skill';
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill';
let BuildingSkill; try { BuildingSkill = (await import(process.env.HW_WORKSHOP_BUILDING_SKILL_ENTRY ?? '../src/building-skill.mjs')).default; } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const { default: Workshop, WRITE_METHOD_PORTS } = await import(process.env.HW_WORKSHOP_PACKAGE_ENTRY ?? '../src/index.mjs');

// SOURCE/FIXTURE: official services + Workshop package's own late skill plugin.
// Full-content SHA oracles: exact bd964cdf/426ca1b1 stage0 baseline (40d72a58/3d0ec2c5/15f8e350 on main 5a63915f)
// plus the approved v1 edits, 0.5.2 guidance, v1.1 wire identifiers, optional absence and REGION confirmed-binding workflow.
// Current SHA oracles were derived from the prior exact full content + the two v1.1 difference edits before implementation; formatter/Region branches stay unchanged apart from wire.
// 0.7.2: derived again from the 0.7.1 full texts + the one bounded step-1 insertion (same reply), before running.
// Peer ports advertise fixture handshakes only; the agents service is a fixture.
// No AgentLoop/model/world/auth/server/profile is created or called.
const metadata = { name: 'hanaworlds-building' };
const expectedSha = {"object-available": "f8f5ab8289471b9d92e3fc80d23fab7981d48cd6c3b70f8d1e58cfe3aa96bd3c", "object-unavailable": "fc9f0a0ff655b49b8f58c73ee21435a89bd76afd00c722f34fa4ccb1a9686dee", "rejected-catch-null": "e73b9e1bc798f9151399ebd0d645430b4c2d7d3ce286af47b5ec10e8580bbba3", "resolved-null": "e73b9e1bc798f9151399ebd0d645430b4c2d7d3ce286af47b5ec10e8580bbba3", "config-undefined": "e73b9e1bc798f9151399ebd0d645430b4c2d7d3ce286af47b5ec10e8580bbba3"};
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
      assert.ok(loadedContent.includes('confirm with only {"action":"confirm"}'));
      assert.ok(loadedContent.includes('world[axis] = sampledBounds.min[axis] + local[axis]'));
      assert.ok(loadedContent.includes('roofBottomY - floorTopY - 1'));
      assert.ok(loadedContent.includes('isError=false'));
      assert.ok(loadedContent.includes('placementSourceRef and placementTarget together'));
      assert.ok(loadedContent.includes('never rebase old local geometry'));
      assert.ok(loadedContent.includes('PLACEMENT_REVISION_STALE'));
      assert.ok(loadedContent.includes('placement field is then omitted (never null)'));
      assert.ok(loadedContent.includes('Canvas checks its own recorded source inspection'));
      assert.equal(hash(loadedContent), expectedSha[scenario], 'full byte digest equals Desktop baseline plus the authorized guidance edits and wire identifiers at the same peer composition');
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
      const rendered = await ctx.tools.execute({name:'skill',callId:'full-skill-'+scenario,arguments:metadata,signal:new AbortController().signal});
      assert.equal(rendered.isError,false,JSON.stringify(rendered));
      counts.consume++;
      const renderedText = rendered.content.map(part=>part.text??'').join('');
      assert.equal(renderedText,renderSkillContent(definition),'actual official model-facing consumer preserves the full canonical wrapper and instructions');
      assert.ok(renderedText.includes('<skill_instructions>\n'+loadedContent+'\n</skill_instructions>'));
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
        fullContentSha256: hash(loadedContent), fullContent: loadedContent, consumedContentSha256: hash(output.content), renderedContentSha256: hash(renderedText), renderedContentBytes: Buffer.byteLength(renderedText),
        runtimeIdentity: { processId: process.pid, workshopEntry: process.env.HW_WORKSHOP_PACKAGE_ENTRY??new URL('../src/index.mjs',import.meta.url).href, skillEntry: process.env.HW_WORKSHOP_BUILDING_SKILL_ENTRY??new URL('../src/building-skill.mjs',import.meta.url).href, codeRuntimeAvailable: !!ctx.get('ptcRuntime'), codeToolExposed: ctx.tools.schemas().some(t=>t.name==='run_code') },
        originalBaselineEqual: false, authorizedGuidanceEdits: 7, candidateContracts: "1.1.0", afterLoadUnchanged, realModelCalls: 0, worldWrites: 0, productRuntime: false });
    } finally { await ctx.fiber.dispose(); }
  });
}
test.after(async () => {
  if (process.env.HW_SKILL_EVIDENCE_PATH) await writeFile(process.env.HW_SKILL_EVIDENCE_PATH, JSON.stringify(results, null, 2) + '\n');
});
