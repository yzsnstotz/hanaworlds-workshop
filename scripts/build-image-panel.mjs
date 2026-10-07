// Only TypeScript's standard decorator lowering. No Typert generation, strict
// definitions, generated contribution, runtime fallback or schema fabrication.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../panel/src/index.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:'image-link-panel.ts',reportDiagnostics:true});
if(output.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('Panel decorator compilation failed');
await mkdir(new URL('../lib/',import.meta.url),{recursive:true});
await writeFile(new URL('../lib/panel-host.mjs',import.meta.url),output.outputText);
console.log(JSON.stringify({route:'SRC_ONLY_NEW_ENDPOINTS',namespace:'hanaworldsWorkshopImageLinks',compiler:ts.version,outputs:1}));
