import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from 'hanaworlds-contracts';
import { verifyContracts } from '../scripts/verify-contracts.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const installed = dirname(fileURLToPath(import.meta.resolve('hanaworlds-contracts/package.json')));
const spec = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git#semver:^0.5.6';

async function scratch(t, name) {
  const base = process.env.HW_RUNTIME_ROOT;
  assert.ok(base, 'isolated HW_RUNTIME_ROOT required');
  await mkdir(base, {recursive:true});
  const temp = await mkdtemp(join(base, name));
  t.after(() => rm(temp, {recursive:true,force:true}));
  return temp;
}
async function withManifest(t, edit) {
  const temp = await scratch(t, 'contracts-range-');
  for (const name of ['package.json','package-lock.json']) await cp(join(root,name),join(temp,name));
  const pkg = JSON.parse(await readFile(join(temp,'package.json'))), lock = JSON.parse(await readFile(join(temp,'package-lock.json')));
  edit(pkg, lock);
  await writeFile(join(temp,'package.json'), JSON.stringify(pkg));
  await writeFile(join(temp,'package-lock.json'), JSON.stringify(lock));
  return temp;
}

test('contracts: Git semver range from the contracts source, resolved by the lock, no vendor or provenance copy', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json')));
  assert.equal(pkg.dependencies['hanaworlds-contracts'], spec);
  assert.ok(!pkg.files.some(f => f.startsWith('vendor/') || f === 'CONTRACTS-PROVENANCE.json'));
  await assert.rejects(access(join(root, 'CONTRACTS-PROVENANCE.json')));
  await assert.rejects(access(join(root, 'vendor')));
  const proof = await verifyContracts();
  assert.equal(proof.spec, spec);
  assert.equal(proof.installedVersion, C.version);
  assert.match(proof.resolved, /#[0-9a-f]{40}$/);
  assert.equal(C.contractHandshake.contracts, `hanaworlds-contracts@${C.version}`);
  assert.equal(C.checkContractsVersion(C.contractHandshake.contracts).result, 'CONTRACTS_MAJOR_MATCH');
});

test('contracts: a tag or commit pin instead of a range is rejected', async t => {
  for (const pin of ['#v0.5.4', '#85687fc3811e4c8ee6e69410d46d8026e19d2c75', '#semver:0.5.4']) {
    const temp = await withManifest(t, (pkg, lock) => { pkg.dependencies['hanaworlds-contracts'] = lock.packages[''].dependencies['hanaworlds-contracts'] = `git+https://github.com/yzsnstotz/hanaworlds-contracts.git${pin}`; });
    await assert.rejects(verifyContracts({projectRoot:temp}), /CONTRACT_RANGE_REQUIRED/, pin);
  }
});

test('contracts: a declared range of another contracts major is rejected by the source predicate', async t => {
  const temp = await withManifest(t, (pkg, lock) => { pkg.dependencies['hanaworlds-contracts'] = lock.packages[''].dependencies['hanaworlds-contracts'] = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git#semver:^1.0.0'; });
  await assert.rejects(verifyContracts({projectRoot:temp}), e => e.code === 'UNSUPPORTED_VERSION');
});

test('contracts: a lock that does not match the declared range is rejected', async t => {
  const temp = await withManifest(t, (pkg, lock) => { lock.packages[''].dependencies['hanaworlds-contracts'] = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git#v0.5.4'; });
  await assert.rejects(verifyContracts({projectRoot:temp}), /CONTRACT_LOCK_SPEC_MISMATCH/);
});

test('contracts: an installed package other than the locked version is rejected', async t => {
  const temp = await scratch(t, 'contracts-installed-');
  await cp(installed, temp, {recursive:true});
  const p = JSON.parse(await readFile(join(temp, 'package.json')));
  p.version = '0.4.0';
  await writeFile(join(temp, 'package.json'), JSON.stringify(p));
  await assert.rejects(verifyContracts({packageRoot:temp}), /CONTRACT_INSTALLED_MISMATCH/);
});
