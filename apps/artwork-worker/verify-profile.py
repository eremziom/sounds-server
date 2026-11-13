"""Offline integrity check for the exact KRE-00 weights used by KRE-02."""
import hashlib
import json
import os
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
models=Path(os.environ.get('ARTWORK_MODELS_DIR',str(root/'.local/kre00/models'))).resolve()
profile=json.loads((Path(__file__).parent/'profile-lock.json').read_text(encoding='utf-8'))
profile_hash=hashlib.sha256((Path(__file__).parent/'profile-lock.json').read_bytes()).hexdigest()
marker=models/'.kre02-verified.json'
verified=json.loads(marker.read_text(encoding='utf-8')) if marker.exists() else {'profileSha256':profile_hash,'files':{}}
if verified.get('profileSha256')!=profile_hash:verified={'profileSha256':profile_hash,'files':{}}
selected=sys.argv[1:]
for name,model in profile['models'].items():
    if selected and name not in selected: continue
    for item in model['files']:
        path=(models/item['path']).resolve(strict=True)
        if not path.is_relative_to(models) or path.stat().st_size!=item['bytes']:
            raise ValueError('Model file size/path mismatch')
        digest=hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda:stream.read(8*1024*1024),b''):digest.update(chunk)
        if digest.hexdigest()!=item['sha256']:raise ValueError('Model file checksum mismatch: '+item['path'])
        info=path.stat();verified['files'][item['path']]={'bytes':info.st_size,'mtimeNs':info.st_mtime_ns}
    print(name+': '+model['revision']+' verified',flush=True)
marker.write_text(json.dumps(verified),encoding='utf-8')
