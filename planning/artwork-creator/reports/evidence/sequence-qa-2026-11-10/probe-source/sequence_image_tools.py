"""The image tools in B-09; distinct GPU/CPU processes and distinct mask roles."""
import json
from pathlib import Path
import sys
import time
from kre00 import DATA,ROOT,sha256,write_json,process_memory


def main(stage,output):
    started=time.perf_counter()
    import numpy as np
    from PIL import Image,ImageFilter
    from image_ops import lama_inputs,compose_lama_result
    output=output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated run')
    source=output/'B-04-1024-500.png'
    image=Image.open(source).convert('RGB');rgb=np.array(image)
    report={'stage':stage,'input_sha256':sha256(source),'quality':'not-reviewed'}
    if stage=='segment':
        import torch
        from transformers import Sam2Model,Sam2Processor
        index=next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        device=f'cuda:{index}'
        torch.cuda.reset_peak_memory_stats(index)
        model=Sam2Model.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True).to(device).eval()
        processor=Sam2Processor.from_pretrained(DATA/'models/sam2-tiny',local_files_only=True)
        prompts={'input_points':[[[[320,224],[321,175]]]],'input_labels':[[[1,0]]],
                 'input_boxes':[[[240,175,410,270]]]}
        inputs=processor(images=image,**prompts,return_tensors='pt').to(device)
        tick=time.perf_counter()
        with torch.inference_mode():
            prediction=model(**inputs,multimask_output=True)
        torch.cuda.synchronize(index)
        report['inference_seconds']=time.perf_counter()-tick
        choice=int(prediction.iou_scores[0,0].argmax().item())
        mask=processor.post_process_masks(prediction.pred_masks.cpu(),inputs['original_sizes'])[0][0,choice].numpy().astype(bool)
        if not 100<mask.sum()<rgb.shape[0]*rgb.shape[1]*.1:
            raise ValueError('Object selection failed; retain generated input')
        Image.fromarray(mask.astype(np.uint8)*255).save(output/'object-mask.png')
        tick=time.perf_counter()
        r,g,b=rgb.astype(np.float32).transpose(2,0,1)
        lights=mask&(g>140)&(b>140)&(g>r*1.4)&(b>r*1.4)
        Image.fromarray(lights.astype(np.uint8)*255).save(output/'light-mask.png')
        # Separate environmental material candidate, reviewed later; never a visibility mask.
        color_max=rgb.max(axis=2).astype(float);color_min=rgb.min(axis=2).astype(float)
        environment=(color_max>85)&((color_max-color_min)>50)&~np.array(Image.fromarray(mask.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(101))).astype(bool)
        Image.fromarray(environment.astype(np.uint8)*255).save(output/'environment-light-mask.png')
        report.update({'prompts':prompts,'selection_note':'Fixed points from manually reviewed seed-500 composition, not autonomous localization',
            'object_pixels':int(mask.sum()),'light_pixels':int(lights.sum()),'material_tool_seconds':time.perf_counter()-tick,
            'gpu_max_allocated_bytes':torch.cuda.max_memory_allocated(index),'gpu_max_reserved_bytes':torch.cuda.max_memory_reserved(index)})
    elif stage=='fill':
        import onnxruntime as ort
        mask=np.array(Image.open(output/'object-mask.png').convert('L'))>0
        # Remove also the original baked glow; a conservative backing area for this moving object.
        expanded=np.array(Image.fromarray(mask.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(101)))>0
        crop=(64,0,576,512);left,top,right,bottom=crop
        sub=rgb[top:bottom,left:right];submask=expanded[top:bottom,left:right]
        options=ort.SessionOptions();options.log_severity_level=3;options.intra_op_num_threads=8;options.inter_op_num_threads=1
        tick=time.perf_counter()
        session=ort.InferenceSession(str(DATA/'models/lama/inpainting_lama_2025jan.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
        report['session_load_seconds']=time.perf_counter()-tick
        tick=time.perf_counter()
        raw=session.run(None,lama_inputs(sub,submask))[0]
        report['inference_seconds']=time.perf_counter()-tick
        backing=rgb.copy();backing[top:bottom,left:right]=compose_lama_result(sub,submask,raw)
        Image.fromarray(backing).save(output/'backing.png')
        Image.fromarray(expanded.astype(np.uint8)*255).save(output/'backing-fill-mask.png')
        report.update({'crop':list(crop),'mask_expansion_kernel':101,
            'outside_fill_exact':bool(np.array_equal(backing[~expanded],rgb[~expanded])),
            'note':'Inpainted backing and large glow-removal area need motion/zoom review; not accepted artwork'})
    else:
        raise ValueError('Unknown stage')
    report['total_worker_seconds']=time.perf_counter()-started
    report['process_memory']=process_memory(__import__('os').getpid())
    report['artifacts']={p.name:sha256(p) for p in output.glob('*.png')}
    write_json(output/f'{stage}-result.json',report)


if __name__=='__main__':
    main(sys.argv[1],Path(sys.argv[2]))
