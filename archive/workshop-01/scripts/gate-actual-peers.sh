#!/usr/bin/env bash
# Affected normal source/packed gate: actual Workshop/Painter/Brush/Canvas.
# Host, Adapter, world and public fixed NativeFacts provider are FIXTURE.
# Model/Luanti/UI/product acceptance are separate, NOT_RUN here.
set -euo pipefail
TASK_E=${1:?new absolute E required}
case "$TASK_E" in /*) ;; *) exit 2;; esac
test ! -e "$TASK_E"
git diff --quiet
git diff --cached --quiet
mkdir -p "$TASK_E"
TASK_TEMP=$(mktemp -d "$TASK_E/runtime.XXXXXX")
trap 'rm -rf "$TASK_TEMP"' EXIT
SOURCE_SHA=$(git rev-parse HEAD)
printf '%s\n' "$SOURCE_SHA" > "$TASK_E/source-sha.txt"
{ node --version; npm --version; } > "$TASK_E/runtime.txt"
TASK_BASE=/Users/yzliu/.cache/hanaworlds-runs
CONTRACTS_TAR=$TASK_BASE/S1-CONTRACT-REGION-V1-01/_evidence/final-052/hanaworlds-contracts-0.5.2.tgz
CANVAS_TAR=$TASK_BASE/S1-CANVAS-REGION-UNDO-01/_evidence/gate-nativefacts-053-43e4dac/hanaworlds-canvas-0.5.3.tgz
PAINTER_TAR=$TASK_BASE/S1-PAINTER-REGION-VALIDATE-01/_evidence/contracts-0.5.0-20261007/package/hanaworlds-building-exterior-painter-0.4.0.tgz
BRUSH_TAR=$TASK_BASE/S1-BRUSH-REGION-COMPILE-01/_evidence/final-11b5f14/hanaworlds-brush-0.5.0.tgz
node --input-type=module - "$CONTRACTS_TAR" "$CANVAS_TAR" "$PAINTER_TAR" "$BRUSH_TAR" <<'JS' > "$TASK_E/input-identity.json"
import fs from 'node:fs';import {createHash} from 'node:crypto';
const want=['e6c50766ffc821ca90e07c38f473456952ef650e8a321f676dc44ce7d7d72209','bde8dea7c19dd95e3d1ba8667c42c081053c6a7ef7893f82bbaa127337fc8f03','582441e75480c53b22980cddd8d645aa75347ad33985a152f6af00a4740e88c7','14a07d30f8cf93d6fa7dc5f2299184a68fa1fa9967480ff044cf14650660fda2'];
console.log(JSON.stringify(process.argv.slice(2).map((path,i)=>{const b=fs.readFileSync(path),sha256=createHash('sha256').update(b).digest('hex');if(sha256!==want[i])throw Error('WRONG_INPUT:'+path);return {path,sha256,bytes:b.length};}),null,2));
JS
mkdir -p "$TASK_TEMP/source" "$TASK_TEMP/consumer"
git archive "$SOURCE_SHA" | tar -x -C "$TASK_TEMP/source"
cd "$TASK_TEMP/source"
npm ci --ignore-scripts --no-audit --no-fund --cache "$TASK_TEMP/npm-cache" > "$TASK_E/npm-ci.log" 2>&1
npm run build > "$TASK_E/build.log" 2>&1
npm pack --ignore-scripts --cache "$TASK_TEMP/npm-cache" --json --pack-destination "$TASK_E" > "$TASK_E/pack.json"
PACK_NAME=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1]))[0].filename)' "$TASK_E/pack.json")
npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund --cache "$TASK_TEMP/npm-cache" "$CONTRACTS_TAR" "$CANVAS_TAR" "$PAINTER_TAR" "$BRUSH_TAR" > "$TASK_E/source-peer-install.log" 2>&1
unset HW_WORKSHOP_PACKAGE_ENTRY HW_BRUSH_PACKAGE_ENTRY
mkdir -p "$TASK_E/source-runtime"
HW_RUNTIME_ROOT="$TASK_TEMP/source-runtime" HW_EVIDENCE_DIR="$TASK_E/source-runtime" node --test test/actual-peer-runtime.test.mjs > "$TASK_E/source-actual.log" 2>&1
node scripts/analyse-actual-undo.mjs "$TASK_E/source-runtime/public-canvas-trace.json" > "$TASK_E/source-undo-correlation.json"
TEST_PATTERN='^two contract|^protocol major|^PER_CELL chain|^K3 Painter|^K3 Canvas|^Undo history:|^local text'
HW_RUNTIME_ROOT="$TASK_TEMP/source-fixture-runtime" node --test --test-name-pattern="$TEST_PATTERN" test/write-tools.test.mjs test/local-world-runtime.test.mjs > "$TASK_E/source-related-fixture.log" 2>&1
cp -R test "$TASK_TEMP/consumer/test"
cp scripts/analyse-actual-undo.mjs "$TASK_TEMP/consumer/analyse-actual-undo.mjs"
cd "$TASK_TEMP/consumer"
printf '{"name":"workshop-044-actual-gate","private":true,"type":"module"}\n' > package.json
npm install --ignore-scripts --no-audit --no-fund --cache "$TASK_TEMP/npm-cache" "$TASK_E/$PACK_NAME" "$CONTRACTS_TAR" "$CANVAS_TAR" "$PAINTER_TAR" "$BRUSH_TAR" @deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2 > "$TASK_E/consumer-install.log" 2>&1
cp package.json package-lock.json "$TASK_E/"
mkdir -p "$TASK_E/packed-runtime"
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-runtime" HW_EVIDENCE_DIR="$TASK_E/packed-runtime" node --test test/actual-peer-runtime.test.mjs > "$TASK_E/packed-actual.log" 2>&1
node analyse-actual-undo.mjs "$TASK_E/packed-runtime/public-canvas-trace.json" > "$TASK_E/packed-undo-correlation.json"
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-fixture-runtime" node --test --test-name-pattern="$TEST_PATTERN" test/write-tools.test.mjs test/local-world-runtime.test.mjs > "$TASK_E/packed-related-fixture.log" 2>&1
node --input-type=module - "$TASK_E/$PACK_NAME" "$SOURCE_SHA" "$TASK_TEMP/consumer/node_modules/hanaworlds-workshop" "$TASK_TEMP/source" "$TASK_E" <<'JS' > "$TASK_E/receipt.json"
import {readFile,readdir} from 'node:fs/promises';import {join,relative} from 'node:path';import {createHash} from 'node:crypto';
const [tar,sourceSha,pkg,source,E]=process.argv.slice(2),sha=b=>createHash('sha256').update(b).digest('hex'),published=[];
async function walk(d){for(const x of await readdir(d,{withFileTypes:true})){if(x.name==='node_modules')continue;const p=join(d,x.name);if(x.isDirectory())await walk(p);else{const rel=relative(pkg,p),a=await readFile(p),b=await readFile(join(source,rel));if(!a.equals(b))throw Error('PUBLISHED_BYTE_DIFF:'+rel);published.push({path:rel,bytes:a.length,sha256:sha(a)});}}}
await walk(pkg);if(published.length!==11)throw Error('PUBLISHED_FILE_SET_CHANGED');
const raw=await readFile(tar),correlations=[];
for(const name of ['source','packed']){const c=JSON.parse(await readFile(join(E,`${name}-undo-correlation.json`)));if(c.failedPredicates.length)throw Error('UNDO_CORRELATION:'+name);const world=JSON.parse(await readFile(join(E,`${name}-runtime/world-fixture-after.json`)));if(world.buildWrites!==1||world.undoWrites!==1||world.modelCalls!==0||world.records.find(r=>r.position.join(',')==='0,1,3').nodeName!=='air')throw Error('WORLD_FIXTURE_RESULT:'+name);correlations.push({runtime:name,allTenPredicates:true,original:c.before.headTransactionId,undo:c.receipt.transactionId,head:c.after.headTransactionId,world});}
console.log(JSON.stringify({sourceSha,tar,sha256:sha(raw),bytes:raw.length,published,correlations,boundary:'actual Workshop/Painter/Brush/Canvas; Host/Adapter/world/public NativeFacts FIXTURE; model/Luanti/UI/product NOT_RUN'},null,2));
JS
printf 'actual public-peer affected source/packed gate exit 0; independent review/product gates remain\n'
