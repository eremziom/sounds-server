"""B-06 SAM 2.1 Tiny: point/box refinement, genuine GPU inference, local weights only."""
import gc
import json
import os
from pathlib import Path
import sys
import time
from kre00 import DATA, ROOT, write_json, sha256, process_memory, summarize


def main(output):
    started = time.perf_counter()
    import numpy as np
    from PIL import Image, ImageDraw
    import torch
    import transformers
    from transformers import Sam2Model, Sam2Processor
    output = output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated run')
    fixture = DATA/'runs/lama-first'
    fixture_data = json.loads((fixture/'fixture.json').read_text(encoding='utf-8'))
    report = {'id':'B-06','torch':torch.__version__,'transformers':transformers.__version__,
        'fixture':str(fixture.relative_to(ROOT)),'cases':[],'quality':'not-reviewed',
        'imports_seconds':time.perf_counter()-started,'dtype':'float32',
        'model_hashes':{p.name:sha256(p) for p in (DATA/'models/sam2-tiny').iterdir() if p.is_file()}}
    model = None
    try:
        if not torch.cuda.is_available():
            raise RuntimeError('GPU unavailable; do not silently fall back to CPU')
        index = next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        device = f'cuda:{index}'
        report.update({'device':device,'device_name':torch.cuda.get_device_name(index),'hip':torch.version.hip})
        torch.cuda.reset_peak_memory_stats(index)
        tick = time.perf_counter()
        model = Sam2Model.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True).to(device).eval()
        processor = Sam2Processor.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True)
        torch.cuda.synchronize(index)
        report['load_seconds'] = time.perf_counter()-tick
        sprite = Image.open(fixture/'aircraft-patch.png').convert('RGBA')
        alpha = np.array(sprite.getchannel('A'))
        local_y,local_x = np.unravel_index(alpha.argmax(),alpha.shape)
        review = Image.new('RGB',(4*256,3*282),'#111111')
        draw = ImageDraw.Draw(review)
        for row,case in enumerate(fixture_data['cases']):
            image = Image.open(fixture/case['id']/'input.png').convert('RGB')
            reference = np.zeros((512,512),dtype=bool)
            x,y = case['at']
            reference[y:y+alpha.shape[0],x:x+alpha.shape[1]] = alpha>127
            point = [int(x+local_x),int(y+local_y)]
            variants = [ ('point',{'input_points':[[[point]]],'input_labels':[[[1]]]}),
                ('refined',{'input_points':[[[point,[x+sprite.width//2,y-8]]]],'input_labels':[[[1,0]]],
                    'input_boxes':[[[x-4,y-4,x+sprite.width+4,y+sprite.height+4]]]}) ]
            frames = [np.array(image),np.where(reference[:,:,None],np.array([255,50,50]),np.array(image)).astype(np.uint8)]
            for variant,prompts in variants:
                for run in range(3):
                    torch.manual_seed(400+run)
                    tick = time.perf_counter()
                    inputs = processor(images=image,**prompts,return_tensors='pt').to(device)
                    preparation = time.perf_counter()-tick
                    torch.cuda.synchronize(index)
                    tick = time.perf_counter()
                    with torch.inference_mode():
                        prediction = model(**inputs,multimask_output=True)
                    torch.cuda.synchronize(index)
                    seconds = time.perf_counter()-tick
                    scores = prediction.iou_scores.detach().cpu().numpy()[0,0]
                    selected = int(scores.argmax())
                    masks = processor.post_process_masks(prediction.pred_masks.detach().cpu(),inputs['original_sizes'])[0]
                    mask = masks[0,selected].numpy().astype(bool)
                    if mask.shape!=reference.shape:
                        raise ValueError(f'Unexpected mask shape: {mask.shape}')
                    union = np.logical_or(mask,reference).sum()
                    iou = float(np.logical_and(mask,reference).sum()/union) if union else 0
                    path = output/f'{case["id"]}-{variant}-{run}.png'
                    Image.fromarray(mask.astype(np.uint8)*255).save(path)
                    record = {'case':case['id'],'variant':variant,'run':run,'seed':400+run,'prompts':prompts,
                        'input_sha256':sha256(fixture/case['id']/'input.png'),'mask_sha256':sha256(path),
                        'input_preparation_seconds':preparation,'inference_seconds':seconds,'mask_iou':iou,
                        'predicted_iou_scores':scores.tolist(),'selected_mask':selected,
                        'selection':'highest model score; never selected using reference IoU',
                        'mask_pixels':int(mask.sum()),'process_memory':process_memory(os.getpid())}
                    report['cases'].append(record)
                    write_json(output/f'{case["id"]}-{variant}-{run}.json',record)
                    print(f'B-06 {case["id"]} {variant} {run+1}: {seconds:.3f}s, IoU={iou:.3f}',flush=True)
                overlay = np.array(image).copy()
                overlay[mask] = (overlay[mask].astype(float)*.45+np.array([255,0,0])*.55).astype(np.uint8)
                frames.append(overlay)
            # Zoom the same source region in all columns to inspect thin contours.
            box = (max(0,x-28),max(0,y-28),x+sprite.width+28,y+sprite.height+28)
            for column,frame in enumerate(frames):
                thumb = Image.fromarray(frame).crop(box).resize((256,256))
                review.paste(thumb,(column*256,row*282+26))
                draw.text((column*256+6,row*282+6),case['id']+': '+['input','reference','point','point + box + negative'][column],fill='white')
        review.save(output/'review.webp',quality=90)
        report['gpu_max_allocated_bytes'] = torch.cuda.max_memory_allocated(index)
        report['gpu_max_reserved_bytes'] = torch.cuda.max_memory_reserved(index)
        report['timings']={f'{c["case"]}-{c["variant"]}':summarize([r['inference_seconds'] for r in report['cases'] if (r['case'],r['variant'])==(c['case'],c['variant'])]) for c in report['cases']}
        report['source_unchanged'] = all(sha256(ROOT/'apps/ui/public/infinite-zoom/samples'/name)==expected for name,expected in fixture_data['sourceHashes'].items())
    except BaseException as error:
        report['error']=f'{type(error).__name__}: {error}'
        raise
    finally:
        model=None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            report['gpu_allocated_after_release_bytes']=torch.cuda.memory_allocated(index)
            report['gpu_reserved_after_release_bytes']=torch.cuda.memory_reserved(index)
        report['total_worker_seconds']=time.perf_counter()-started
        write_json(output/'result.json',report)


if __name__=='__main__':
    main(Path(sys.argv[1]))
