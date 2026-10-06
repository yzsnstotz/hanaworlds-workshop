import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const root = new URL('../vendor/contracts/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('PROVENANCE.json', root)));
if (manifest.sourceRevision !== '6185622e977ef5136e9ef12219e0ba89dbba29db' || manifest.admittedPackSha256 !== 'e6c50766ffc821ca90e07c38f473456952ef650e8a321f676dc44ce7d7d72209' || manifest.sourcePackageVersion !== '0.5.2') throw Error('VENDOR_PIN_MISMATCH');
const names = (await readdir(root, {recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>join(x.parentPath,x.name));
if (names.length !== manifest.files.length + 1) throw Error('VENDOR_FILE_SET_MISMATCH');
for (const f of manifest.files) {
 if (f.path.includes('..') || f.path.startsWith('/')) throw Error('VENDOR_PATH');
 const bytes=await readFile(new URL(f.path,root));
 if (bytes.length!==f.bytes || createHash('sha256').update(bytes).digest('hex')!==f.sha256) throw Error(`VENDOR_CHANGED:${f.path}`);
}
console.log(JSON.stringify({source:manifest.sourceRevision,pack:manifest.admittedPackSha256,files:manifest.files.length}));
