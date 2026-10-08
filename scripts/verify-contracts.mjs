// Build prerequisite: formal tag/commit plus exact installed public package bytes.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const pin = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git#v0.5.4';
const revision = '85687fc3811e4c8ee6e69410d46d8026e19d2c75';
const sha = 'b920097dee8bf57ef44cc9ca964829e568b14c9e1b15a77bf4599f69391062ec';
export async function verifyContracts({ projectRoot = fileURLToPath(new URL('../', import.meta.url)),
 packageRoot = dirname(fileURLToPath(import.meta.resolve('hanaworlds-contracts/package.json'))) } = {}) {
 const readJSON = async name => JSON.parse(await readFile(join(projectRoot, name)));
 const manifest = await readJSON('CONTRACTS-PROVENANCE.json');
 if (manifest.packageName !== 'hanaworlds-contracts' || manifest.packageVersion !== '0.5.4' || manifest.sourceTag !== 'v0.5.4' || manifest.sourceRevision !== revision || manifest.tagObject !== 'b3721db855ffe08dfa524e6eea6a5da4eed4c220' || manifest.artifactBytes !== 157837 || manifest.artifactSha256 !== sha || manifest.files.length !== 26) throw Error('FORMAL_CONTRACT_PROVENANCE_MISMATCH');
 const pkg = await readJSON('package.json'), lock = await readJSON('package-lock.json');
 const dep = lock.packages['node_modules/hanaworlds-contracts'];
 if (pkg.dependencies['hanaworlds-contracts'] !== pin || dep.version !== '0.5.4' || dep.resolved !== pin.replace('v0.5.4', revision)) throw Error('FORMAL_CONTRACT_LOCK_MISMATCH');
 const installed = JSON.parse(await readFile(join(packageRoot, 'package.json')));
 if (installed.name !== manifest.packageName || installed.version !== manifest.packageVersion) throw Error('FORMAL_CONTRACT_PACKAGE_MISMATCH');
 const seen = new Set();
 for (const f of manifest.files) {
  if (typeof f.path !== 'string' || f.path.startsWith('/') || f.path.split('/').includes('..') || seen.has(f.path)) throw Error('FORMAL_CONTRACT_FILE_PATH');
  seen.add(f.path);
  const bytes = await readFile(join(packageRoot, f.path));
  if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw Error(`CONTRACT_FILE_DIGEST_MISMATCH:${f.path}`);
 }
 return { sourceTag: manifest.sourceTag, sourceRevision: revision, artifactSha256: sha, filesVerified: seen.size, installedPackageRoot: packageRoot };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await verifyContracts()));
