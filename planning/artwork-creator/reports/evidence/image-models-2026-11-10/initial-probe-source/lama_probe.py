"""Run B-08 inside the isolated ONNX environment. No downloads during inference."""
import gc
import json
import os
from pathlib import Path
import sys
import time
from kre00 import DATA, ROOT, sha256, write_json, process_memory, summarize


def main(output):
    started = time.perf_counter()
    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageFilter, ImageDraw
    imports_seconds = time.perf_counter()-started
    output = output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated run')
    fixture = json.loads((output/'fixture.json').read_text(encoding='utf-8'))
    model = DATA/'models/lama/inpainting_lama_2025jan.onnx'
    report = {'id':'B-08', 'model_sha256':sha256(model),'fixture':fixture,
              'versions':{'onnxruntime':ort.__version__,'numpy':np.__version__, 'pillow':Image.__version__},
              'imports_seconds':imports_seconds, 'device':'CPUExecutionProvider',
              'preprocessing':'BGR * 0.00392; binary mask float32 NCHW, as OpenCV example; original pixels preserved outside mask',
              'intra_op_threads':8,'inter_op_threads':1, 'runs':[], 'quality':'not-reviewed',
              'seed':None,'seed_note':'LaMa is deterministic here, no stochastic seed input; repeats measure the same input'}
    options = ort.SessionOptions()
    options.log_severity_level = 3
    options.intra_op_num_threads = 8
    options.inter_op_num_threads = 1
    tick = time.perf_counter()
    session = ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
    report['session_load_seconds'] = time.perf_counter()-tick
    report['providers'] = session.get_providers()
    assert session.get_providers()==['CPUExecutionProvider']
    sprite = Image.open(output/'aircraft-patch.png').convert('RGBA')
    review = Image.new('RGB',(1024,3*282),'#111111')
    draw = ImageDraw.Draw(review)
    for row, case in enumerate(fixture['cases']):
        folder = output/case['id']
        clean = np.array(Image.open(folder/'clean.png').convert('RGB'))
        image = np.array(Image.open(folder/'input.png').convert('RGB'))
        mask_image = Image.new('L',(512,512),0)
        alpha = sprite.getchannel('A').point(lambda p:255 if p>0 else 0)
        mask_image.paste(alpha,tuple(case['at']))
        mask_image = mask_image.filter(ImageFilter.MaxFilter(7))
        mask_image.save(folder/'mask.png')
        mask = np.array(mask_image)>0
        feed = {'image':np.ascontiguousarray(image[:,:,::-1].transpose(2,0,1)[None]*np.float32(.00392)),
                'mask':mask.astype(np.float32)[None,None]}
        for index in range(3):
            tick = time.perf_counter()
            raw = session.run(None,feed)[0]
            inference_seconds = time.perf_counter()-tick
            if raw.shape!=(1,3,512,512) or not np.isfinite(raw).all():
                raise ValueError('Invalid model result')
            predicted = np.clip(raw[0].transpose(1,2,0)[:,:,::-1],0,255).astype(np.uint8)
            composed = np.where(mask[:,:,None],predicted,image)
            tick = time.perf_counter()
            path = folder/f'result-{index}.png'
            Image.fromarray(composed).save(path)
            save_seconds = time.perf_counter()-tick
            record = {'case':case['id'],'index':index,'inference_seconds':inference_seconds,
                'save_seconds':save_seconds,'input_sha256':sha256(folder/'input.png'),
                'mask_sha256':sha256(folder/'mask.png'),'output_sha256':sha256(path),
                'masked_pixels':int(mask.sum()),'outside_mask_exact':bool(np.array_equal(composed[~mask],image[~mask])),
                'input_masked_mae':float(np.abs(image.astype(np.float32)-clean)[mask].mean()),
                'result_masked_mae':float(np.abs(composed.astype(np.float32)-clean)[mask].mean()),
                'process_memory':process_memory(os.getpid())}
            report['runs'].append(record)
            write_json(folder/f'result-{index}.json',record)
            print(f'B-08 {case["id"]} {index+1}: {inference_seconds:.3f}s, MAE={record["result_masked_mae"]:.3f}',flush=True)
        overlay = image.copy()
        overlay[mask] = (overlay[mask].astype(float)*.45+np.array([255,0,0])*.55).astype(np.uint8)
        for column,frame in enumerate([clean,image,overlay,composed]):
            review.paste(Image.fromarray(frame).resize((256,256)),(column*256,row*282+26))
            draw.text((column*256+6,row*282+6),f'{case["id"]}: '+['clean','object added','remove mask','LaMa result'][column],fill='white')
    review.save(output/'review.webp',quality=90)
    report['timings']={c['id']:summarize([r['inference_seconds'] for r in report['runs'] if r['case']==c['id']]) for c in fixture['cases']}
    tick = time.perf_counter()
    del session
    gc.collect()
    report['release_session_seconds'] = time.perf_counter()-tick
    report['memory_after_release'] = process_memory(os.getpid())
    report['total_worker_seconds'] = time.perf_counter()-started
    report['source_integrity_after']={f:sha256(ROOT/'apps/ui/public/infinite-zoom/samples'/f) for f in fixture['sourceHashes']}
    report['source_unchanged'] = report['source_integrity_after']==fixture['sourceHashes']
    write_json(output/'result.json',report)
    print(output,flush=True)


if __name__=='__main__':
    main(Path(sys.argv[1]))
