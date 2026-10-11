#!/usr/bin/env bash
# BLOCKED diagnostic checkpoint, not a passing source/packed component gate.
# Three actual packages; public NativeFacts/Adapter/world/Host fixtures in the test.
set -euo pipefail
TASK_E=${1:?new absolute E required}
case "$TASK_E" in /*) ;; *) exit 2;; esac
test ! -e "$TASK_E"
mkdir -p "$TASK_E"
TASK_TEMP=$(mktemp -d "$TASK_E/runtime.XXXXXX")
trap 'rm -rf "$TASK_TEMP"' EXIT
SOURCE_SHA=$(git rev-parse HEAD)
printf '%s\n' "$SOURCE_SHA" > "$TASK_E/harness-source-sha.txt"
CONTRACTS_TAR=/Users/yzliu/.cache/hanaworlds-runs/S1-CONTRACT-REGION-V1-01/_evidence/final-052/hanaworlds-contracts-0.5.2.tgz
WORKSHOP_TAR=/Users/yzliu/.cache/hanaworlds-runs/S1-WS-WRITE-TOOLS-01/_evidence/final-043-fixture/hanaworlds-workshop-0.4.3.tgz
CANVAS_TAR=/Users/yzliu/.cache/hanaworlds-runs/S1-CANVAS-REGION-UNDO-01/_evidence/gate-nativefacts-053-43e4dac/hanaworlds-canvas-0.5.3.tgz
PAINTER_TAR=/Users/yzliu/.cache/hanaworlds-runs/S1-PAINTER-REGION-VALIDATE-01/_evidence/contracts-0.5.0-20261007/package/hanaworlds-building-exterior-painter-0.4.0.tgz
BRUSH_TAR=/Users/yzliu/.cache/hanaworlds-runs/S1-BRUSH-REGION-COMPILE-01/_evidence/final-11b5f14/hanaworlds-brush-0.5.0.tgz
node --input-type=module - "$CONTRACTS_TAR" "$WORKSHOP_TAR" "$CANVAS_TAR" "$PAINTER_TAR" "$BRUSH_TAR" <<'JS' > "$TASK_E/input-identity.json"
import fs from 'node:fs';import {createHash} from 'node:crypto';
const want=['e6c50766ffc821ca90e07c38f473456952ef650e8a321f676dc44ce7d7d72209','ceb5a79ff89c3fc07b117f678c14e6b7a646334c5a34cb5bed6626a1897ab6c3','bde8dea7c19dd95e3d1ba8667c42c081053c6a7ef7893f82bbaa127337fc8f03','582441e75480c53b22980cddd8d645aa75347ad33985a152f6af00a4740e88c7','14a07d30f8cf93d6fa7dc5f2299184a68fa1fa9967480ff044cf14650660fda2'];
console.log(JSON.stringify(process.argv.slice(2).map((path,i)=>{const b=fs.readFileSync(path),sha256=createHash('sha256').update(b).digest('hex');if(sha256!==want[i])throw Error('WRONG_INPUT:'+path);return {path,sha256,bytes:b.length};})));
JS
mkdir -p "$TASK_TEMP/test"
git show "$SOURCE_SHA:test/actual-peer-runtime.test.mjs" > "$TASK_TEMP/test/actual-peer-runtime.test.mjs"
git show "$SOURCE_SHA:scripts/analyse-actual-undo.mjs" > "$TASK_TEMP/analyse-actual-undo.mjs"
cd "$TASK_TEMP"
printf '{"name":"actual-peer-blocked-probe","type":"module","private":true}\n' > package.json
npm install --ignore-scripts --no-audit --no-fund --cache "$TASK_TEMP/npm-cache" "$CONTRACTS_TAR" "$WORKSHOP_TAR" "$CANVAS_TAR" "$PAINTER_TAR" "$BRUSH_TAR" @deepseek-ai/dsh-session-persistence-jsonl@0.2.0-rc.2 @deepseek-ai/dsh-storage-json@0.2.0-rc.2 @deepseek-ai/dsh-attachment-local@0.2.0-rc.2 @deepseek-ai/dsh-system-prompt@0.2.0-rc.2 > "$TASK_E/install.log" 2>&1
cp package.json package-lock.json "$TASK_E/"
set +e
HW_WORKSHOP_PACKAGE_ENTRY="$TASK_TEMP/node_modules/hanaworlds-workshop/src/index.mjs" HW_RUNTIME_ROOT="$TASK_TEMP/test-runtime" HW_EVIDENCE_DIR="$TASK_E" node --test test/actual-peer-runtime.test.mjs > "$TASK_E/probe.log" 2>&1

TASK_RESULT=$?
set -e
if test -f "$TASK_E/public-canvas-trace.json"; then
  node analyse-actual-undo.mjs "$TASK_E/public-canvas-trace.json" > "$TASK_E/undo-correlation.json"
fi
exit "$TASK_RESULT"
