// Build prerequisite: contracts come from the contracts source by a Git semver range, never a copy,
// tag or commit pin; npm resolves the range, and the installed package must be the one the lock names.
// Compatibility across minors is decided by the installed contracts package itself (same major).
import { checkContractsVersion } from 'hanaworlds-contracts';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const source = 'git+https://github.com/yzsnstotz/hanaworlds-contracts.git';
const range = /^#semver:\^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.(0|[1-9][0-9]*))?$/u;
export async function verifyContracts({ projectRoot = fileURLToPath(new URL('../', import.meta.url)),
 packageRoot = dirname(fileURLToPath(import.meta.resolve('hanaworlds-contracts/package.json'))) } = {}) {
 const readJSON = async name => JSON.parse(await readFile(join(projectRoot, name)));
 const pkg = await readJSON('package.json'), lock = await readJSON('package-lock.json');
 const spec = pkg.dependencies?.['hanaworlds-contracts'];
 if (typeof spec !== 'string' || !spec.startsWith(source) || !range.test(spec.slice(source.length))) throw Error('CONTRACT_RANGE_REQUIRED');
 if (lock.packages?.['']?.dependencies?.['hanaworlds-contracts'] !== spec) throw Error('CONTRACT_LOCK_SPEC_MISMATCH');
 const dep = lock.packages?.['node_modules/hanaworlds-contracts'];
 if (!/^git\+(?:https:\/\/|ssh:\/\/git@)github\.com\/yzsnstotz\/hanaworlds-contracts\.git#[0-9a-f]{40}$/u.test(dep?.resolved ?? '')) throw Error('CONTRACT_LOCK_SOURCE_MISMATCH');
 const installed = JSON.parse(await readFile(join(packageRoot, 'package.json')));
 if (installed.name !== 'hanaworlds-contracts' || installed.version !== dep.version) throw Error('CONTRACT_INSTALLED_MISMATCH');
 // The declared lower bound must be the same contracts major as the installed package (source predicate).
 checkContractsVersion(`hanaworlds-contracts@${spec.slice(source.length + '#semver:^'.length)}`);
 return { spec, installedVersion: installed.version, resolved: dep.resolved, installedPackageRoot: packageRoot };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await verifyContracts()));
