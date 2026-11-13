"""Pinned local model stages for the reviewed pilot. No installation/network."""
import json
from pathlib import Path
import sys
import time
import numpy as np
from PIL import Image
from kre00 import DATA, ROOT, sha256, write_json, process_memory


def main(stage, output):
    started=time.perf_counter()
    output=output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated correction run')
    config=json.loads((output/'correction.json').read_text(encoding='utf-8'))
    source=output/'B-04-1024-500.png'
    if sha256(source)!=config['sourceSha256']:
        raise ValueError('Corrections belong to a different image')
    image=Image.open(source).convert('RGB')
    rgb=np.array(image)
    result={'stage':stage,'source_sha256':sha256(source),'recipe':config['recipe']}
    print(f'Correction {stage}: starting local model',flush=True)
    if stage=='occlude':
        import torch
        from transformers import Sam2Model,Sam2Processor
        index=next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        device=f'cuda:{index}'
        print(f'SAM: {torch.cuda.get_device_name(index)}',flush=True)
        torch.cuda.reset_peak_memory_stats(index)
        model=Sam2Model.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True).to(device).eval()
        processor=Sam2Processor.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True)
        c=config['occluder'];points=c['points']+c['negativePoints']
        inputs=processor(images=image,input_points=[[points]],input_labels=[[[1]*len(c['points'])+[0]*len(c['negativePoints'])]],
                         input_boxes=[[c['box']]],return_tensors='pt').to(device)
        print('SAM: model loaded, inferring pillar mask',flush=True)
        with torch.inference_mode():
            prediction=model(**inputs,multimask_output=True)
        torch.cuda.synchronize(index)
        choice=int(prediction.iou_scores[0,0].argmax().item())
        mask=processor.post_process_masks(prediction.pred_masks.cpu(),inputs['original_sizes'])[0][0,choice].numpy().astype(bool)
        if not 10000<mask.sum()<60000:
            raise ValueError('Unexpected pillar mask; retain failed evidence')
        if not all(mask[y,x] for x,y in c['points']) or any(mask[y,x] for x,y in c['negativePoints']):
            raise ValueError('Pillar mask contradicts authored positive/negative selections')
        Image.fromarray(mask.astype(np.uint8)*255).save(output/'occlusion-mask.png')
        result.update({'prompts':c,'choice':choice,'model_score':float(prediction.iou_scores[0,0,choice]),
                       'pixels':int(mask.sum()),'gpu_max_allocated_bytes':torch.cuda.max_memory_allocated(index),
                       'gpu_max_reserved_bytes':torch.cuda.max_memory_reserved(index)})
    elif stage=='fill':
        import onnxruntime as ort
        from image_ops import lama_inputs,compose_lama_result
        mask=np.array(Image.open(output/'backing-fill-mask.png').convert('L'))>0
        left,top,right,bottom=config['backingCrop']
        sub=rgb[top:bottom,left:right];submask=mask[top:bottom,left:right]
        if int(submask.sum())!=int(mask.sum()):
            raise ValueError('Fill mask extends outside registered crop')
        options=ort.SessionOptions();options.log_severity_level=3;options.intra_op_num_threads=8;options.inter_op_num_threads=1
        model=DATA/'models/lama/inpainting_lama_2025jan.onnx'
        session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
        raw=session.run(None,lama_inputs(sub,submask))[0]
        backing=rgb.copy();backing[top:bottom,left:right]=compose_lama_result(sub,submask,raw)
        Image.fromarray(backing).save(output/'backing.png')
        result.update({'model_sha256':sha256(model),'crop':config['backingCrop'],'fill_pixels':int(mask.sum()),
                       'outside_fill_exact':bool(np.array_equal(backing[~mask],rgb[~mask]))})
    else:
        raise ValueError('Unknown correction stage')
    result.update({'wall_seconds':time.perf_counter()-started,'process_memory':process_memory(__import__('os').getpid())})
    write_json(output/f'correction-{stage}.json',result)


if __name__=='__main__':
    main(sys.argv[1],Path(sys.argv[2]))
