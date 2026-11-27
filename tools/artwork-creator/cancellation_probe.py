"""B-10: cancel an owned image worker after a real diffusion step, restart cleanly."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
from kre00 import ROOT,DATA,sha256,write_json
from image_environment import child_environment
from sequence_probe import worker


def main(source):
    source=source.resolve()
    if not source.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated source')
    names=['generate-embeds.safetensors','B-04-1024-500.png']
    before={name:sha256(source/name) for name in names}
    output=DATA/'runs'/f'cancel-{time.time_ns()}';output.mkdir(parents=True)
    cancelled=output/'cancelled';cancelled.mkdir()
    restarted=output/'restarted';restarted.mkdir()
    for directory in [cancelled,restarted]:
        shutil.copyfile(source/'generate-embeds.safetensors',directory/'generate-embeds.safetensors')
    python=str(DATA/'venvs/torch-rocm721/Scripts/python.exe')
    command=[python,str(ROOT/'tools/artwork-creator/klein_probe.py'),'single',str(cancelled)]
    report={'source':str(source.relative_to(ROOT)),'source_hashes_before':before,
            'command':command,'scope':'Owned standalone worker cancellation, not production queue/API cancellation'}
    started=time.perf_counter()
    with (cancelled/'worker.txt').open('x',encoding='utf-8') as log:
        process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env=child_environment(),
                                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
        try:
            deadline=time.monotonic()+120
            while True:
                progress=cancelled/'progress.jsonl'
                if progress.exists() and progress.stat().st_size:
                    lines=progress.read_text(encoding='utf-8').splitlines()
                    if lines:
                        report['observed_steps']=[json.loads(line) for line in lines]
                        break
                if process.poll() is not None:
                    raise RuntimeError('Worker exited before first diffusion step; not a cancellation pass')
                if time.monotonic()>deadline:
                    raise TimeoutError('First diffusion step deadline')
                time.sleep(.02)
            report['cancel_requested_after_seconds']=time.perf_counter()-started
            tick=time.perf_counter();process.terminate();process.wait(timeout=20)
            report['terminate_and_wait_seconds']=time.perf_counter()-tick
            report['cancelled_exit_code']=process.returncode
            report['cancelled_artifact_exists']=(cancelled/'B-04-1024-500.png').exists()
            if report['cancelled_artifact_exists']:
                raise RuntimeError('Cancellation arrived too late to establish interrupted inference')
        finally:
            if process.poll() is None:
                process.kill();process.wait(timeout=20)
    retry=[python,str(ROOT/'tools/artwork-creator/klein_probe.py'),'single',str(restarted)]
    report['restart']=worker(retry,restarted,'retry',timeout=180)
    generated=restarted/'B-04-1024-500.png'
    if not generated.exists():
        raise RuntimeError('Restart did not produce an artifact')
    report['restart_sha256']=sha256(generated)
    report['same_seed_reference_hash_equal']=sha256(generated)==before['B-04-1024-500.png']
    report['source_hashes_after']={name:sha256(source/name) for name in names}
    report['source_inputs_unchanged']=report['source_hashes_after']==before
    report['total_seconds']=time.perf_counter()-started
    write_json(output/'result.json',report);print(output,flush=True)


if __name__=='__main__':
    main(Path(sys.argv[1]))
