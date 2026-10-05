import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'vendor', 'contracts');

test('Workshop uses the exact public Contracts 0.3.8 pin and preserves its prior vendor closure', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const source = 'https://codeload.github.com/yzsnstotz/hanaworlds-contracts/tar.gz/ef681148fc4fd6e7871fcc8417baf102abf01b28';
  assert.equal(pkg.dependencies['hanaworlds-contracts'], source);
  assert.equal(pkg.dependencies.canonicalize, '5.1.0');
  assert.equal(pkg.files.includes('vendor/contracts/'), true);
  assert.equal(lock.packages['node_modules/hanaworlds-contracts'].resolved, source);
  assert.equal(lock.packages['node_modules/hanaworlds-contracts'].version, '0.3.8');
  assert.match(lock.packages['node_modules/hanaworlds-contracts'].integrity, /^sha512-/);
  const runtime = await import('hanaworlds-contracts/v4');
  assert.equal(runtime.contractHandshake.contracts, 'hanaworlds-contracts@0.3.8');
  const { verifyVendoredContracts } = await import('../scripts/verify-vendored-contracts.mjs');
  const proof = await verifyVendoredContracts();
  assert.equal(proof.sourceRevision, '295cbc7fd0d8a1e56a0d89e651947e668f2ad658');
  assert.equal(proof.admittedPackSha256,
    '4cee3e9067072d86c95799334a623bd278a5b995da0b9316934fb0722e837f62');
  assert.ok(proof.runtimeModuleCount > 0);
  assert.equal(proof.fixtureCount, 1);
});

test('Workshop rejects altered vendored Contracts source and manifest', async t => {
  const { verifyVendoredContracts } = await import('../scripts/verify-vendored-contracts.mjs');
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-BUILD-ENTRY-01');
  await mkdir(base, { recursive: true });
  const temp = await mkdtemp(join(base, 'contracts-pin-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await cp(vendor, temp, { recursive: true });
  const source = join(temp, 'dist', 'v4', 'runtime.mjs');
  const exact = await readFile(source);
  await appendFile(source, '\n');
  await assert.rejects(() => verifyVendoredContracts(temp),
    /VENDOR_FILE_DIGEST_MISMATCH:dist\/v4\/runtime\.mjs/);
  await writeFile(source, exact);
  await appendFile(join(temp, 'PROVENANCE.json'), '\n');
  await assert.rejects(() => verifyVendoredContracts(temp),
    /VENDOR_MANIFEST_DIGEST_MISMATCH/);
});
