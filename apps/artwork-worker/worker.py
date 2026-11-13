"""One bounded operation/stage. Started by the durable Node supervisor, never an HTTP server."""
import json
import os
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/artwork-creator'))


def parent_watch():
    # The supervisor records our PID before authorizing heavy imports/allocation.
    directory=Path(sys.argv[2]).resolve(strict=True)
    root=Path(os.environ['ARTWORK_JOB_ROOT']).resolve(strict=True)
    if directory==root or not directory.is_relative_to(root):
        raise ValueError('Worker identity directory outside operation root')
    # A Windows venv executable may be a launcher with a different PID from
    # this interpreter. Persist the actual interpreter PID for crash recovery.
    identity=directory/('identity-'+sys.argv[1]+'.json')
    with identity.open('x',encoding='utf-8') as stream:
        json.dump({'pid':os.getpid()},stream)
    authorization = b''
    while not authorization.endswith(b'\n') and len(authorization) < 32:
        chunk = os.read(sys.stdin.fileno(),1)
        if not chunk: os._exit(130)
        authorization += chunk
    if authorization != b'START\n':
        os._exit(130)
    def watch():
        if os.name == 'nt':
            # Poll instead of blocking a descriptor/pipe read in another thread:
            # that can stall Windows extension imports (including NumPy).
            import ctypes as c
            from ctypes import wintypes as w
            import msvcrt
            read = c.WinDLL('kernel32',use_last_error=True).PeekNamedPipe
            read.argtypes = [w.HANDLE,c.c_void_p,w.DWORD,c.c_void_p,c.c_void_p,c.c_void_p]
            read.restype = w.BOOL
            handle = msvcrt.get_osfhandle(sys.stdin.fileno())
            import time
            while read(handle,None,0,None,None,None):
                time.sleep(.25)
        else:
            while os.read(sys.stdin.fileno(),1):
                pass
        os._exit(130)
    threading.Thread(target=watch, daemon=True).start()


