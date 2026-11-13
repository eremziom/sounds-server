"""Isolated KRE-00 probes. Standard library only; no application imports."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics
import subprocess
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / '.local' / 'kre00'
REVISION = '3885219b6810b007914f3a7950a8d1b469d598a5'
MODEL_REPO = 'unsloth/Qwen3.5-9B-GGUF'
RELEASE = 'b12110'


def fetch_json(url, body=None, timeout=30):
    data = None if body is None else json.dumps(body).encode('utf-8')
    request = urllib.request.Request(url, data=data, headers={
        'User-Agent': 'sounds-server-kre00', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Never replace an earlier run or successful result.
    with path.open('x', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)


def download(url, target, expected):
    if len(expected) != 64:
        raise ValueError('A source SHA256 is required before downloading')
    if not target.exists():
        partial = target.with_suffix(target.suffix + '.partial')
        target.parent.mkdir(parents=True, exist_ok=True)
        offset = partial.stat().st_size if partial.exists() else 0
        if offset and sha256(partial) == expected:
            partial.replace(target)
            return {'url':url,'file':str(target.relative_to(ROOT)),'sha256':expected,'bytes':target.stat().st_size}
        print(f'Downloading {target.name} (resume offset {offset} bytes)', flush=True)
        request = urllib.request.Request(url, headers={'User-Agent': 'sounds-server-kre00'})
        if offset:
            request.add_header('Range',f'bytes={offset}-')
        # A stalled redirect must not hang the benchmark indefinitely.
        with urllib.request.urlopen(request, timeout=45) as response:
            resumed = getattr(response,'status',200)==206
            if resumed and not getattr(response,'headers',{}).get('Content-Range','').startswith(f'bytes {offset}-'):
                raise ValueError('Server returned an invalid resume range')
            if not resumed:
                offset=0  # A server ignoring Range must replace, never append a full response.
            with partial.open('ab' if resumed else 'wb') as output:
                copied = offset
                reported = time.monotonic()
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    copied += len(chunk)
                    if time.monotonic() - reported >= 15:
                        print(f'{target.name}: {copied // (1024 * 1024)} MiB', flush=True)
                        reported = time.monotonic()
        if sha256(partial) != expected:
            raise ValueError(f'Checksum mismatch: {target.name}')
        partial.replace(target)
    if sha256(target) != expected:
        raise ValueError(f'Checksum mismatch: {target.name}')
    return {'url': url, 'file': str(target.relative_to(ROOT)),
            'sha256': expected, 'bytes': target.stat().st_size}


def prepare():
    release = fetch_json(f'https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/{RELEASE}')
    asset = next(a for a in release['assets'] if a['name'].endswith('bin-win-vulkan-x64.zip'))
    checksum = asset.get('digest', '').removeprefix('sha256:')
    archive = DATA / 'downloads' / asset['name']
    records = [download(asset['browser_download_url'], archive, checksum)]
    write_json(DATA / f'backend-provenance-{time.time_ns()}.json',
               {'release': RELEASE, 'release_url': release['html_url'],
                'license': 'MIT', 'artifacts': records})
    executable_dir = DATA / 'llama' / RELEASE
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            destination = (executable_dir / item.filename).resolve()
            if not destination.is_relative_to(executable_dir.resolve()):
                raise ValueError('Unsafe archive entry')
        bundle.extractall(executable_dir)
    tree = fetch_json(f'https://huggingface.co/api/models/{MODEL_REPO}/tree/{REVISION}')
    for name in ['Qwen3.5-9B-Q4_K_M.gguf', 'mmproj-F16.gguf']:
        entry = next(item for item in tree if item['path'] == name)
        records.append(download(f'https://huggingface.co/{MODEL_REPO}/resolve/{REVISION}/{name}',
                                DATA / 'models' / name, entry['lfs']['oid']))
    provenance = {'release': RELEASE, 'release_url': release['html_url'],
                  'model_repo': MODEL_REPO, 'revision': REVISION,
                  'license': 'Apache-2.0 (model); MIT (llama.cpp)', 'artifacts': records}
    path = DATA / f'provenance-{time.time_ns()}.json'
    write_json(path, provenance)
    print(path, flush=True)


def summarize(values):
    if not values:
        raise ValueError('No measurements')
    return {'runs': len(values), 'median_seconds': statistics.median(values),
            'min_seconds': min(values), 'max_seconds': max(values)}


def process_memory(pid):
    """Windows kernel high-water mark, not a sample-based estimate or VRAM."""
    if os.name != 'nt':
        return {'error': 'Process memory telemetry requires Windows'}
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
            (name, ctypes.c_size_t) for name in (
                'PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage',
                'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
                'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.K32GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    kernel.K32GetProcessMemoryInfo.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x0410, False, pid)
    if not handle:
        return {'error': f'OpenProcess: {ctypes.get_last_error()}'}
    try:
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        if not kernel.K32GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
            return {'error': f'GetProcessMemoryInfo: {ctypes.get_last_error()}'}
        return {'peak_working_set_bytes': counters.PeakWorkingSetSize,
                'working_set_bytes': counters.WorkingSetSize,
                'peak_commit_bytes': counters.PeakPagefileUsage}
    finally:
        kernel.CloseHandle(handle)


def diagnose():
    """Only allowlisted fields; no environment, tokens, user names or full process lists."""
    commands = {
        'windows': ['powershell', '-NoProfile', '-Command',
                    'Get-CimInstance Win32_OperatingSystem -ErrorAction Stop | '
                    'Select-Object Caption,Version,BuildNumber,TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json'],
        'cpu': ['powershell', '-NoProfile', '-Command',
                'Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object Name | ConvertTo-Json'],
        'gpu_driver': ['powershell', '-NoProfile', '-Command',
                       'Get-CimInstance Win32_VideoController -ErrorAction Stop | '
                       'Select-Object Name,DriverVersion | ConvertTo-Json'],
        'disk': ['powershell', '-NoProfile', '-Command',
                 'Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json'],
        'python': ['py', '--version'],
        'vulkan': ['vulkaninfo', '--summary'],
    }
    result = {'schema_version': 1, 'captured_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'note': 'Win32 AdapterRAM is deliberately excluded: it cannot establish 16 GiB VRAM.',
              'probes': {}}
    for name, command in commands.items():
        try:
            execution = subprocess.run(command, capture_output=True, timeout=30)
            result['probes'][name] = {'exit_code': execution.returncode,
                                     'stdout': execution.stdout.decode('utf-8', errors='replace'),
                                     'stderr': execution.stderr.decode('utf-8', errors='replace')}
        except (OSError, subprocess.TimeoutExpired) as error:
            result['probes'][name] = {'error': f'{type(error).__name__}: {error}'}
    path = DATA / 'runs' / f'diagnostics-{time.time_ns()}.json'
    write_json(path, result)
    print(path)


def gpu_status():
    command = ['powershell', '-NoProfile', '-Command',
        '$ErrorActionPreference="Stop"; Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory | '
        'Select-Object Name,DedicatedUsage,SharedUsage,TotalCommitted | ConvertTo-Json']
    result = subprocess.run(command, capture_output=True, timeout=20)
    record = {'exit_code': result.returncode, 'stdout': result.stdout.decode('utf-8',errors='replace'),
              'stderr': result.stderr.decode('utf-8',errors='replace')}
    path = DATA/'runs'/f'gpu-status-{time.time_ns()}.json'
    write_json(path, record)
    print(json.dumps(record), flush=True)
    print(path)


def probe_llm(runs, port, max_tokens=3600, suite='brief'):
    if runs < 3:
        raise ValueError('At least three measured runs are required')
    output = DATA / 'runs' / f'llm-{time.time_ns()}'
    output.mkdir(parents=True)
    executable = next((DATA / 'llama' / RELEASE).rglob('llama-server.exe'))
    model = DATA / 'models' / 'Qwen3.5-9B-Q4_K_M.gguf'
    projector = DATA / 'models' / 'mmproj-F16.gguf'
    guidelines_path = ROOT / 'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md'
    guidelines = guidelines_path.read_text(encoding='utf-8')
    command = [str(executable), '-m', str(model), '--mmproj', str(projector),
               '--host', '127.0.0.1', '--port', str(port), '-ngl', '99',
               '--device', 'Vulkan0', '-c', '16384', '--jinja', '--parallel', '1', '-lv', '4']
    if suite == 'capabilities':
        command += ['--image-min-tokens', '1024']
    base = f'http://127.0.0.1:{port}'
    # Refuse to reuse another process listening on this port.
    import socket
    with socket.socket() as check:
        check.bind(('127.0.0.1', port))
    result = {'command': command, 'model_sha256': sha256(model),
              'projector_sha256': sha256(projector),
              'guidelines': str(guidelines_path.relative_to(ROOT)),
              'guidelines_sha256': sha256(guidelines_path),
              'quality': 'not-reviewed', 'ram_peak_bytes': None,
              'vram_peak_bytes': None,
              'telemetry_note': 'RAM: native server process only; exact VRAM peak not instrumented, sampled WDDM maxima recorded separately',
              'cases': []}
    result['probe_source_hashes'] = {name: sha256(ROOT/'tools/artwork-creator'/name)
        for name in ['kre00.py','capability_probes.py','benchmark-tools.mjs','gpu-telemetry.ps1']}
    started = time.perf_counter()
    with (output / 'server.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen(command, stdout=log, stderr=log,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        telemetry = None
        try:
            if os.name == 'nt':
                telemetry = subprocess.Popen(['powershell', '-NoProfile', '-File',
                    str(ROOT/'tools/artwork-creator/gpu-telemetry.ps1'), '-TargetProcessId', str(process.pid),
                    '-OutputPath', str(output/'gpu-memory.jsonl'), '-StopPath', str(output/'gpu-stop')],
                    stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
            deadline = time.monotonic() + 240
            while True:
                if process.poll() is not None:
                    raise RuntimeError(f'Server exited: {process.returncode}; inspect server.log')
                try:
                    fetch_json(base + '/health', timeout=2)
                    break
                except (OSError, ValueError):
                    if time.monotonic() > deadline:
                        raise TimeoutError('Server readiness timed out')
                    time.sleep(0.5)
            result['process_to_ready_seconds'] = time.perf_counter() - started
            if suite == 'capabilities':
                from capability_probes import run_suite
                result.update(run_suite(base, output, runs, max_tokens, process.pid))
                return
            if suite == 'sequence-plan':
                from sequence_probe import plan_suite
                result.update(plan_suite(base,output,runs,process.pid))
                return
            system = ('Jesteś autorem briefu testowego, nie deklaruj wykonania grafiki. '
                      'Zastosuj wspólne wytyczne, podaj ich wersję i ścieżkę. '
                      'Wypisz niepewności i wymagane QA w ruchu/zoomie. '
                      'Źródło: apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md\n' + guidelines)
            prompt = ('Zaplanuj prostą scenę 16:9: niewielki dron przelatuje łukiem przez '
                      'kamienną bramę porośniętą roślinami. Zapisz krótki polski brief: '
                      'warstwy, początek i koniec trasy, maski, kompletne tło, liczne detale '
                      'światła, przepływ mocnych kolorów, całkowite zaciemnienie i odbiór. '
                      'To próba B-01 KRE-00, bez produkcji artworku.')
            for index in range(runs):
                request = {'model': 'local', 'seed': 100 + index, 'temperature': 0.2,
                           'max_tokens': max_tokens, 'chat_template_kwargs': {'enable_thinking': False},
                           'messages': [{'role': 'system', 'content': system},
                                        {'role': 'user', 'content': prompt}]}
                tick = time.perf_counter()
                response = fetch_json(base + '/v1/chat/completions', request, timeout=300)
                case = {'id': 'B-01', 'index': index, 'request': request, 'response': response,
                        'request_seconds': time.perf_counter() - tick,
                        'process_memory': process_memory(process.pid), 'quality': 'not-reviewed',
                        'completion': response['choices'][0]['finish_reason']}
                result['cases'].append(case)
                write_json(output / f'B-01-{index}.json', case)
                print(f'B-01 run {index + 1}: {case["request_seconds"]:.3f}s', flush=True)
            result['request_summary'] = summarize([case['request_seconds'] for case in result['cases']])
            result['responses_complete'] = all(case['completion'] == 'stop' for case in result['cases'])
        except BaseException as error:
            result['error'] = f'{type(error).__name__}: {error}'
            raise
        finally:
            if process.poll() is None:
                result['process_memory_before_shutdown'] = process_memory(process.pid)
                result['ram_peak_bytes'] = result['process_memory_before_shutdown'].get('peak_working_set_bytes')
            shutdown = time.perf_counter()
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=15)
            result['process_shutdown_seconds'] = time.perf_counter() - shutdown
            result['exit_code'] = process.returncode
            if telemetry is not None:
                # Observe several samples after the owned model process has exited.
                time.sleep(4)
                (output/'gpu-stop').touch()
                try:
                    telemetry.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    telemetry.terminate()
                    telemetry.wait(timeout=10)
                result['gpu_telemetry_exit_code'] = telemetry.returncode
                samples_path = output/'gpu-memory.jsonl'
                if samples_path.exists():
                    samples = [json.loads(line) for line in samples_path.read_text(encoding='utf-8').splitlines()]
                    valid = [s for s in samples if 'processInstances' in s]
                    if valid:
                        totals = [sum(i['DedicatedUsage'] for i in s['processInstances']) for s in valid]
                        result['gpu_observed'] = {'samples': len(valid),
                            'max_process_dedicated_bytes_all_adapters': max(totals),
                            'last_process_dedicated_bytes_all_adapters': totals[-1],
                            'first_sample_seconds_after_sampler_start': valid[0]['elapsedSeconds'],
                            'max_sample_gap_seconds': max([b['elapsedSeconds']-a['elapsedSeconds'] for a,b in zip(valid,valid[1:])],default=0),
                            'note': 'Windows WDDM sampled counters, all adapters for owned PID; not an exact allocation peak or physical GPU mapping'}
            write_json(output / 'result.json', result)
            print(output, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['diagnose', 'gpu-status', 'prepare-llm', 'probe-llm', 'probe-capabilities','probe-sequence-plan'])
    parser.add_argument('--runs', type=int, default=3)
    parser.add_argument('--port', type=int, default=18790)
    parser.add_argument('--max-tokens', type=int, default=3600)
    options = parser.parse_args()
    if options.action == 'diagnose':
        diagnose()
    elif options.action == 'gpu-status':
        gpu_status()
    elif options.action == 'prepare-llm':
        prepare()
    else:
        probe_llm(options.runs, options.port, options.max_tokens,
                  'sequence-plan' if options.action=='probe-sequence-plan' else
                  'capabilities' if options.action == 'probe-capabilities' else 'brief')
