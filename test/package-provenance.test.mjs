import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from 'hanaworlds-contracts';
let verifyContracts;
try { ({ verifyContracts } = await import('../scripts/verify-contracts.mjs')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const root = fileURLToPath(new URL('../', import.meta.url));
const installed = dirname(fileURLToPath(import.meta.resolve('hanaworlds-contracts/package.json')));
const pin = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git#v0.5.3';
const revision = '3457493da209178f815d6950e323e1dc462e8d6c';
const sha = '7f2b088b300426ea2536e08904780dc5df94eaf5e341e83cbff0cc3a42362241';

test('formal contracts: Git tag/commit and exact published package files are verified, with no vendor', async () => {
  assert.equal(typeof verifyContracts, 'function', 'formal provenance verifier must exist');
  const pkg = JSON.parse(await readFile(join(root, 'package.json')));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json')));
  assert.equal(pkg.dependencies['hanaworlds-contracts'], pin);
  assert.equal(lock.packages['node_modules/hanaworlds-contracts'].resolved, pin.replace('v0.5.3', revision));
  assert.equal(C.version, '0.5.3');
  assert.equal(C.contractHandshake.contracts, 'hanaworlds-contracts@0.5.3');
  assert.ok(!pkg.files.some(f => f.startsWith('vendor/')));
  const proof = await verifyContracts();
  assert.equal(proof.sourceRevision, revision);
  assert.equal(proof.formalPackSha256, sha);
  assert.equal(proof.filesVerified, 25);
});

test('formal contracts: same version with altered runtime bytes is rejected', async t => {
  assert.equal(typeof verifyContracts, 'function');
  const base = process.env.HW_RUNTIME_ROOT;
  assert.ok(base, 'isolated HW_RUNTIME_ROOT required');
  await mkdir(base, {recursive:true});
  const temp = await mkdtemp(join(base, 'formal-provenance-'));
  t.after(() => rm(temp, {recursive:true,force:true}));
  await cp(installed, temp, {recursive:true});
  await appendFile(join(temp, 'dist/local/runtime.mjs'), '\n');
  assert.equal(JSON.parse(await readFile(join(temp, 'package.json'))).version, '0.5.3');
  await assert.rejects(verifyContracts({packageRoot:temp}), /CONTRACT_FILE_DIGEST_MISMATCH:dist\/local\/runtime.mjs/);
});

test('formal contracts: a changed provenance revision is rejected', async t => {
  assert.equal(typeof verifyContracts, 'function');
  const base = process.env.HW_RUNTIME_ROOT;
  assert.ok(base, 'isolated HW_RUNTIME_ROOT required');
  await mkdir(base, {recursive:true});
  const temp = await mkdtemp(join(base, 'formal-manifest-'));
  t.after(() => rm(temp, {recursive:true,force:true}));
  for (const name of ['package.json','package-lock.json','CONTRACTS-PROVENANCE.json']) await cp(join(root,name),join(temp,name));
  const manifest = JSON.parse(await readFile(join(temp, 'CONTRACTS-PROVENANCE.json')));
  manifest.sourceRevision = '0'.repeat(40);
  await writeFile(join(temp, 'CONTRACTS-PROVENANCE.json'), JSON.stringify(manifest));
  await assert.rejects(verifyContracts({projectRoot:temp}), /FORMAL_CONTRACT_PROVENANCE_MISMATCH/);
});
