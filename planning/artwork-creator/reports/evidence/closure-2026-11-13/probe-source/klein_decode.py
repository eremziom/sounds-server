"""Decode Klein latents only after the diffusion worker exits, on the same GPU/dtype."""
import json
from pathlib import Path
import sys
import time
from kre00 import ROOT,DATA,sha256,write_json,process_memory


def main(output):
    started=time.perf_counter()
    output=output.resolve()
    if not output.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated output')
    import torch
    from diffusers import AutoencoderKLFlux2
    from diffusers.image_processor import VaeImageProcessor
    from safetensors.torch import load_file
    from klein_loading import pread_weights
    index=next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
    device=f'cuda:{index}'
    torch.cuda.set_per_process_memory_fraction(.85,index);torch.cuda.reset_peak_memory_stats(index)
    with pread_weights():
        vae=AutoencoderKLFlux2.from_pretrained(DATA/'models/klein4b/vae',local_files_only=True,torch_dtype=torch.bfloat16).to(device).eval()
    source=output/'B-04-1024-500-latent.safetensors'
    latent=load_file(source)['latents'].to(device)
    with torch.inference_mode():
        decoded=vae.decode(latent,return_dict=False)[0]
        image=VaeImageProcessor().postprocess(decoded,output_type='pil')[0]
    torch.cuda.synchronize(index)
    if image.size!=(1024,576):
        raise ValueError('Unexpected decoded image dimensions')
    image.save(output/'B-04-1024-500.png')
    write_json(output/'decode-result.json',{'stage':'decode','device':torch.cuda.get_device_name(index),'dtype':'bfloat16','pread_weights':True,
        'latent_sha256':sha256(source),'sha256':sha256(output/'B-04-1024-500.png'),'wall_seconds':time.perf_counter()-started,
        'gpu_max_allocated_bytes':torch.cuda.max_memory_allocated(index),'gpu_max_reserved_bytes':torch.cuda.max_memory_reserved(index),
        'process_memory':process_memory(__import__('os').getpid())})


if __name__=='__main__':
    main(Path(sys.argv[1]))
