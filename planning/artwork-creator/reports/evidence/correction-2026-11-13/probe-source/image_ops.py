"""Deterministic pixel contracts; no inference, files, or runtime application state."""
import numpy as np


def lama_inputs(rgb,mask):
    if rgb.dtype!=np.uint8 or rgb.ndim!=3 or rgb.shape[2]!=3 or mask.shape!=rgb.shape[:2]:
        raise ValueError('Expected registered uint8 RGB image and 2D mask')
    return {'image':np.ascontiguousarray(rgb[:,:,::-1].transpose(2,0,1)[None]*np.float32(.00392)),
            'mask':(mask>0).astype(np.float32)[None,None]}


def compose_lama_result(rgb,mask,raw):
    if raw.shape!=(1,3,*rgb.shape[:2]) or not np.isfinite(raw).all() or mask.shape!=rgb.shape[:2]:
        raise ValueError('Invalid inpainting output or mask registration')
    predicted=np.clip(raw[0].transpose(1,2,0)[:,:,::-1],0,255).astype(np.uint8)
    return np.where((mask>0)[:,:,None],predicted,rgb)


def select_bright_material(rgb,object_mask,threshold):
    if object_mask.shape!=rgb.shape[:2] or not np.isfinite(threshold) or not 0<=threshold<=255:
        raise ValueError('Invalid material selection registration or threshold')
    luma=rgb.astype(np.float32)@np.array([.2126,.7152,.0722],dtype=np.float32)
    return object_mask.astype(bool)&(luma>=threshold)


def compose_masked_edit(original,proposed,edit_mask):
    if original.shape!=proposed.shape or edit_mask.shape!=original.shape[:2] or original.dtype!=proposed.dtype:
        raise ValueError('Edit images and mask must share registration and dtype')
    return np.where(edit_mask.astype(bool)[:,:,None],proposed,original)
