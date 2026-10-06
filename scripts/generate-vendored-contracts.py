#!/usr/bin/env python3
"""Copy the admitted public package verbatim; never edit generated modules."""
import hashlib,io,json,pathlib,shutil,sys,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
sha='d7b22e76de5e161abe7525596df608b3f00445fb4237808941cb5ef8328e9bc4'
raw=pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest()==sha
out=root/'vendor/contracts'; files={}
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
 for m in tar.getmembers():
  if m.isdir(): continue
  assert m.isfile() and m.name.startswith('package/') and '..' not in m.name.split('/')
  n=m.name[8:]; assert n not in files; files[n]=tar.extractfile(m).read()
assert json.loads(files['package.json'])['version']=='0.4.0'
shutil.rmtree(out)
for n,b in files.items():
 p=out/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
manifest={'sourceRevision':'8cfb18f8e13aa33d7a942f230ec6117914322cdd','admittedPackSha256':sha,'sourcePackageVersion':'0.4.0','files':[{'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in sorted(files.items())]}
(out/'PROVENANCE.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
