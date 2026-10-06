import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const root = new URL('../vendor/contracts/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('PROVENANCE.json', root)));
if (manifest.sourceRevision !== 'c006a839a6e6c2c63d57a14b72e4e6b26fa717f1' || manifest.admittedPackSha256 !== '7fb42f1eaaf4988730f6cf254faecb84bbbb1d84e293558b66727c470181b31e' || manifest.sourcePackageVersion !== '0.5.0') throw Error('VENDOR_PIN_MISMATCH');
const names = (await readdir(root, {recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>join(x.parentPath,x.name));
if (names.length !== manifest.files.length + 1) throw Error('VENDOR_FILE_SET_MISMATCH');
for (const f of manifest.files) {
 if (f.path.includes('..') || f.path.startsWith('/')) throw Error('VENDOR_PATH');
 const bytes=await readFile(new URL(f.path,root));
 if (bytes.length!==f.bytes || createHash('sha256').update(bytes).digest('hex')!==f.sha256) throw Error(`VENDOR_CHANGED:${f.path}`);
}
console.log(JSON.stringify({source:manifest.sourceRevision,pack:manifest.admittedPackSha256,files:manifest.files.length}));
