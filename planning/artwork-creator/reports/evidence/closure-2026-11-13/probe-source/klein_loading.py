"""Process-local pinned Windows checkpoint reader; no installed files are changed."""
from contextlib import contextmanager
import safetensors.torch


@contextmanager
def pread_weights():
    original=safetensors.torch.load_file
    def read(filename,device='cpu',*,backend='mmap'):
        return original(filename,device=device,backend='pread')
    safetensors.torch.load_file=read
    try:
        yield
    finally:
        safetensors.torch.load_file=original
