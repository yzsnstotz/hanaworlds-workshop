#!/usr/bin/env python3
# Public input audit only. Does not call NativeFacts or run a three-peer gate.
import json,sys,hashlib
from pathlib import Path
base=Path(sys.argv[1])
audit=json.loads((base/'public-input-audit.json').read_text())
for version in ['0.5.0','0.5.2']:
 p=base/f'contracts-{version}'
 defs=json.loads((p/'schemas/local/contracts.schema.json').read_text())['definitions']
 decl=(p/'types/local/index.d.ts').read_text()
 assert 'readScopedState' not in decl
 assert not any('NativeFacts' in k or 'ScopedState' in k for k in defs)
 for k in ['ScopedCell','ScopedCells','StateProfile','ScopedWorldBinding']:assert k in defs
 assert 'function validateType' in decl
idx=json.loads((base/'canvas-public-E/INDEX.json').read_text())
lookup={r['path']:r for r in idx['files']}
for name in audit['canvas']['selectedAndVerified']:
 if name=='INDEX.json':continue
 assert hashlib.sha256((base/'canvas-public-E'/name).read_bytes()).hexdigest()==lookup[name]['sha256']
assert 'nativeFacts?: any' in (base/'canvas-public-package-docs/types/index.d.ts').read_text()
print(json.dumps({'publicAudit':'PUBLIC_INPUT_INCOMPLETE','contractVersions':['0.5.0','0.5.2'],'runtimeRetried':False,'harnessOrProductionChanged':False,'finalGate':'NOT_RUN'}))
