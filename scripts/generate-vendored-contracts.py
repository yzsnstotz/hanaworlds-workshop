#!/usr/bin/env python3
"""Copy the admitted public package verbatim; never edit generated modules."""
import hashlib,io,json,pathlib,shutil,sys,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
sha='7fb42f1eaaf4988730f6cf254faecb84bbbb1d84e293558b66727c470181b31e'
raw=pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest()==sha
out=root/'vendor/contracts'; files={}
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
 for m in tar.getmembers():
  if m.isdir(): continue
  assert m.isfile() and m.name.startswith('package/') and '..' not in m.name.split('/')
  n=m.name[8:]; assert n not in files; files[n]=tar.extractfile(m).read()
assert json.loads(files['package.json'])['version']=='0.5.0'
shutil.rmtree(out)
for n,b in files.items():
 p=out/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
manifest={'sourceRevision':'c006a839a6e6c2c63d57a14b72e4e6b26fa717f1','admittedPackSha256':sha,'sourcePackageVersion':'0.5.0','files':[{'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in sorted(files.items())]}
(out/'PROVENANCE.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
