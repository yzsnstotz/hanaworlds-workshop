#!/usr/bin/env bash
# S1-WS-WRITE-TOOLS-01 component gate: two contract WriteMethodDescriptors and PER_CELL/REGION chains on actual
# contracts 0.5.0 bytes, plus the affected text/image proposal regression, on a
# clean archive and on the independently installed packed tarball.
# Painter/Brush/Canvas/world are FIXTURE; real peers, Luanti and product UI are NOT_RUN.
set -euo pipefail
TASK_EVIDENCE=${1:?absolute evidence directory required}
CONTRACTS_TAR=${2:?admitted contracts 0.5.0 tar required}
BRUSH_TAR=${3:?actual Brush 0.5.0 tar required (external public seam for G2)}
OLD_WORKSHOP_TAR=${4:?previous Workshop 0.4.0 tar required (G2 baseline)}
case "$TASK_EVIDENCE" in /*) ;; *) exit 2;; esac
mkdir -p "$TASK_EVIDENCE"
TASK_TEMP=$(mktemp -d "$TASK_EVIDENCE/runtime.XXXXXX")
trap 'rm -rf "$TASK_TEMP"' EXIT
SOURCE_SHA=$(git rev-parse HEAD)
git diff --quiet
git diff --cached --quiet
printf '%s\n' "$SOURCE_SHA" > "$TASK_EVIDENCE/source-sha.txt"
{ node --version; npm --version; } > "$TASK_EVIDENCE/runtime.txt"
node --input-type=module - "$CONTRACTS_TAR" "$BRUSH_TAR" "$OLD_WORKSHOP_TAR" <<'JS' > "$TASK_EVIDENCE/input-identity.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const want=['7fb42f1eaaf4988730f6cf254faecb84bbbb1d84e293558b66727c470181b31e','14a07d30f8cf93d6fa7dc5f2299184a68fa1fa9967480ff044cf14650660fda2','11f757d606f11f879e16aceed23ae9cbc11906f207197f056933134d73024f1f'],out=[];
for(const [i,p] of process.argv.slice(2).entries()){const raw=await readFile(p),sha=createHash('sha256').update(raw).digest('hex');if(sha!==want[i])throw Error(`WRONG_INPUT_TAR:${p}`);out.push({path:p,sha256:sha,bytes:raw.length});}
console.log(JSON.stringify(out));
JS
# G2 repair: only the affected per-cell/business path and both write-method descriptions.
TESTS="test/write-tools.test.mjs test/local-world-runtime.test.mjs"
DEV_DEPS="@deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2"
mkdir -p "$TASK_TEMP/source" "$TASK_TEMP/consumer" "$TASK_TEMP/brush" "$TASK_TEMP/old"
tar -xzf "$BRUSH_TAR" -C "$TASK_TEMP/brush"
git archive "$SOURCE_SHA" | tar -x -C "$TASK_TEMP/source"
cd "$TASK_TEMP/source"
npm ci --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund > "$TASK_EVIDENCE/npm-ci.log" 2>&1
npm run build > "$TASK_EVIDENCE/build.log" 2>&1
(cd "$TASK_TEMP/brush/package" && npm install --omit=dev --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund > "$TASK_EVIDENCE/brush-install.log" 2>&1)
export HW_BRUSH_PACKAGE_ENTRY="$TASK_TEMP/brush/package/src/index.mjs"
# shellcheck disable=SC2086
HW_RUNTIME_ROOT="$TASK_TEMP/source-runtime" node --test $TESTS > "$TASK_EVIDENCE/source-tests.log" 2>&1
npm pack --ignore-scripts --cache "$TASK_TEMP/npm-cache" --json --pack-destination "$TASK_EVIDENCE" > "$TASK_EVIDENCE/pack.json"
PACK_NAME=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1]))[0].filename)' "$TASK_EVIDENCE/pack.json")
cp -R test "$TASK_TEMP/consumer/test"
cd "$TASK_TEMP/consumer"
printf '{"name":"workshop-write-tools-gate","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$TASK_EVIDENCE/$PACK_NAME" "$CONTRACTS_TAR" $DEV_DEPS > "$TASK_EVIDENCE/consumer-install.log" 2>&1
node --input-type=module -e 'import * as C from "hanaworlds-contracts"; import * as W from "hanaworlds-workshop"; import {readFile} from "node:fs/promises";const w=JSON.parse(await readFile("node_modules/hanaworlds-workshop/package.json"));console.log(JSON.stringify({contracts:C.contractHandshake,workshop:{name:w.name,version:w.version,files:w.files},writeMethods:W.WRITE_METHODS,entry:import.meta.resolve("hanaworlds-workshop")}));' > "$TASK_EVIDENCE/consumer-identity.json"
# shellcheck disable=SC2086
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-runtime" node --test $TESTS > "$TASK_EVIDENCE/packed-tests.log" 2>&1
node --input-type=module - "$TASK_EVIDENCE/$PACK_NAME" "$SOURCE_SHA" <<'JS' > "$TASK_EVIDENCE/pack-sha256.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const bytes=await readFile(process.argv[2]);console.log(JSON.stringify({path:process.argv[2],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sourceSha:process.argv[3]}));
JS
# Every shipped file equals the committed source byte for byte.
node --input-type=module - "$TASK_TEMP/consumer/node_modules/hanaworlds-workshop" "$TASK_TEMP/source" <<'JS' > "$TASK_EVIDENCE/published-bytes.json"
import {readFile,readdir} from 'node:fs/promises'; import {join,relative} from 'node:path'; import {createHash} from 'node:crypto';
const [pkg,src]=process.argv.slice(2),out=[];
async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory()){if(e.name!=='node_modules')await walk(p);}else{const rel=relative(pkg,p),a=await readFile(p),b=await readFile(join(src,rel));const h=x=>createHash('sha256').update(x).digest('hex');if(h(a)!==h(b))throw Error(`PACK_DIFFERS:${rel}`);out.push({path:rel,sha256:h(a),bytes:a.length});}}}
await walk(pkg);console.log(JSON.stringify({files:out.length,equal:true,list:out}));
JS
# G2 baseline: the previous 0.4.0 package must fail the same actual-Brush per-cell path.
cp -R "$TASK_TEMP/consumer/test" "$TASK_TEMP/old/test"
cd "$TASK_TEMP/old"
printf '{"name":"workshop-040-baseline","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$OLD_WORKSHOP_TAR" "$CONTRACTS_TAR" $DEV_DEPS > "$TASK_EVIDENCE/baseline-install.log" 2>&1
set +e
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/old/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/old-runtime" node --test --test-name-pattern='G2: actual Brush' test/write-tools.test.mjs > "$TASK_EVIDENCE/baseline-040-g2.log" 2>&1
BASELINE_EXIT=$?
set -e
printf 'baseline exit %s\n' "$BASELINE_EXIT" >> "$TASK_EVIDENCE/baseline-040-g2.log"
test "$BASELINE_EXIT" -ne 0
grep -q 'UNSUPPORTED_VERSION' "$TASK_EVIDENCE/baseline-040-g2.log"
printf 'write-tools gate completed\n'
