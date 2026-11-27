"""Compare raw generative edits with a source-authored region/protected-light policy."""
import gc
import json
from pathlib import Path
import sys
import time
from kre00 import DATA,ROOT,sha256,write_json


def main(source,output):
    import numpy as np
    import torch
    from PIL import Image,ImageDraw,ImageFilter
    from transformers import Sam2Model,Sam2Processor
    from image_ops import compose_masked_edit
    source=source.resolve();output=output.resolve()
    if not all(p.is_relative_to((DATA/'runs').resolve()) for p in [source,output]):
        raise ValueError('Expected isolated runs')
    original=Image.open(source/'B-04-1024-500.png').convert('RGB')
    pixels=np.array(original)
    if original.size!=(1024,576):
        raise ValueError('Probe coordinates require the reviewed 1024x576 seed-500 draft')
    index=next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
    device=f'cuda:{index}'
    model=Sam2Model.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True).to(device).eval()
    processor=Sam2Processor.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True)
    prompts={'input_points':[[[[320,224],[321,175]]]],'input_labels':[[[1,0]]],
             'input_boxes':[[[240,175,410,270]]]}
    inputs=processor(images=original,**prompts,return_tensors='pt').to(device)
    with torch.inference_mode():
        prediction=model(**inputs,multimask_output=True)
    choice=int(prediction.iou_scores[0,0].argmax().item())
    object_mask=processor.post_process_masks(prediction.pred_masks.cpu(),inputs['original_sizes'])[0][0,choice].numpy().astype(bool)
    # Explicit benchmark policy, not a universal semantic light detector.
    r,g,b=pixels.astype(np.float32).transpose(2,0,1)
    lights=object_mask&(g>140)&(b>140)&(g>r*1.4)&(b>r*1.4)
    lights=np.array(Image.fromarray(lights.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3)))>0
    hull=object_mask&~lights
    if not hull.any() or not lights.any() or object_mask.sum()>pixels.shape[0]*pixels.shape[1]*.1:
        raise ValueError('Unusable object/hull/light selections; manual review needed')
    for name,mask in [('object',object_mask),('protected-lights',lights),('hull',hull)]:
        Image.fromarray(mask.astype(np.uint8)*255).save(output/f'{name}.png')
    report={'id':'B-05-masked-alternative','source':str(source.relative_to(ROOT)),
        'source_sha256':sha256(source/'B-04-1024-500.png'),'prompts':prompts,
        'mask_policy':'SAM object minus separately protected cyan bright pixels (G/B >140 and >1.4R), light dilation 3x3',
        'mask_uncertainty':'Heuristic light/hull boundary; not a production-ready visibility/material selection',
        'pixel_contract_sha256':sha256(ROOT/'tools/artwork-creator/image_ops.py'),
        'object_pixels':int(object_mask.sum()),'hull_pixels':int(hull.sum()),'protected_pixels':int(lights.sum()),'records':[]}
    board=Image.new('RGB',(3*384,3*240),'#111111');draw=ImageDraw.Draw(board)
    for column,seed in enumerate([600,601,602]):
        raw=Image.open(source/f'B-05-{seed}.png').convert('RGB')
        tick=time.perf_counter()
        locked=compose_masked_edit(pixels,np.array(raw),hull)
        path=output/f'locked-{seed}.png';Image.fromarray(locked).save(path)
        record={'seed':seed,'compose_and_save_seconds':time.perf_counter()-tick,'sha256':sha256(path),
            'outside_hull_exact':bool(np.array_equal(locked[~hull],pixels[~hull])),
            'protected_lights_exact':bool(np.array_equal(locked[lights],pixels[lights])),
            'changed_hull_pixels':int(np.any(locked!=pixels,axis=2)[hull].sum())}
        report['records'].append(record)
        for row,frame in enumerate([original,raw,Image.fromarray(locked)]):
            board.paste(frame.resize((384,216)),(column*384,row*240+24))
            draw.text((column*384+6,row*240+6),f'{["original","raw edit","masked edit"][row]} seed {seed}',fill='white')
    board.save(output/'review.webp',quality=90)
    overlay=pixels.copy();overlay[hull]=(overlay[hull]*.4+np.array([255,0,0])*.6).astype(np.uint8)
    Image.fromarray(overlay).crop((225,160,425,285)).resize((800,500)).save(output/'hull-review.webp',quality=92)
    write_json(output/'result.json',report)
    model=inputs=prediction=None;gc.collect();torch.cuda.empty_cache()


if __name__=='__main__':
    main(Path(sys.argv[1]),Path(sys.argv[2]))
