"""Isolated, recorded environments for image-model KRE-00 probes."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import venv
from kre00 import DATA, ROOT, fetch_json, download, write_json, sha256


def child_environment():
    env = os.environ.copy()
    temporary = DATA/'tmp'
    temporary.mkdir(parents=True, exist_ok=True)
    env.update({'TMP': str(temporary), 'TEMP': str(temporary), 'PYTHONNOUSERSITE': '1',
                'HF_HOME': str(DATA/'cache/huggingface'), 'TORCH_HOME': str(DATA/'cache/torch'),
                'MIOPEN_USER_DB_PATH':str(DATA/'cache/miopen-db'),
                'MIOPEN_CUSTOM_CACHE_DIR':str(DATA/'cache/miopen-kernels')})
    for name in ['miopen-db','miopen-kernels']:
        (DATA/'cache'/name).mkdir(parents=True,exist_ok=True)
    return env


def environment(name):
    directory = DATA/'venvs'/name
    python = directory/'Scripts/python.exe' if os.name == 'nt' else directory/'bin/python'
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(directory)
    return python


def pip_install(python, requirements, label, allow_source=False):
    run = DATA/'runs'/f'{label}-{time.time_ns()}'
    run.mkdir(parents=True)
    command = [str(python), '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check',
               '--no-cache-dir', '--index-url', 'https://pypi.org/simple',
               '--report', str(run/'pip-report.json'), *requirements]
    if not allow_source:
        command += ['--only-binary=:all:']
    write_json(run/'command.json', {'command': command})
    with (run/'install.txt').open('x', encoding='utf-8') as log:
        result = subprocess.run(command, env=child_environment(), stdout=log, stderr=subprocess.STDOUT)
    write_json(run/'status.json', {'exit_code': result.returncode})
    if result.returncode:
        raise RuntimeError(f'Installation failed; inspect {run}')
    frozen = subprocess.run([str(python), '-m', 'pip', 'freeze'], env=child_environment(),
                            capture_output=True, text=True, check=True)
    (run/'freeze.txt').write_text(frozen.stdout, encoding='utf-8')
    print(run, flush=True)


def prepare_lama():
    lock = DATA/'onnx-environment-lock.json'
    if not lock.exists():
        packages = {name: fetch_json(f'https://pypi.org/pypi/{name}/json')['info']['version']
                    for name in ['onnxruntime','onnx','numpy','pillow']}
        metadata = fetch_json('https://huggingface.co/api/models/opencv/inpainting_lama')
        revision = metadata['sha']
        tree = fetch_json(f'https://huggingface.co/api/models/opencv/inpainting_lama/tree/{revision}')
        weight = next(item for item in tree if item['path']=='inpainting_lama_2025jan.onnx')
        write_json(lock, {'packages': packages, 'model_repo':'opencv/inpainting_lama',
                         'revision':revision, 'weight':weight, 'license':'Apache-2.0 (OpenCV model repository)',
                         'license_url':f'https://huggingface.co/opencv/inpainting_lama/blob/{revision}/LICENSE'})
    settings = json.loads(lock.read_text(encoding='utf-8'))
    python = environment('onnx')
    pip_install(python, [f'{name}=={version}' for name,version in settings['packages'].items()], 'onnx-install')
    revision = settings['revision']
    name = settings['weight']['path']
    record = download(f'https://huggingface.co/opencv/inpainting_lama/resolve/{revision}/{name}',
                      DATA/'models/lama'/name, settings['weight']['lfs']['oid'])
    write_json(DATA/f'lama-provenance-{time.time_ns()}.json', settings | {'artifact': record, 'lock_sha256':sha256(lock)})
    print(f'Environment ready: {python}', flush=True)


def prepare_gpu():
    # Explicit, documented stable Windows/Python 3.12 stack, not a nightly install.
    base = 'https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/'
    python = environment('torch-rocm721')
    sdk = [base+name for name in [
        'rocm_sdk_core-7.2.1-py3-none-win_amd64.whl',
        'rocm_sdk_devel-7.2.1-py3-none-win_amd64.whl',
        'rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl', 'rocm-7.2.1.tar.gz']]
    pip_install(python, sdk, 'rocm-sdk-install', allow_source=True)
    wheels = [base+'torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl',
              base+'torchvision-0.24.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl']
    pip_install(python, wheels, 'torch-rocm-install')
    print(f'Environment ready: {python}', flush=True)


def prepare_sam():
    python = DATA/'venvs/torch-rocm721/Scripts/python.exe'
    if not python.exists():
        raise RuntimeError('Prepare and verify the GPU environment first')
    lock = DATA/'sam-environment-lock.json'
    if not lock.exists():
        versions = {name:fetch_json(f'https://pypi.org/pypi/{name}/json')['info']['version']
                    for name in ['transformers','accelerate','safetensors']}
        metadata = fetch_json('https://huggingface.co/api/models/facebook/sam2.1-hiera-tiny')
        revision = metadata['sha']
        tree = fetch_json(f'https://huggingface.co/api/models/facebook/sam2.1-hiera-tiny/tree/{revision}')
        files = [entry for entry in tree if entry['path'].endswith(('.json','.safetensors'))]
        write_json(lock,{'packages':versions,'model_repo':'facebook/sam2.1-hiera-tiny',
            'revision':revision,'files':files,'license':'Apache-2.0',
            'source_url':f'https://huggingface.co/facebook/sam2.1-hiera-tiny/tree/{revision}'})
    settings = json.loads(lock.read_text(encoding='utf-8'))
    pip_install(python,[f'{name}=={version}' for name,version in settings['packages'].items()],'sam-libraries-install')
    artifacts = []
    for entry in settings['files']:
        name = entry['path']
        url = f'https://huggingface.co/{settings["model_repo"]}/resolve/{settings["revision"]}/{name}'
        target = DATA/'models/sam2-tiny'/name
        if 'lfs' in entry:
            artifacts.append(download(url,target,entry['lfs']['oid']))
        elif not target.exists():
            import urllib.request
            with urllib.request.urlopen(url,timeout=45) as response:
                target.parent.mkdir(parents=True,exist_ok=True)
                target.open('xb').write(response.read())
            artifacts.append({'url':url,'sha256':sha256(target),'file':str(target.relative_to(ROOT))})
    write_json(DATA/f'sam-provenance-{time.time_ns()}.json',settings|{'artifacts':artifacts})
    print('SAM weights and environment ready',flush=True)


def probe_sam(material=False):
    output = DATA/'runs'/f'{"material" if material else "sam"}-{time.time_ns()}'
    output.mkdir(parents=True)
    command = [str(DATA/'venvs/torch-rocm721/Scripts/python.exe'),
               str(ROOT/'tools/artwork-creator'/('material_probe.py' if material else 'sam_probe.py')),str(output)]
    write_json(output/'command.json',{'command':command})
    with (output/'worker.txt').open('x',encoding='utf-8') as log:
        result = subprocess.run(command,env=child_environment(),stdout=log,stderr=subprocess.STDOUT,timeout=600)
    write_json(output/'status.json',{'exit_code':result.returncode})
    print(output,flush=True)
    if result.returncode:
        raise RuntimeError('SAM probe failed; inspect worker.txt')


def prepare_klein():
    python = DATA/'venvs/torch-rocm721/Scripts/python.exe'
    if not python.exists():
        raise RuntimeError('Prepare and verify GPU first')
    lock = DATA/'klein-environment-lock.json'
    if not lock.exists():
        version = fetch_json('https://pypi.org/pypi/diffusers/json')['info']['version']
        metadata = fetch_json('https://huggingface.co/api/models/black-forest-labs/FLUX.2-klein-4B')
        revision = metadata['sha']
        tree = fetch_json(f'https://huggingface.co/api/models/black-forest-labs/FLUX.2-klein-4B/tree/{revision}?recursive=true')
        folders = ('text_encoder/','transformer/','vae/','tokenizer/','scheduler/')
        files = [entry for entry in tree if entry['type']=='file' and
                 (entry['path'].startswith(folders) or entry['path']=='model_index.json') and
                 entry['path'].endswith(('.json','.txt','.safetensors','.model','.jinja'))]
        write_json(lock,{'packages':{'diffusers':version},'model_repo':'black-forest-labs/FLUX.2-klein-4B',
            'revision':revision,'files':files,'license':'Apache-2.0',
            'source_url':f'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/tree/{revision}'})
    settings = json.loads(lock.read_text(encoding='utf-8'))
    print(f'Klein selected files: {sum(e["size"] for e in settings["files"])/2**30:.2f} GiB',flush=True)
    pip_install(python,[f'{name}=={version}' for name,version in settings['packages'].items()],'klein-libraries-install')
    artifacts = []
    def obtain(entry):
        name = entry['path']
        url = f'https://huggingface.co/{settings["model_repo"]}/resolve/{settings["revision"]}/{name}'
        target = DATA/'models/klein4b'/name
        if 'lfs' in entry:
            return download(url,target,entry['lfs']['oid'])
        else:
            if not target.exists():
                import urllib.request
                with urllib.request.urlopen(url,timeout=45) as response:
                    target.parent.mkdir(parents=True,exist_ok=True)
                    target.open('xb').write(response.read())
            return {'url':url,'sha256':sha256(target),'file':str(target.relative_to(ROOT))}
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        artifacts = list(pool.map(obtain,settings['files']))
    write_json(DATA/f'klein-provenance-{time.time_ns()}.json',settings|{'artifacts':artifacts})
    print('Klein weights and environment ready',flush=True)


def prepare_klein_tokenizer():
    import hashlib
    import urllib.request
    settings=json.loads((DATA/'klein-environment-lock.json').read_text(encoding='utf-8'))
    revision=settings['revision']
    tree=fetch_json(f'https://huggingface.co/api/models/{settings["model_repo"]}/tree/{revision}/tokenizer')
    artifacts=[]
    for entry in tree:
        if not entry['path'].endswith('.jinja'):
            continue
        target=DATA/'models/klein4b'/entry['path']
        url=f'https://huggingface.co/{settings["model_repo"]}/resolve/{revision}/{entry["path"]}'
        if not target.exists():
            with urllib.request.urlopen(url,timeout=45) as response:
                content=response.read()
            expected=entry['oid']
            blob=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
            if blob!=expected:
                raise ValueError('Tokenizer file differs from pinned Git blob')
            with target.open('xb') as stream:
                stream.write(content)
        artifacts.append({'file':entry['path'],'url':url,'git_blob':entry['oid'],'sha256':sha256(target)})
    if not artifacts:
        raise RuntimeError('No tokenizer chat template found in pinned revision')
    write_json(DATA/f'klein-tokenizer-provenance-{time.time_ns()}.json',{'revision':revision,'artifacts':artifacts})
    print('Pinned tokenizer template ready',flush=True)


def probe_klein(encode_only=False):
    output = DATA/'runs'/f'klein-{time.time_ns()}'
    output.mkdir(parents=True)
    brief = ROOT/'tools/artwork-creator/klein-authoring-brief.md'
    body = brief.read_text(encoding='utf-8').replace('(../../apps/ui/', '(../../../../apps/ui/')
    (output/'authoring-brief.md').write_text(body,encoding='utf-8')
    write_json(output/'provenance.json',{'model_lock_sha256':sha256(DATA/'klein-environment-lock.json'),
        'brief_source_sha256':sha256(brief),
        'guidelines_sha256':sha256(ROOT/'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md'),
        'worker_sha256':sha256(ROOT/'tools/artwork-creator/klein_probe.py'),
        'strategy':'separate encoding and generation processes, BF16, one heavy GPU worker at a time'})
    commands = []
    for stage in (['encode'] if encode_only else ['encode','generate']):
        command = [str(DATA/'venvs/torch-rocm721/Scripts/python.exe'),
            str(ROOT/'tools/artwork-creator/klein_probe.py'),stage,str(output)]
        tick=time.perf_counter()
        with (output/f'{stage}-worker.txt').open('x',encoding='utf-8') as log:
            result=subprocess.run(command,env=child_environment(),stdout=log,stderr=subprocess.STDOUT,timeout=900)
        commands.append({'stage':stage,'command':command,'wall_seconds':time.perf_counter()-tick,'exit_code':result.returncode})
        write_json(output/f'{stage}-command.json',commands[-1])
        print(f'Klein stage {stage}: exit {result.returncode}; {output}',flush=True)
        if result.returncode:
            raise RuntimeError(f'Klein {stage} failed; inspect worker and result files')
    write_json(output/'stages.json',commands)


def probe_locked_edit(source):
    if not source:
        raise ValueError('--source-run is required')
    output=DATA/'runs'/f'locked-edit-{time.time_ns()}';output.mkdir(parents=True)
    command=[str(DATA/'venvs/torch-rocm721/Scripts/python.exe'),str(ROOT/'tools/artwork-creator/locked_edit_probe.py'),source,str(output)]
    with (output/'worker.txt').open('x',encoding='utf-8') as log:
        result=subprocess.run(command,env=child_environment(),stdout=log,stderr=subprocess.STDOUT,timeout=120)
    write_json(output/'status.json',{'command':command,'exit_code':result.returncode})
    print(output,flush=True)
    if result.returncode:
        raise RuntimeError('Masked edit probe failed; inspect worker.txt')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare-lama','prepare-gpu','prepare-sam','probe-sam','probe-material','prepare-klein','prepare-klein-tokenizer','probe-klein','encode-klein','probe-locked-edit'])
    parser.add_argument('--source-run')
    options = parser.parse_args()
    if options.action == 'prepare-lama':
        prepare_lama()
    elif options.action == 'prepare-gpu':
        prepare_gpu()
    elif options.action == 'prepare-sam':
        prepare_sam()
    elif options.action == 'probe-sam':
        probe_sam()
    elif options.action == 'probe-material':
        probe_sam(material=True)
    elif options.action == 'prepare-klein':
        prepare_klein()
        prepare_klein_tokenizer()
    elif options.action == 'prepare-klein-tokenizer':
        prepare_klein_tokenizer()
    elif options.action == 'probe-klein':
        probe_klein()
    elif options.action == 'probe-locked-edit':
        probe_locked_edit(options.source_run)
    else:
        probe_klein(encode_only=True)
