"""B-04/B-05, split text/image workers to avoid keeping two 4B models resident."""
import gc
import json
import os
from pathlib import Path
import sys
import time
from kre00 import DATA, ROOT, write_json, sha256, process_memory, summarize

PROMPT = (
    'Wide 16:9 cinematic painterly concept art, a quiet nocturnal stone gateway in a lush alien garden. '
    'The gateway stands in the right middle of the frame, clear open passage, layered distant garden behind. '
    'One small turquoise survey drone, about eight percent of frame width, is already visible at the left-middle '
    'at x=25%, y=45%. Distinct clean readable silhouette, no motion blur. Leave clear space for an arcing flight '
    'through the gateway toward the right; foreground pillar and a few branches can later occlude its path. '
    'Background garden continues coherently behind the drone and throughout the planned route. '
    'Rich material-integrated light details: dozens of small stone fissures and many fine leaf veins distributed '
    'in several groups across both gateway sides, foreground vegetation and distant plants. Thin elongated '
    'vines and leaf veins carry strong saturated cyan, magenta and amber gradients along their lengths. '
    'Preserve dark gaps, rough stone texture, natural branching, fine contours and occlusion. '
    'These luminous materials and the drone lamps are visibly separate from dark unlit surroundings, suitable '
    'for later independent colored impulses and complete environmental blackout with lights remaining visible. '
    'No detached glowing dots, generic floating outlines, white overexposure, text, labels, frame or watermark. '
    'Design for later separated layers, precise visibility and light masks, independent longitudinal delay maps, '
    'smooth environmental reveal, actual object flight and camera zoom. This is one static concept draft, not animation.'
)
EDIT = (
    'Edit this image: change only the small turquoise survey drone hull in the left-middle to deep saturated red. '
    'Keep exactly the drone position, scale, shape, orientation and all its separate lamps. Preserve the stone '
    'gateway, all garden plants, every background contour, material-integrated light details and the strong '
    'cyan-magenta-amber gradients along vines and leaf veins. Preserve dark gaps, rough texture, fine edges '
    'and occlusion. Keep the full original composition and camera unchanged. No new objects or text. '
    'The distinct lamps and luminous materials must remain suitable for later independent blackout/reveal '
    'and impulse/color animation; this edit changes the hull appearance only.'
)


