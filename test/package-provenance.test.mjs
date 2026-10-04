import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'vendor', 'contracts');

test('Workshop package uses a pinned admitted Contracts runtime closure without exotic subdependencies', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.dependencies['hanaworlds-contracts'], undefined);
  assert.equal(pkg.dependencies.canonicalize, '5.1.0');
  assert.equal(pkg.files.includes('vendor/contracts/'), true);
  assert.equal(lock.packages['node_modules/hanaworlds-contracts'], undefined);
  assert.equal(JSON.stringify(lock).includes('codeload.github.com'), false);
  const { verifyVendoredContracts } = await import('../scripts/verify-vendored-contracts.mjs');
  const proof = await verifyVendoredContracts();
  assert.equal(proof.sourceRevision, '3d64364782181c8b5abc3150f8fa9f7ae20bf101');
  assert.equal(proof.admittedPackSha256,
    '48f0b56a3b385bd3a17773fd968c0566068fe1a28ecb4aa08d9686d254cdbb0a');
  assert.ok(proof.runtimeModuleCount > 0);
  assert.equal(proof.fixtureCount, 1);
});

test('Workshop rejects altered vendored Contracts source and manifest', async t => {
  const { verifyVendoredContracts } = await import('../scripts/verify-vendored-contracts.mjs');
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-UNDO-01');
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
