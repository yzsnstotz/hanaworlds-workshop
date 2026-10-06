import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const root = new URL('../vendor/contracts/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('PROVENANCE.json', root)));
if (manifest.sourceRevision !== '8cfb18f8e13aa33d7a942f230ec6117914322cdd' || manifest.admittedPackSha256 !== 'd7b22e76de5e161abe7525596df608b3f00445fb4237808941cb5ef8328e9bc4' || manifest.sourcePackageVersion !== '0.4.0') throw Error('VENDOR_PIN_MISMATCH');
const names = (await readdir(root, {recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>join(x.parentPath,x.name));
if (names.length !== manifest.files.length + 1) throw Error('VENDOR_FILE_SET_MISMATCH');
for (const f of manifest.files) {
 if (f.path.includes('..') || f.path.startsWith('/')) throw Error('VENDOR_PATH');
 const bytes=await readFile(new URL(f.path,root));
 if (bytes.length!==f.bytes || createHash('sha256').update(bytes).digest('hex')!==f.sha256) throw Error(`VENDOR_CHANGED:${f.path}`);
}
console.log(JSON.stringify({source:manifest.sourceRevision,pack:manifest.admittedPackSha256,files:manifest.files.length}));
