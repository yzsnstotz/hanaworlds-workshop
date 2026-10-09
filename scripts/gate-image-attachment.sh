#!/usr/bin/env bash
set -euo pipefail
TASK_EVIDENCE=${1:?absolute evidence directory required}
CONTRACTS_TAR=${2:?admitted contracts tar required}
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
node --input-type=module - "$CONTRACTS_TAR" <<'JS' > "$TASK_EVIDENCE/contracts-identity.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const raw=await readFile(process.argv[2]),sha=createHash('sha256').update(raw).digest('hex');
if(sha!=='d7b22e76de5e161abe7525596df608b3f00445fb4237808941cb5ef8328e9bc4')throw Error('WRONG_CONTRACTS_TAR');
console.log(JSON.stringify({sha256:sha,bytes:raw.length}));
JS
mkdir -p "$TASK_TEMP/source" "$TASK_TEMP/consumer/test"
git archive "$SOURCE_SHA" | tar -x -C "$TASK_TEMP/source"
cd "$TASK_TEMP/source"
npm ci --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund > "$TASK_EVIDENCE/npm-ci.log" 2>&1
npm run build > "$TASK_EVIDENCE/build.log" 2>&1
HW_RUNTIME_ROOT="$TASK_TEMP/source-runtime" npm run test:image > "$TASK_EVIDENCE/source-tests.log" 2>&1
HW_RUNTIME_ROOT="$TASK_TEMP/text-runtime" npm run test:text-normal > "$TASK_EVIDENCE/text-normal.log" 2>&1
npm pack --ignore-scripts --cache "$TASK_TEMP/npm-cache" --json --pack-destination "$TASK_EVIDENCE" > "$TASK_EVIDENCE/pack.json"
PACK_NAME=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1]))[0].filename)' "$TASK_EVIDENCE/pack.json")
cp test/local-world-runtime.test.mjs test/image-attachment.test.mjs "$TASK_TEMP/consumer/test/"
cd "$TASK_TEMP/consumer"
printf '{"name":"local-workshop-packed-gate","private":true,"type":"module"}\n' > package.json
npm install --ignore-scripts --cache "$TASK_TEMP/npm-cache" --no-audit --no-fund "$TASK_EVIDENCE/$PACK_NAME" "$CONTRACTS_TAR" @deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2 > "$TASK_EVIDENCE/consumer-install.log" 2>&1
node --input-type=module -e 'import * as C from "hanaworlds-contracts"; import {readFile} from "node:fs/promises";console.log(JSON.stringify({contracts:C.contractHandshake,workshop:JSON.parse(await readFile("node_modules/hanaworlds-workshop/package.json")),entry:import.meta.resolve("hanaworlds-workshop")}));' > "$TASK_EVIDENCE/consumer-identity.json"
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-runtime" node --test test/image-attachment.test.mjs > "$TASK_EVIDENCE/packed-tests.log" 2>&1
node --input-type=module - "$TASK_EVIDENCE/$PACK_NAME" <<'JS' > "$TASK_EVIDENCE/pack-sha256.json"
import {readFile} from 'node:fs/promises'; import {createHash} from 'node:crypto';
const bytes=await readFile(process.argv[2]);console.log(JSON.stringify({path:process.argv[2],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
JS
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/consumer/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/packed-text-runtime" node --test --test-name-pattern='local text proposal' test/local-world-runtime.test.mjs > "$TASK_EVIDENCE/packed-text-normal.log" 2>&1
printf 'source and actual-package image gate completed\n'
