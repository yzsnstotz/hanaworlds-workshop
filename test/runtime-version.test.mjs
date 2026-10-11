import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WorkshopV3 } from '../src/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
test('Workshop status and protocol handshake report the package manifest version', () => {
  const service = new WorkshopV3();
  assert.equal(service.status().version, manifest.version);
  assert.equal(service.status().component, manifest.name);
  assert.deepEqual(service.status().contractHandshake, service.contractHandshake);
  assert.equal(service.status().protocolHandshake.provenance.packageVersion, manifest.version);
  assert.equal(service.protocolHandshake.provenance.packageVersion, manifest.version);
});

test('a manifest-only version change updates status and handshake without editing runtime source', async t => {
  const base = process.env.HW_RUNTIME_ROOT ?? tmpdir();
  await mkdir(base, { recursive: true });
  const scratch = await mkdtemp(join(base, 'workshop-version-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const dir of ['src', 'lib']) await cp(join(root, dir), join(scratch, dir), { recursive: true });
  await symlink(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  await writeFile(join(scratch, 'package.json'), JSON.stringify({ ...manifest, version: '9.8.7' }));
  const { WorkshopV3: ChangedWorkshop } = await import(pathToFileURL(join(scratch, 'src/index.mjs')));
  const service = new ChangedWorkshop();
  assert.equal(service.protocolHandshake.provenance.packageVersion, '9.8.7');
  assert.equal(service.status().version, '9.8.7');
  assert.equal(service.status().protocolHandshake.provenance.packageVersion, '9.8.7');
});
