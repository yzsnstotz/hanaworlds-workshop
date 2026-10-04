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
  assert.equal(proof.sourceRevision, '896f8b9ebd75f8dbe5657f48c41c53d52c61f94b');
  assert.equal(proof.admittedPackSha256,
    '3087ea0d12e80f348d02f2e4057d78a8c36e434409fa788a001cddf80f01c422');
  assert.ok(proof.runtimeModuleCount > 0);
  assert.equal(proof.fixtureCount, 1);
});

test('Workshop rejects altered vendored Contracts source and manifest', async t => {
  const { verifyVendoredContracts } = await import('../scripts/verify-vendored-contracts.mjs');
  const base = join(homedir(), '.cache', 'hanaworlds-runs', 'S1-WS-INPUT-01');
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
