#!/usr/bin/env bash
# S1-WS-WRITE-TOOLS-01 component gate: two self-described write modes on actual
# contracts 0.4.2 bytes, plus the affected text/image proposal regression, on a
# clean archive and on the independently installed packed tarball.
# Painter/Brush/Canvas/world are FIXTURE; region final consumption is NOT_RUN.
set -euo pipefail
TASK_EVIDENCE=${1:?absolute evidence directory required}
CONTRACTS_TAR=${2:?admitted contracts 0.4.2 tar required}
case "$TASK_EVIDENCE" in /*) ;; *) exit 2;; esac
mkdir -p "$TASK_EVIDENCE"
TASK_TEMP=$(mktemp -d "$TASK_EVIDENCE/runtime.XXXXXX")
trap 'rm -rf "$TASK_TEMP"' EXIT
SOURCE_SHA=$(git rev-parse HEAD)
git diff --quiet
git diff --cached --quiet
printf '%s\n' "$SOURCE_SHA" > "$TASK_EVIDENCE/source-sha.txt"
{ node --version; npm --version; } > "$TASK_EVIDENCE/runtime.txt"
node --input-type=module - "$CONTRACTS_TAR" <<'JS' > "$TASK_EVIDENCE/input-identity.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const raw=await readFile(process.argv[2]),sha=createHash('sha256').update(raw).digest('hex');
if(sha!=='c3528a4fc3f0cdf94245c4d2d8b1cfa5d28db96d1cd00ae74737bdbdfcd26ec6')throw Error('WRONG_CONTRACTS_TAR');
console.log(JSON.stringify({path:process.argv[2],sha256:sha,bytes:raw.length}));
JS
TESTS="test/write-tools.test.mjs test/local-world-runtime.test.mjs test/image-attachment.test.mjs"
DEV_DEPS="@deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2"
mkdir -p "$TASK_TEMP/source" "$TASK_TEMP/consumer"
git archive "$SOURCE_SHA" | tar -x -C "$TASK_TEMP/source"
cd "$TASK_TEMP/source"
npm ci --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund > "$TASK_EVIDENCE/npm-ci.log" 2>&1
npm run build > "$TASK_EVIDENCE/build.log" 2>&1
# shellcheck disable=SC2086
HW_RUNTIME_ROOT="$TASK_TEMP/source-runtime" node --test $TESTS > "$TASK_EVIDENCE/source-tests.log" 2>&1
npm pack --ignore-scripts --cache "$TASK_TEMP/npm-cache" --json --pack-destination "$TASK_EVIDENCE" > "$TASK_EVIDENCE/pack.json"
PACK_NAME=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1]))[0].filename)' "$TASK_EVIDENCE/pack.json")
cp -R test "$TASK_TEMP/consumer/test"
cd "$TASK_TEMP/consumer"
printf '{"name":"workshop-write-tools-gate","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$TASK_EVIDENCE/$PACK_NAME" "$CONTRACTS_TAR" $DEV_DEPS > "$TASK_EVIDENCE/consumer-install.log" 2>&1
node --input-type=module -e 'import * as C from "hanaworlds-contracts"; import * as W from "hanaworlds-workshop"; import {readFile} from "node:fs/promises";const w=JSON.parse(await readFile("node_modules/hanaworlds-workshop/package.json"));console.log(JSON.stringify({contracts:C.contractHandshake,workshop:{name:w.name,version:w.version,files:w.files},writeModes:W.WRITE_MODES,entry:import.meta.resolve("hanaworlds-workshop")}));' > "$TASK_EVIDENCE/consumer-identity.json"
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
printf 'write-tools gate completed\n'
