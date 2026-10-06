#!/usr/bin/env bash
# Differential gate: exact contracts 0.4.2 consumption by Workshop 0.2.2 only.
# Does not rerun the 0.2.1 HTTP/algorithm matrix (scripts/gate-image-attachment.sh stays as its fixed 0.4.0 record).
set -euo pipefail
TASK_EVIDENCE=${1:?absolute evidence directory required}
CONTRACTS_TAR=${2:?admitted contracts 0.4.2 tar required}
OLD_WORKSHOP_TAR=${3:?fixed Workshop 0.2.1 tar required}
OLD_CONTRACTS_TAR=${4:?fixed contracts 0.4.0 tar required}
case "$TASK_EVIDENCE" in /*) ;; *) exit 2;; esac
mkdir -p "$TASK_EVIDENCE"
TASK_TEMP=$(mktemp -d "$TASK_EVIDENCE/runtime.XXXXXX")
trap 'rm -rf "$TASK_TEMP"' EXIT
SOURCE_SHA=$(git rev-parse HEAD)
git diff --quiet
git diff --cached --quiet
printf '%s\n' "$SOURCE_SHA" > "$TASK_EVIDENCE/source-sha.txt"
node --version > "$TASK_EVIDENCE/runtime.txt"
npm --version >> "$TASK_EVIDENCE/runtime.txt"
node --input-type=module - "$CONTRACTS_TAR" "$OLD_WORKSHOP_TAR" "$OLD_CONTRACTS_TAR" <<'JS' > "$TASK_EVIDENCE/input-identity.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const want=['c3528a4fc3f0cdf94245c4d2d8b1cfa5d28db96d1cd00ae74737bdbdfcd26ec6','77ba48e2c8f67919ec4d36e562f86027b5f4e69d905415a5e3a52b8344eee6dd','d7b22e76de5e161abe7525596df608b3f00445fb4237808941cb5ef8328e9bc4'];
const out=[];for(const [i,p] of process.argv.slice(2).entries()){const raw=await readFile(p),sha=createHash('sha256').update(raw).digest('hex');if(sha!==want[i])throw Error(`WRONG_INPUT_TAR:${p}`);out.push({path:p,sha256:sha,bytes:raw.length});}
console.log(JSON.stringify(out));
JS
DEV_DEPS="@deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2"
mkdir -p "$TASK_TEMP/source" "$TASK_TEMP/consumer/test" "$TASK_TEMP/consumer/types" "$TASK_TEMP/old/test"
git archive "$SOURCE_SHA" | tar -x -C "$TASK_TEMP/source"
cd "$TASK_TEMP/source"
npm ci --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund > "$TASK_EVIDENCE/npm-ci.log" 2>&1
npm run build > "$TASK_EVIDENCE/build.log" 2>&1
# Locked public codeload dependency must equal the admitted 0.4.2 tar bytes (vendor PROVENANCE) file by file.
node --input-type=module <<'JS' > "$TASK_EVIDENCE/lock-vs-admitted.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const m=JSON.parse(await readFile('vendor/contracts/PROVENANCE.json')),lock=JSON.parse(await readFile('package-lock.json')).packages['node_modules/hanaworlds-contracts'];
for(const f of m.files){const b=await readFile(`node_modules/hanaworlds-contracts/${f.path}`);if(b.length!==f.bytes||createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error(`LOCK_BYTES_DIFFER:${f.path}`);}
if(lock.version!=='0.4.2'||!lock.resolved.endsWith('/aad7c0ea2a4a9a93dfb13555c46cd98b9b5da777'))throw Error('LOCK_PIN');
console.log(JSON.stringify({lockVersion:lock.version,resolved:lock.resolved,integrity:lock.integrity,admittedPackSha256:m.admittedPackSha256,filesEqual:m.files.length}));
JS
HW_RUNTIME_ROOT="$TASK_TEMP/source-runtime" npm run test:contracts-042 > "$TASK_EVIDENCE/source-tests.log" 2>&1
npm pack --ignore-scripts --cache "$TASK_TEMP/npm-cache" --json --pack-destination "$TASK_EVIDENCE" > "$TASK_EVIDENCE/pack.json"
PACK_NAME=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1]))[0].filename)' "$TASK_EVIDENCE/pack.json")
cp test/contracts-042-consumption.test.mjs "$TASK_TEMP/consumer/test/"
cp test/types/contracts-042-consumer.ts test/types/tsconfig.json "$TASK_TEMP/consumer/types/"
cp test/contracts-042-consumption.test.mjs "$TASK_TEMP/old/test/"
cd "$TASK_TEMP/consumer"
printf '{"name":"workshop-contracts-042-gate","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$TASK_EVIDENCE/$PACK_NAME" "$CONTRACTS_TAR" $DEV_DEPS typescript@5.8.3 > "$TASK_EVIDENCE/consumer-install.log" 2>&1
node --input-type=module -e 'import * as C from "hanaworlds-contracts"; import {readFile} from "node:fs/promises";const w=JSON.parse(await readFile("node_modules/hanaworlds-workshop/package.json"));console.log(JSON.stringify({contracts:C.contractHandshake,contractsVersion:C.version,workshop:{name:w.name,version:w.version,dependencies:w.dependencies},entry:import.meta.resolve("hanaworlds-workshop")}));' > "$TASK_EVIDENCE/consumer-identity.json"
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-runtime" node --test test/contracts-042-consumption.test.mjs > "$TASK_EVIDENCE/packed-tests.log" 2>&1
node_modules/.bin/tsc --project types/tsconfig.json > "$TASK_EVIDENCE/consumer-types.log" 2>&1
printf 'tsc exit 0 (typescript %s)\n' "$(node_modules/.bin/tsc --version)" >> "$TASK_EVIDENCE/consumer-types.log"
node --input-type=module - "$TASK_EVIDENCE/$PACK_NAME" <<'JS' > "$TASK_EVIDENCE/pack-sha256.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const bytes=await readFile(process.argv[2]);console.log(JSON.stringify({path:process.argv[2],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
JS
# Differential baseline: the fixed 0.2.1 package on 0.4.0 must fail the same image-brief proposal path.
cd "$TASK_TEMP/old"
printf '{"name":"workshop-021-baseline","private":true,"type":"module"}\n' > package.json
# shellcheck disable=SC2086
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$OLD_WORKSHOP_TAR" "$OLD_CONTRACTS_TAR" $DEV_DEPS > "$TASK_EVIDENCE/baseline-install.log" 2>&1
set +e
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/old/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/old-runtime" node --test --test-name-pattern='image MediaBinding' test/contracts-042-consumption.test.mjs > "$TASK_EVIDENCE/baseline-021-040.log" 2>&1
BASELINE_EXIT=$?
set -e
printf 'baseline exit %s\n' "$BASELINE_EXIT" >> "$TASK_EVIDENCE/baseline-021-040.log"
test "$BASELINE_EXIT" -ne 0
grep -q 'SCHEMA_INVALID\|INVALID_SHAPE' "$TASK_EVIDENCE/baseline-021-040.log"
printf 'contracts 0.4.2 differential gate completed\n'
