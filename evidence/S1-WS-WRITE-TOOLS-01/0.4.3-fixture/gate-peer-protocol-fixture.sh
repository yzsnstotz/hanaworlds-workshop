#!/usr/bin/env bash
# S1-WS-WRITE-TOOLS-01 0.4.3 fixture-stage gate. Actual Contracts 0.5.2;
# Workshop source and independent packed runtime. All peer/world/Host ports
# are FIXTURE. Final real three-peer consumption awaits a new Canvas package.
# Model choice, Luanti and product UI are NOT_RUN.
set -euo pipefail
TASK_EVIDENCE=${1:?absolute evidence directory required}
CONTRACTS_TAR=${2:?admitted contracts 0.5.2 tar required}
OLD_WORKSHOP_TAR=${3:?previous Workshop 0.4.2 tar required (Painter/Canvas baseline)}
case "$TASK_EVIDENCE" in /*) ;; *) exit 2;; esac
test ! -e "$TASK_EVIDENCE"
mkdir -p "$TASK_EVIDENCE"
TASK_TEMP=$(mktemp -d "$TASK_EVIDENCE/runtime.XXXXXX")
trap 'rm -rf "$TASK_TEMP"' EXIT
SOURCE_SHA=$(git rev-parse HEAD)
git diff --quiet
git diff --cached --quiet
printf '%s\n' "$SOURCE_SHA" > "$TASK_EVIDENCE/source-sha.txt"
{ node --version; npm --version; } > "$TASK_EVIDENCE/runtime.txt"
node --input-type=module - "$CONTRACTS_TAR" "$OLD_WORKSHOP_TAR" <<'JS' > "$TASK_EVIDENCE/input-identity.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const want=['e6c50766ffc821ca90e07c38f473456952ef650e8a321f676dc44ce7d7d72209','ef07973dcf83a220cb2ecfb13baca0fc2dc26ee56c23b86405ceb15f58ccd680'],out=[];
for(const [i,p] of process.argv.slice(2).entries()){const raw=await readFile(p),sha=createHash('sha256').update(raw).digest('hex');if(sha!==want[i])throw Error(`WRONG_INPUT_TAR:${p}`);out.push({path:p,sha256:sha,bytes:raw.length});}
console.log(JSON.stringify(out));
JS
# K3 repair: only per-cell/business and both descriptions/compatibility; skip unchanged region transaction matrices.
TESTS="test/write-tools.test.mjs test/local-world-runtime.test.mjs"
TEST_PATTERN="two contract|protocol major|^PER_CELL chain|^K3 Painter|^K3 Canvas|^local text|^wrong current connection|^existing object footprint|^Canvas whole rollback|^mismatched Canvas readback|^Painter rejects invalid"
DEV_DEPS="@deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2"
mkdir -p "$TASK_TEMP/source" "$TASK_TEMP/consumer" "$TASK_TEMP/old"
git archive "$SOURCE_SHA" | tar -x -C "$TASK_TEMP/source"
cd "$TASK_TEMP/source"
npm ci --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund > "$TASK_EVIDENCE/npm-ci.log" 2>&1
npm run build > "$TASK_EVIDENCE/build.log" 2>&1
unset HW_BRUSH_PACKAGE_ENTRY HW_WORKSHOP_PACKAGE_ENTRY
# shellcheck disable=SC2086
HW_RUNTIME_ROOT="$TASK_TEMP/source-runtime" node --test --test-name-pattern="$TEST_PATTERN" $TESTS > "$TASK_EVIDENCE/source-tests.log" 2>&1
npm pack --ignore-scripts --cache "$TASK_TEMP/npm-cache" --json --pack-destination "$TASK_EVIDENCE" > "$TASK_EVIDENCE/pack.json"
PACK_NAME=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1]))[0].filename)' "$TASK_EVIDENCE/pack.json")
cp -R test "$TASK_TEMP/consumer/test"
cd "$TASK_TEMP/consumer"
printf '{"name":"workshop-write-tools-gate","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$TASK_EVIDENCE/$PACK_NAME" "$CONTRACTS_TAR" $DEV_DEPS > "$TASK_EVIDENCE/consumer-install.log" 2>&1
node --input-type=module -e 'import * as C from "hanaworlds-contracts"; import * as W from "hanaworlds-workshop"; import {readFile} from "node:fs/promises";const w=JSON.parse(await readFile("node_modules/hanaworlds-workshop/package.json"));console.log(JSON.stringify({contracts:C.contractHandshake,workshop:{name:w.name,version:w.version,files:w.files},writeMethods:W.WRITE_METHODS,ports:W.WRITE_METHOD_PORTS,requirements:{painter:W.PER_CELL_PAINTER,canvas:W.PER_CELL_CANVAS,brush:W.PER_CELL_BRUSH},boundary:"FIXTURE: all peer/world/Host ports",entry:import.meta.resolve("hanaworlds-workshop")}));' > "$TASK_EVIDENCE/consumer-identity.json"
# shellcheck disable=SC2086
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-runtime" node --test --test-name-pattern="$TEST_PATTERN" $TESTS > "$TASK_EVIDENCE/packed-tests.log" 2>&1
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
# Baseline: same Contracts 0.5.2 and Brush fixture, only Painter/Canvas use
# another provenance/patch. Old Workshop 0.4.2 must reject that same flow.
cp -R "$TASK_TEMP/consumer/test" "$TASK_TEMP/old/test"
cd "$TASK_TEMP/old"
printf '{"name":"workshop-042-baseline","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$OLD_WORKSHOP_TAR" "$CONTRACTS_TAR" $DEV_DEPS > "$TASK_EVIDENCE/baseline-install.log" 2>&1
node --input-type=module -e 'import * as C from "hanaworlds-contracts"; import {readFile} from "node:fs/promises"; const w=JSON.parse(await readFile("node_modules/hanaworlds-workshop/package.json"));if(w.version!=="0.4.2"||C.contractHandshake.contracts!=="hanaworlds-contracts@0.5.2")throw Error("WRONG_BASELINE");console.log(JSON.stringify({workshop:w.version,fixtureContract:C.contractHandshake,peers:"FIXTURE Painter4/Canvas5 method-shaped cross-patch protocol; Brush matching fixture"}));' > "$TASK_EVIDENCE/baseline-identity.json"
set +e
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/old/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/old-runtime" node --test --test-name-pattern='^K3 Painter/Canvas: cross patch' test/write-tools.test.mjs > "$TASK_EVIDENCE/baseline-042-k3.log" 2>&1
BASELINE_EXIT=$?
set -e
printf 'baseline exit %s\n' "$BASELINE_EXIT" >> "$TASK_EVIDENCE/baseline-042-k3.log"
test "$BASELINE_EXIT" -ne 0
grep -q 'UNSUPPORTED_VERSION' "$TASK_EVIDENCE/baseline-042-k3.log"
grep -q 'Painter/Canvas: cross patch/hash' "$TASK_EVIDENCE/baseline-042-k3.log"
printf 'peer protocol FIXTURE gate completed; final public consumption NOT_RUN\n'