def main(stage, output, use_pread=False):
    started = time.perf_counter()
    import numpy as np
    import torch
    from PIL import Image,ImageDraw
    from safetensors.torch import save_file,load_file
    import diffusers
    from diffusers import Flux2KleinPipeline
    from transformers import Qwen3ForCausalLM,AutoTokenizer
    output = output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated run')
    report = {'stage':stage,'torch':torch.__version__,'diffusers':diffusers.__version__,
              'pread_weights':use_pread,
              'dtype':'bfloat16','records':[],'quality':'not-reviewed',
              'imports_seconds':time.perf_counter()-started}
    modelroot = DATA/'models/klein4b'
    pipe = encoder = embeds = None
    index = None
    try:
        if not torch.cuda.is_available():
            raise RuntimeError('GPU unavailable; no silent CPU fallback')
        index = next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        device = f'cuda:{index}'
        report.update({'device':device,'device_name':torch.cuda.get_device_name(index),'hip':torch.version.hip,
                       'initial_gpu_free_total':list(torch.cuda.mem_get_info(index))})
        if torch.cuda.mem_get_info(index)[0] < 11*2**30:
            raise RuntimeError('Less than 11 GiB GPU memory free; defer rather than risk the display budget')
        torch.cuda.set_per_process_memory_fraction(.85,index)
        torch.cuda.reset_peak_memory_stats(index)
        tick = time.perf_counter()
        if stage == 'encode':
            encoder = Qwen3ForCausalLM.from_pretrained(modelroot/'text_encoder',local_files_only=True,
                        dtype=torch.bfloat16,low_cpu_mem_usage=True).to(device).eval()
            tokenizer = AutoTokenizer.from_pretrained(modelroot/'tokenizer',local_files_only=True)
            pipe = Flux2KleinPipeline(scheduler=None,vae=None,text_encoder=encoder,tokenizer=tokenizer,
                                      transformer=None,is_distilled=True)
            report['load_seconds'] = time.perf_counter()-tick
            for name,prompt in [('generate',PROMPT),('edit',EDIT)]:
                text = tokenizer.apply_chat_template([{'role':'user','content':prompt}],tokenize=False,
                    add_generation_prompt=True,enable_thinking=False)
                tokens = len(tokenizer(text)['input_ids'])
                if tokens>512:
                    raise ValueError(f'Prompt has {tokens} tokens; refuse silent truncation')
                tick = time.perf_counter()
                with torch.inference_mode():
                    embeds,_ = pipe.encode_prompt(prompt,device=device,max_sequence_length=512)
                torch.cuda.synchronize(index)
                path = output/f'{name}-embeds.safetensors'
                save_file({'prompt_embeds':embeds.cpu().contiguous()},str(path))
                report['records'].append({'name':name,'prompt':prompt,'tokens':tokens,
                    'encode_and_save_seconds':time.perf_counter()-tick,'embedding_sha256':sha256(path)})
                print(f'Klein encoded {name}, {tokens} tokens',flush=True)
        elif stage in ['generate','single']:
            from bounded_attention import bounded_attention
            from diffusers.models.transformers import transformer_flux2
            transformer_flux2.dispatch_attention_fn=bounded_attention
            report['attention_backend']='query-chunked native math SDPA, query rows=256; no masks/causality/training'
            report['attention_adapter_sha256']=sha256(ROOT/'tools/artwork-creator/bounded_attention.py')
            from contextlib import nullcontext
            from klein_loading import pread_weights
            with pread_weights() if use_pread else nullcontext():
                pipe = Flux2KleinPipeline.from_pretrained(modelroot,local_files_only=True,text_encoder=None,
                         tokenizer=None,torch_dtype=torch.bfloat16).to(device)
            pipe.set_progress_bar_config(disable=True)
            report['load_seconds'] = time.perf_counter()-tick
            board = Image.new('RGB',(3*512,2*312),'#111111')
            draw = ImageDraw.Draw(board)
            for row,(width,height) in enumerate([(1024,576)] if stage=='single' else [(512,288),(1024,576)]):
                for run in range(1 if stage=='single' else 3):
                    seed = 500+run
                    embeds = load_file(str(output/'generate-embeds.safetensors'))['prompt_embeds'].to(device)
                    tick = time.perf_counter()
                    def progress_callback(_pipe,step,timestep,callback_kwargs):
                        with (output/'progress.jsonl').open('a',encoding='utf-8') as stream:
                            stream.write(json.dumps({'step':step,'seed':seed,'width':width,'height':height})+'\n')
                        return callback_kwargs
                    with torch.inference_mode():
                        image = pipe(prompt_embeds=embeds,width=width,height=height,num_inference_steps=4,
                            guidance_scale=1.0,generator=torch.Generator(device='cpu').manual_seed(seed),
                            callback_on_step_end=progress_callback).images[0]
                    torch.cuda.synchronize(index)
                    seconds = time.perf_counter()-tick
                    if image.size!=(width,height):
                        raise ValueError(f'Unexpected output size {image.size}')
                    path = output/f'B-04-{width}-{seed}.png'
                    image.save(path)
                    record = {'id':'B-04','seed':seed,'width':width,'height':height,'steps':4,
                        'inference_and_decode_seconds':seconds,'sha256':sha256(path),
                        'gpu_allocated':torch.cuda.memory_allocated(index),'gpu_reserved':torch.cuda.memory_reserved(index),
                        'process_memory':process_memory(os.getpid())}
                    report['records'].append(record)
                    write_json(output/f'B-04-{width}-{seed}.json',record)
                    board.paste(image.resize((512,288)),(run*512,row*312+24))
                    draw.text((run*512+6,row*312+6),f'{width}x{height}, seed {seed}',fill='white')
                    print(f'B-04 {width}x{height} seed {seed}: {seconds:.3f}s',flush=True)
            board.save(output/'generation-review.webp',quality=90)
            if stage=='single':
                return
            original = Image.open(output/'B-04-1024-500.png').convert('RGB')
            original_pixels = np.array(original)
            edit_board = Image.new('RGB',(3*512,2*312),'#111111')
            draw = ImageDraw.Draw(edit_board)
            for run in range(3):
                seed = 600+run
                embeds = load_file(str(output/'edit-embeds.safetensors'))['prompt_embeds'].to(device)
                tick = time.perf_counter()
                with torch.inference_mode():
                    edited = pipe(image=original,prompt_embeds=embeds,width=1024,height=576,num_inference_steps=4,
                        guidance_scale=1.0,generator=torch.Generator(device='cpu').manual_seed(seed)).images[0]
                torch.cuda.synchronize(index)
                seconds = time.perf_counter()-tick
                path = output/f'B-05-{seed}.png'
                edited.save(path)
                difference = np.abs(np.array(edited).astype(np.float32)-original_pixels)
                # Coarse region for measurement only; it is not a segmentation mask.
                outside = np.ones((576,1024),dtype=bool)
                outside[int(.25*576):int(.65*576),int(.10*1024):int(.40*1024)] = False
                record = {'id':'B-05','seed':seed,'inference_and_decode_seconds':seconds,'sha256':sha256(path),
                    'source_sha256':sha256(output/'B-04-1024-500.png'),
                    'coarse_edit_region_normalized':[.1,.25,.4,.65],
                    'outside_region_mean_absolute_difference':float(difference[outside].mean()),
                    'outside_region_changed_pixel_fraction':float(np.any(difference>2,axis=2)[outside].mean()),
                    'region_note':'Coarse planned drone area, not a validated object mask; inspect actual generated composition'}
                report['records'].append(record)
                write_json(output/f'B-05-{seed}.json',record)
                edit_board.paste(original.resize((512,288)),(run*512,24))
                edit_board.paste(edited.resize((512,288)),(run*512,336))
                draw.text((run*512+6,6),'original',fill='white')
                draw.text((run*512+6,318),f'edit seed {seed}',fill='white')
                print(f'B-05 seed {seed}: {seconds:.3f}s, outside MAE={record["outside_region_mean_absolute_difference"]:.3f}',flush=True)
            edit_board.save(output/'edit-review.webp',quality=90)
        else:
            raise ValueError('Unknown stage')
        report['gpu_max_allocated_bytes'] = torch.cuda.max_memory_allocated(index)
        report['gpu_max_reserved_bytes'] = torch.cuda.max_memory_reserved(index)
    except BaseException as error:
        report['error']=f'{type(error).__name__}: {error}'
        raise
    finally:
        if index is not None:
            report.setdefault('gpu_max_allocated_bytes',torch.cuda.max_memory_allocated(index))
            report.setdefault('gpu_max_reserved_bytes',torch.cuda.max_memory_reserved(index))
        pipe=encoder=embeds=None
        gc.collect()
        if index is not None:
            torch.cuda.empty_cache()
            report['gpu_allocated_after_release_bytes']=torch.cuda.memory_allocated(index)
        report['total_worker_seconds']=time.perf_counter()-started
        report['process_memory']=process_memory(os.getpid())
        write_json(output/f'{stage}-result.json',report)


if __name__=='__main__':
    if len(sys.argv)>4 or (len(sys.argv)==4 and sys.argv[3]!='--pread-weights'):
        raise ValueError('Expected stage, output and optional --pread-weights')
    main(sys.argv[1],Path(sys.argv[2]),use_pread=len(sys.argv)==4)
