#!/usr/bin/env python3
"""Copy the admitted public package verbatim; never edit generated modules."""
import hashlib,io,json,pathlib,shutil,sys,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
sha='e6c50766ffc821ca90e07c38f473456952ef650e8a321f676dc44ce7d7d72209'
raw=pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest()==sha
out=root/'vendor/contracts'; files={}
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
 for m in tar.getmembers():
  if m.isdir(): continue
  assert m.isfile() and m.name.startswith('package/') and '..' not in m.name.split('/')
  n=m.name[8:]; assert n not in files; files[n]=tar.extractfile(m).read()
assert json.loads(files['package.json'])['version']=='0.5.2'
shutil.rmtree(out)
for n,b in files.items():
 p=out/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
manifest={'sourceRevision':'6185622e977ef5136e9ef12219e0ba89dbba29db','admittedPackSha256':sha,'sourcePackageVersion':'0.5.2','files':[{'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in sorted(files.items())]}
(out/'PROVENANCE.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
