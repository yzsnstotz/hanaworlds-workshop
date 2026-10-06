#!/usr/bin/env python3
"""Reproduce the exact runtime closure from the admitted contracts package."""
import hashlib, io, json, pathlib, posixpath, re, shutil, sys, tarfile
root = pathlib.Path(__file__).resolve().parent.parent
revision = 'e66800964726b951a300eb9377b74c318641417f'
pack_sha = '8624bd026815fcdafc5248b21d8bc611baa0569b7b492b66905d2d015a496ce1'
raw = pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == pack_sha, 'ADMITTED_PACK_MISMATCH'
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
    entries = {}
    for member in tar.getmembers():
        if member.isfile():
            assert member.name.startswith('package/') and '..' not in member.name.split('/')
            name = member.name[len('package/'):]
            assert name not in entries
            entries[name] = tar.extractfile(member).read()
assert json.loads(entries['package.json'])['version'] == '0.3.10'
fixtures = ['fixtures/v4/candidate/placement-region-chain-v4.json', 'fixtures/v4/proposal/text-build-proposal.json']
selected, external, pending = set(fixtures + ['LICENSE', 'NOTICE', 'licenses/canonicalize-Apache-2.0.txt']), set(), ['dist/v4/index.mjs']
while pending:
    name = pending.pop()
    if name in selected: continue
    selected.add(name)
    if '/generated/' in name: continue
    source = entries[name].decode()
    specs = re.findall(r'\bfrom\s*[\'\"]([^\'\"]+)[\'\"]', source) + re.findall(r'\bimport\s*\(\s*[\'\"]([^\'\"]+)[\'\"]', source)
    for spec in specs:
        if not spec.startswith('.'): external.add(spec); continue
        child = posixpath.normpath(posixpath.join(posixpath.dirname(name), spec))
        assert not child.startswith('../')
        pending.append(child)
out = root / 'vendor/contracts'
shutil.rmtree(out)
for name in sorted(selected):
    p = out / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(entries[name])
manifest = dict(sourceOrigin='https://github.com/yzsnstotz/hanaworlds-contracts', sourceRevision=revision,
    admittedPackSha256=pack_sha, sourcePackageVersion='0.3.10', runtimeRoots=['dist/v4/index.mjs'],
    allowedExternalImports=sorted(external), fixtureFiles=fixtures,
    files=[dict(path=n, bytes=len(entries[n]), sha256=hashlib.sha256(entries[n]).hexdigest()) for n in sorted(selected)])
manifest_raw = (json.dumps(manifest, indent=2) + '\n').encode()
(out / 'PROVENANCE.json').write_bytes(manifest_raw)
verifier = root / 'scripts/verify-vendored-contracts.mjs'
s = verifier.read_text()
for key, value in [('sourceRevision', revision), ('admittedPackSha256', pack_sha), ('manifestSha256', hashlib.sha256(manifest_raw).hexdigest())]:
    s = re.sub(r"const " + key + r" = '[^']+';", 'const ' + key + " = '" + value + "';", s)
s = re.sub(r"manifest.sourcePackageVersion !== '[^']+'", "manifest.sourcePackageVersion !== '0.3.10'", s)
s = re.sub(r"JSON.stringify\(manifest.fixtureFiles\) !== JSON.stringify\(\[.*?\]\)", 'JSON.stringify(manifest.fixtureFiles) !== JSON.stringify(' + json.dumps(fixtures) + ')', s, flags=re.S)
verifier.write_text(s)
print(json.dumps(dict(packSha256=pack_sha, sourceRevision=revision, files=len(selected), manifestSha256=hashlib.sha256(manifest_raw).hexdigest())))
