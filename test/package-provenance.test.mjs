import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  assert.equal(proof.sourceRevision, 'e82735780bdfd4ea8e662781455040a6e5306121');
  assert.equal(proof.admittedPackSha256,
    '47a2e5cc77590fb471ffedde715682564e169a0d88dbc5005b71d8d542b38f5c');
  assert.ok(proof.runtimeModuleCount > 0);
  assert.equal(proof.fixtureCount, 1);
});

test('Workshop rejects altered vendored Contracts source and manifest', async t => {
  const { verifyVendoredContracts } = await import('../scripts/verify-vendored-contracts.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'workshop-contracts-pin-'));
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