def execute(stage, directory):
    import numpy as np
    from PIL import Image, ImageFilter, ImageDraw
    if np.__version__ != '2.5.4' or Image.__version__ != '13.0.0':
        raise RuntimeError('Pinned NumPy/Pillow environment required')
    Image.MAX_IMAGE_PIXELS = 67108864
    directory = directory.resolve(strict=True)
    root = Path(os.environ['ARTWORK_JOB_ROOT']).resolve(strict=True)
    if directory == root or not directory.is_relative_to(root):
        raise ValueError('Operation directory outside configured root')
    request = json.loads((directory / 'request.json').read_text(encoding='utf-8'))
    tool, args = request['tool'], request['arguments']
    inputs = request['inputs']
    models = Path(os.environ.get('ARTWORK_MODELS_DIR', str(ROOT / '.local/kre00/models'))).resolve()
    model_key = 'sam' if stage=='sam' else 'klein' if stage in ('encode','transform','decode') else 'lama' if tool=='fillBackground' else None
    if model_key:
        import hashlib
        profile_path=Path(__file__).parent/'profile-lock.json'
        profile=json.loads(profile_path.read_text(encoding='utf-8'))
        verified=json.loads((models/'.kre02-verified.json').read_text(encoding='utf-8'))
        if verified.get('profileSha256')!=hashlib.sha256(profile_path.read_bytes()).hexdigest():
            raise RuntimeError('Run verify-profile.py for this pinned model profile')
        for file in profile['models'][model_key]['files']:
            info=(models/file['path']).stat()
            if verified['files'].get(file['path'])!={'bytes':info.st_size,'mtimeNs':info.st_mtime_ns}:
                raise RuntimeError('Model file changed; run offline profile verification again')

    def image(index=0, mode='RGB'):
        source = directory / f'input-{index}.png'
        if source.is_symlink():
            raise ValueError('Input symlink rejected')
        with Image.open(source) as loaded:
            loaded.load()
            return loaded.convert(mode)

    def result(value, kind, name='result', registration='source'):
        value.save(directory / f'{name}.png')
        record = {'outputs': [{'name': name, 'file': f'{name}.png', 'kind': kind,
                              'registration': registration}], 'details': {'tool': tool, 'quality': 'not-reviewed'}}
        (directory / 'result.json').write_text(json.dumps(record), encoding='utf-8')

    def gpu():
        import torch
        if torch.__version__ != '2.9.1+rocm7.2.1':
            raise RuntimeError('Pinned Torch/ROCm version required')
        index = next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        torch.cuda.set_per_process_memory_fraction(.85, index)
        return torch, f'cuda:{index}'

    if stage in ('encode', 'transform', 'decode', 'sam'):
        import importlib.metadata as metadata
        expected = {'transformers': '5.22.2', 'diffusers': '0.42.1', 'safetensors': '0.8.0'}
        for name, version in expected.items():
            if metadata.version(name) != version:
                raise RuntimeError(f'Pinned {name} version required')
        torch, device = gpu()
        from klein_loading import pread_weights
        from safetensors.torch import load_file, save_file
        if stage == 'encode':
            from transformers import Qwen3ForCausalLM, AutoTokenizer
            from diffusers import Flux2KleinPipeline
            prompt = args['prompt']
            # Consume the shared document and carry its required concerns into the actual prompt.
            guidelines = (ROOT / 'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md').read_text(encoding='utf-8')
            if not guidelines or not request.get('snapshot', {}).get('brief'):
                raise ValueError('Authoring guidelines and scene brief required')
            brief = request['snapshot']['brief']
            from prompts import compose_prompt
            prompt = compose_prompt(prompt, brief, editing=tool == 'editImage')
            tokenizer = AutoTokenizer.from_pretrained(models/'klein4b/tokenizer', local_files_only=True)
            text = tokenizer.apply_chat_template([{'role': 'user', 'content': prompt}], tokenize=False,
                                                add_generation_prompt=True, enable_thinking=False)
            if len(tokenizer(text)['input_ids']) > 512:
                raise ValueError('Prompt exceeds measured 512-token context; shorten it explicitly')
            with pread_weights():
                encoder = Qwen3ForCausalLM.from_pretrained(models/'klein4b/text_encoder', local_files_only=True,
                            dtype=torch.bfloat16, low_cpu_mem_usage=True).to(device).eval()
            pipe = Flux2KleinPipeline(scheduler=None, vae=None, text_encoder=encoder, tokenizer=tokenizer,
                                     transformer=None, is_distilled=True)
            with torch.inference_mode():
                embeds, _ = pipe.encode_prompt(prompt, device=device, max_sequence_length=512)
            save_file({'prompt_embeds': embeds.cpu().contiguous()}, str(directory/'embeds.safetensors'))
            (directory/'actual-prompt.txt').write_text(prompt, encoding='utf-8')
        elif stage == 'transform':
            from bounded_attention import bounded_attention
            from diffusers.models.transformers import transformer_flux2
            from diffusers import Flux2KleinPipeline
            transformer_flux2.dispatch_attention_fn = bounded_attention
            with pread_weights():
                pipe = Flux2KleinPipeline.from_pretrained(models/'klein4b', local_files_only=True,
                         text_encoder=None, tokenizer=None, torch_dtype=torch.bfloat16).to(device)
            pipe.set_progress_bar_config(disable=True)
            width, height = (args['width'], args['height']) if tool == 'generateImage' else image().size
            if (width, height) not in [(512, 288), (1024, 576)]:
                raise ValueError('Unmeasured Klein dimensions')
            embeds = load_file(directory/'embeds.safetensors')['prompt_embeds'].to(device)
            def progress(_pipe, step, _timestep, kwargs):
                (directory/'progress.json').write_text(json.dumps({'step': step + 1, 'total': 4}), encoding='utf-8')
                return kwargs
            with torch.inference_mode():
                latents = pipe(prompt_embeds=embeds, width=width, height=height, num_inference_steps=4,
                    guidance_scale=1.0, generator=torch.Generator(device='cpu').manual_seed(args['seed']),
                    output_type='latent', callback_on_step_end=progress,
                    **({'image': image()} if tool == 'editImage' else {})).images
            save_file({'latents': latents.cpu().contiguous()}, str(directory/'latent.safetensors'))
        elif stage == 'decode':
            from diffusers import AutoencoderKLFlux2
            from diffusers.image_processor import VaeImageProcessor
            with pread_weights():
                vae = AutoencoderKLFlux2.from_pretrained(models/'klein4b/vae', local_files_only=True,
                                                       torch_dtype=torch.bfloat16).to(device).eval()
            latent = load_file(directory/'latent.safetensors')['latents'].to(device)
            with torch.inference_mode():
                decoded = VaeImageProcessor().postprocess(vae.decode(latent, return_dict=False)[0], output_type='pil')[0]
            if tool == 'editImage':
                from image_ops import compose_masked_edit
                decoded = Image.fromarray(compose_masked_edit(np.array(image()), np.array(decoded), np.array(image(1, 'L')) > 0))
            result(decoded, 'image', registration='new' if tool == 'generateImage' else 'source')
        else:
            from transformers import Sam2Model, Sam2Processor
            source = image()
            if any(p['x'] >= source.width or p['y'] >= source.height for p in args['points']):
                raise ValueError('SAM point outside source')
            prompts = {'input_points': [[[[p['x'], p['y']] for p in args['points']]]],
                       'input_labels': [[[p['label'] for p in args['points']]]]}
            if 'box' in args:
                x0,y0,x1,y1 = args['box']
                if not (0 <= x0 < x1 <= source.width and 0 <= y0 < y1 <= source.height):
                    raise ValueError('Invalid SAM box')
                prompts['input_boxes'] = [[args['box']]]
            model = Sam2Model.from_pretrained(models/'sam2-tiny', local_files_only=True).to(device).eval()
            processor = Sam2Processor.from_pretrained(models/'sam2-tiny', local_files_only=True)
            feed = processor(images=source, **prompts, return_tensors='pt').to(device)
            with torch.inference_mode():
                prediction = model(**feed, multimask_output=True)
            choice = int(prediction.iou_scores[0,0].argmax().item())
            mask = processor.post_process_masks(prediction.pred_masks.cpu(), feed['original_sizes'])[0][0,choice].numpy()
            if not mask.any():
                raise ValueError('Empty SAM selection; refine points or box')
            result(Image.fromarray(mask.astype(np.uint8)*255), args['role'])
        torch.cuda.synchronize(device)
        return

    if tool == 'createColorPlate':
        if args['width']*9 != args['height']*16: raise ValueError('Color plate must be 16:9')
        result(Image.new('RGB',(args['width'],args['height']),tuple(args['rgb'])),'image',registration='new')
        return
    source = image()
    pixels = np.array(source)
    mask_image = image(1, 'L') if len(inputs) > 1 else None
    if tool=='registerMap':
        result(mask_image.resize(source.size,Image.Resampling.NEAREST),args['role'])
        return
    if mask_image is not None and mask_image.size != source.size:
        raise ValueError('Input dimensions differ')
    mask = np.array(mask_image) if mask_image is not None else None
    if tool == 'createMask':
        value=Image.new('L',source.size,0 if 'polygon' in args else args['value'])
        if 'polygon' in args:
            if any(p['x']>source.width or p['y']>source.height for p in args['polygon']): raise ValueError('Mask polygon outside source')
            ImageDraw.Draw(value).polygon([(p['x'],p['y']) for p in args['polygon']],fill=args['value'])
        result(value,args['role'])
    elif tool=='composeMasks':
        other=np.array(image(2,'L'))
        if other.shape!=mask.shape: raise ValueError('Masks must share registration')
        if args['operation']=='union': value=np.maximum(mask,other)
        elif args['operation']=='intersect': value=np.minimum(mask,other)
        else: value=np.clip(mask.astype(np.int16)-other.astype(np.int16),0,255).astype(np.uint8)
        result(Image.fromarray(value),args['role'])
    elif tool=='inspectSelection':
        y,x=np.nonzero(mask>0)
        selection=pixels[mask>0].astype(np.float32)
        report={'selectedPixels':int(len(x)),'totalPixels':int(mask.size),'fraction':float(len(x)/mask.size),
                'bounds':{'left':int(x.min()),'top':int(y.min()),'right':int(x.max()+1),'bottom':int(y.max()+1)} if len(x) else None,
                'centroid':{'x':float(x.mean()),'y':float(y.mean())} if len(x) else None,
                'meanRGB':selection.mean(axis=0).tolist() if len(x) else None,'visualAcceptance':False}
        (directory/'selection-report.json').write_text(json.dumps(report),encoding='utf-8')
        (directory/'result.json').write_text(json.dumps({'outputs':[{'name':'selection','file':'selection-report.json','kind':'report','registration':'none'}],'details':report}),encoding='utf-8')
    elif tool == 'registerImage':
        if args['width']*9 != args['height']*16:
            raise ValueError('Registration requires normalized 16:9 coordinates')
        result(source.resize((args['width'],args['height']), Image.Resampling.LANCZOS), 'image', registration='new')
    elif tool == 'extractLayer':
        layer = image(0, 'RGBA')
        layer.putalpha(Image.fromarray((np.array(layer.getchannel('A')).astype(np.uint16)*mask//255).astype(np.uint8)))
        result(layer, 'image')
    elif tool == 'refineMask':
        op, radius = args['operation'], args.get('radius', 1)
        if op == 'dilate': value = mask_image.filter(ImageFilter.MaxFilter(2*radius+1))
        elif op == 'erode': value = mask_image.filter(ImageFilter.MinFilter(2*radius+1))
        elif op == 'feather': value = mask_image.filter(ImageFilter.GaussianBlur(radius))
        elif op == 'threshold': value = Image.fromarray((mask >= args.get('threshold',128)).astype(np.uint8)*255)
        else: value = Image.fromarray(255-mask)
        result(value, args['role'])
    elif tool == 'deriveLightSelection':
        luma = pixels.astype(np.float32) @ np.array([.2126,.7152,.0722], np.float32)
        hsv = np.array(source.convert('HSV')).astype(np.float32)
        hue, saturation = hsv[:,:,0]*360/255, hsv[:,:,1]/255
        selection = (mask > 0) & (luma >= args['minLuma']) & (saturation >= args['minSaturation'])
        low, high = args.get('hueFrom',0), args.get('hueTo',360)
        selection &= ((hue >= low) & (hue <= high)) if low <= high else ((hue >= low) | (hue <= high))
        if args.get('detailRadius'):
            # White top-hat selects real bright material ridges against their
            # local surface, rather than outlining a thresholded silhouette.
            size=2*args['detailRadius']+1
            light=Image.fromarray(np.clip(luma,0,255).astype(np.uint8))
            opened=np.asarray(light.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size)),dtype=np.float32)
            selection &= luma-opened >= args.get('detailContrast',8)
        result(Image.fromarray(np.where(selection,mask,0).astype(np.uint8)), 'material-mask')
    elif tool == 'buildInfluenceMap':
        result(mask_image.filter(ImageFilter.GaussianBlur(args['feather'])), 'influence-map')
    elif tool == 'buildDelayMap':
        yy, xx = np.indices(mask.shape, dtype=np.float32)
        direction = args['direction']
        if direction == 'x': values = xx
        elif direction == 'y': values = yy
        elif direction == 'radial': values = np.hypot(xx-args['origin']['x'], yy-args['origin']['y'])
        else:
            best = np.full(mask.shape, np.inf, np.float32)
            values = np.zeros(mask.shape, np.float32)
            offset = 0.0
            for a,b in zip(args['path'],args['path'][1:]):
                vx,vy = b['x']-a['x'], b['y']-a['y']; length = np.hypot(vx,vy)
                if length == 0: raise ValueError('Zero-length delay path segment')
                t = np.clip(((xx-a['x'])*vx+(yy-a['y'])*vy)/(length*length),0,1)
                distance = (xx-a['x']-t*vx)**2+(yy-a['y']-t*vy)**2
                closer = distance < best
                values[closer] = offset+t[closer]*length; best[closer] = distance[closer]; offset += length
        selected = values[mask > 0]
        if not selected.size: raise ValueError('Empty delay material selection')
        values = (values-selected.min())/max(float(np.ptp(selected)),1)
        if args.get('reverse',False): values = 1-values
        result(Image.fromarray(np.where(mask > 0,np.clip(values*255,0,255),0).astype(np.uint8)), 'delay-map')
    elif tool == 'fillBackground':
        import onnxruntime as ort
        if ort.__version__ != '1.31.1': raise RuntimeError('Pinned ONNX runtime required')
        from image_ops import lama_inputs, compose_lama_result
        removal = np.array(mask_image.filter(ImageFilter.MaxFilter(2*args['dilation']+1))) > 0
        if not removal.any(): raise ValueError('Empty removal mask')
        options = ort.SessionOptions(); options.log_severity_level = 3
        options.intra_op_num_threads = 8; options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(models/'lama/inpainting_lama_2025jan.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
        # Overlapping fixed-512 tiles; combine only within the authored removal area.
        height,width = pixels.shape[:2]
        padded = np.pad(pixels,((0,max(0,512-height)),(0,max(0,512-width)),(0,0)),mode='edge')
        remove = np.pad(removal,((0,max(0,512-height)),(0,max(0,512-width))),mode='constant')
        total = np.zeros_like(padded,dtype=np.float32); weights = np.zeros(padded.shape[:2],np.float32)
        ph,pw = padded.shape[:2]
        xs = sorted(set(list(range(0,max(1,pw-511),384))+[pw-512])); ys = sorted(set(list(range(0,max(1,ph-511),384))+[ph-512]))
        ramp = np.minimum(np.arange(512)+1,512-np.arange(512)).astype(np.float32)
        window = ramp[:,None]*ramp[None,:]
        for y in ys:
            for x in xs:
                rgb, submask = padded[y:y+512,x:x+512], remove[y:y+512,x:x+512]
                if not submask.any(): continue
                raw = session.run(None,lama_inputs(rgb,submask))[0]
                filled = compose_lama_result(rgb,submask,raw)
                total[y:y+512,x:x+512] += filled*window[:,:,None]
                weights[y:y+512,x:x+512] += window
        merged = np.clip(total/np.maximum(weights[:,:,None],1),0,255).astype(np.uint8)[:height,:width]
        result(Image.fromarray(np.where(removal[:,:,None],merged,pixels)), 'image')
    else:
        raise ValueError('Unsupported worker tool')


if __name__ == '__main__':
    parent_watch()
    try:
        execute(sys.argv[1], Path(sys.argv[2]))
    except Exception as error:
        print(f'{type(error).__name__}: {error}', file=sys.stderr, flush=True)
        raise
