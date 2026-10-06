#!/usr/bin/env python3
"""Copy the admitted public package verbatim; never edit generated modules."""
import hashlib,io,json,pathlib,shutil,sys,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
sha='c3528a4fc3f0cdf94245c4d2d8b1cfa5d28db96d1cd00ae74737bdbdfcd26ec6'
raw=pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest()==sha
out=root/'vendor/contracts'; files={}
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
 for m in tar.getmembers():
  if m.isdir(): continue
  assert m.isfile() and m.name.startswith('package/') and '..' not in m.name.split('/')
  n=m.name[8:]; assert n not in files; files[n]=tar.extractfile(m).read()
assert json.loads(files['package.json'])['version']=='0.4.2'
shutil.rmtree(out)
for n,b in files.items():
 p=out/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
manifest={'sourceRevision':'aad7c0ea2a4a9a93dfb13555c46cd98b9b5da777','admittedPackSha256':sha,'sourcePackageVersion':'0.4.2','files':[{'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in sorted(files.items())]}
(out/'PROVENANCE.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
