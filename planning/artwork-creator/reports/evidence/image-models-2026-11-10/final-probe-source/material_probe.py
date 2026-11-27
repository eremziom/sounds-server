"""B-07: separate object segmentation from bright-material selection on real pixels."""
import gc
import json
import os
from pathlib import Path
import sys
import time
from kre00 import ROOT, DATA, sha256, write_json, process_memory


def main(output):
    import numpy as np
    from PIL import Image,ImageDraw
    import torch
    from transformers import Sam2Model,Sam2Processor
    from image_ops import select_bright_material
    output = output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated run')
    source = ROOT/'apps/ui/public/infinite-zoom/samples/digital-grid'
    image = Image.open(source/'plate.png').convert('RGB')
    pixels = np.array(image)
    reference = np.array(Image.open(source/'visible-front-wheel.png').convert('RGB'))[:,:,0]>127
    report = {'id':'B-07','source_hashes':{f:sha256(source/f) for f in ['plate.png','visible-front-wheel.png']},
        'reference':'Existing authored front-wheel bright-material mask, threshold red >127; not an object-visibility mask',
        'thresholds':[140,170,200],'quality':'not-reviewed','runs':[],
        'selection':'Gamma-encoded Rec.709 luma threshold inside SAM object mask; no reference used for selection'}
    report['pixel_contract_sha256']=sha256(ROOT/'tools/artwork-creator/image_ops.py')
    model = None
    inputs = prediction = None
    index = None
    try:
        if not torch.cuda.is_available():
            raise RuntimeError('GPU unavailable; CPU fallback forbidden for this probe')
        index = next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        device = f'cuda:{index}'
        torch.cuda.reset_peak_memory_stats(index)
        model = Sam2Model.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True).to(device).eval()
        processor = Sam2Processor.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True)
        prompts = {'input_points':[[[[1380,640],[1270,620],[1050,610]]]],'input_labels':[[[1,0,0]]],
                   'input_boxes':[[[1050,410,1440,830]]]}
        report['prompts'] = prompts
        for run in range(3):
            inputs = processor(images=image,**prompts,return_tensors='pt').to(device)
            torch.cuda.synchronize(index)
            tick = time.perf_counter()
            with torch.inference_mode():
                prediction = model(**inputs,multimask_output=True)
            torch.cuda.synchronize(index)
            seconds = time.perf_counter()-tick
            scores = prediction.iou_scores.detach().cpu().numpy()[0,0]
            choice = int(scores.argmax())
            object_mask = processor.post_process_masks(prediction.pred_masks.detach().cpu(),inputs['original_sizes'])[0][0,choice].numpy().astype(bool)
            Image.fromarray(object_mask.astype(np.uint8)*255).save(output/f'object-{run}.png')
            report['runs'].append({'run':run,'inference_seconds':seconds,'selected_mask':choice,'model_scores':scores.tolist()})
        luma = pixels.astype(np.float32)@np.array([.2126,.7152,.0722],dtype=np.float32)
        selections = []
        report['candidates'] = []
        for threshold in report['thresholds']:
            tick = time.perf_counter()
            selected = select_bright_material(pixels,object_mask,threshold)
            seconds = time.perf_counter()-tick
            intersection = int((selected&reference).sum())
            union = int((selected|reference).sum())
            record = {'threshold':threshold,'selection_seconds':seconds,'pixels':int(selected.sum()),
                'precision':intersection/max(1,int(selected.sum())), 'recall':intersection/max(1,int(reference.sum())),
                'iou':intersection/max(1,union),'outside_object_pixels':int((selected&~object_mask).sum()),
                'dark_gap_pixels_selected':int((selected&(luma<100)).sum())}
            path = output/f'material-{threshold}.png'
            Image.fromarray(selected.astype(np.uint8)*255).save(path)
            record['sha256'] = sha256(path)
            report['candidates'].append(record)
            selections.append(selected)
        masks = [object_mask,reference,*selections]
        board = Image.new('RGB',(5*256,282),'#111111')
        draw = ImageDraw.Draw(board)
        for column,mask in enumerate(masks):
            frame = pixels.copy()
            frame[mask]=(frame[mask].astype(float)*.4+np.array([255,0,0])*.6).astype(np.uint8)
            board.paste(Image.fromarray(frame).crop((1010,385,1480,855)).resize((256,256)),(column*256,26))
            draw.text((column*256+6,6),['SAM object','authored material','luma >=140','luma >=170','luma >=200'][column],fill='white')
        board.save(output/'review.webp',quality=92)
        report.update({'gpu_max_allocated_bytes':torch.cuda.max_memory_allocated(index),
            'gpu_max_reserved_bytes':torch.cuda.max_memory_reserved(index),'process_memory':process_memory(os.getpid()),
            'source_unchanged':all(sha256(source/name)==digest for name,digest in report['source_hashes'].items())})
    except BaseException as error:
        report['error']=f'{type(error).__name__}: {error}'
        raise
    finally:
        model=inputs=prediction=None
        gc.collect()
        if index is not None:
            torch.cuda.empty_cache()
            report['gpu_allocated_after_release_bytes']=torch.cuda.memory_allocated(index)
        write_json(output/'result.json',report)


if __name__=='__main__':
    main(Path(sys.argv[1]))
