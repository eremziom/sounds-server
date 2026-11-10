"""Memory-bounded, noncausal inference attention for the pinned Flux2 adapter.

Only query rows are partitioned; every row still attends to all keys/values.
Layout matches diffusers Flux2 dispatch: batch, sequence, heads, channels.
"""
import torch
import torch.nn.functional as F
from torch.nn.attention import sdpa_kernel,SDPBackend


def bounded_attention(query,key,value,attn_mask=None,dropout_p=0.0,is_causal=False,
                      scale=None,enable_gqa=False,backend=None,parallel_config=None,**kwargs):
    if attn_mask is not None or dropout_p or is_causal or enable_gqa or parallel_config is not None or kwargs:
        raise ValueError('Bounded adapter supports unmasked, noncausal, dropout-free single-device inference only')
    if query.ndim!=4 or key.ndim!=4 or value.shape!=key.shape or query.shape[0]!=key.shape[0] or query.shape[2:]!=key.shape[2:]:
        raise ValueError('Unexpected Flux2 attention shapes')
    if query.requires_grad or key.requires_grad or value.requires_grad:
        raise ValueError('Inference only')
    output=torch.empty_like(query)
    k=key.transpose(1,2)
    v=value.transpose(1,2)
    with sdpa_kernel(SDPBackend.MATH):
        for start in range(0,query.shape[1],256):
            q=query[:,start:start+256].transpose(1,2)
            output[:,start:start+256]=F.scaled_dot_product_attention(q,k,v,dropout_p=0.0,
                is_causal=False,scale=scale).transpose(1,2)
    return output
