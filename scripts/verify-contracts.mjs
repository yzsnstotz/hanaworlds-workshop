// Build prerequisite: candidate tag/commit plus exact installed public package bytes.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const pin = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git#v0.5.4-rc.1';
const revision = '0beeff5774db476c0128683ca6107a28bdcdcbee';
const sha = '51902797a167a222d812c344871bb1c0774ae775fb0026d70381edd4c08f17ed';
export async function verifyContracts({ projectRoot = fileURLToPath(new URL('../', import.meta.url)),
 packageRoot = dirname(fileURLToPath(import.meta.resolve('hanaworlds-contracts/package.json'))) } = {}) {
 const readJSON = async name => JSON.parse(await readFile(join(projectRoot, name)));
 const manifest = await readJSON('CONTRACTS-PROVENANCE.json');
 if (manifest.packageName !== 'hanaworlds-contracts' || manifest.packageVersion !== '0.5.4-rc.1' || manifest.sourceTag !== 'v0.5.4-rc.1' || manifest.sourceRevision !== revision || manifest.tagObject !== 'f2600bd84bbc6b53ae9b52a0baadeb5c1c8336ef' || manifest.artifactBytes !== 157755 || manifest.artifactSha256 !== sha || manifest.files.length !== 26) throw Error('CANDIDATE_CONTRACT_PROVENANCE_MISMATCH');
 const pkg = await readJSON('package.json'), lock = await readJSON('package-lock.json');
 const dep = lock.packages['node_modules/hanaworlds-contracts'];
 if (pkg.dependencies['hanaworlds-contracts'] !== pin || dep.version !== '0.5.4-rc.1' || dep.resolved !== pin.replace('v0.5.4-rc.1', revision)) throw Error('CANDIDATE_CONTRACT_LOCK_MISMATCH');
 const installed = JSON.parse(await readFile(join(packageRoot, 'package.json')));
 if (installed.name !== manifest.packageName || installed.version !== manifest.packageVersion) throw Error('CANDIDATE_CONTRACT_PACKAGE_MISMATCH');
 const seen = new Set();
 for (const f of manifest.files) {
  if (typeof f.path !== 'string' || f.path.startsWith('/') || f.path.split('/').includes('..') || seen.has(f.path)) throw Error('CANDIDATE_CONTRACT_FILE_PATH');
  seen.add(f.path);
  const bytes = await readFile(join(packageRoot, f.path));
  if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw Error(`CONTRACT_FILE_DIGEST_MISMATCH:${f.path}`);
 }
 return { sourceTag: manifest.sourceTag, sourceRevision: revision, artifactSha256: sha, filesVerified: seen.size, installedPackageRoot: packageRoot };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await verifyContracts()));
