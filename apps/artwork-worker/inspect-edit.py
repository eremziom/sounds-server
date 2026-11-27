"""Pixel checks for the small adapter fixture, not artwork visual acceptance."""
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image


def inspect_edit(original, edited, mask):
    if original.shape != edited.shape or mask.shape != original.shape[:2] or not mask.any():
        raise ValueError('Edit inspection requires registered images and a nonempty mask')
    difference=np.abs(edited.astype(np.float32)-original.astype(np.float32))
    selected=edited[mask].astype(np.float32)
    red=(selected[:,0]>100)&(selected[:,0]>selected[:,1]*1.5)&(selected[:,0]>selected[:,2]*1.5)
    return {'outsideMaskExact':bool(np.array_equal(original[~mask],edited[~mask])),
            'insideChangedPixels':int(np.any(difference>0,axis=2)[mask].sum()),
            'maskPixels':int(mask.sum()),'insideMeanAbsoluteDifference':float(difference[mask].mean()),
            'redPixelFraction':float(red.mean()),'visualArtworkAcceptance':False}


if __name__=='__main__':
    images=[np.array(Image.open(Path(p)).convert(mode)) for p,mode in zip(sys.argv[1:],['RGB','RGB','L'])]
    print(json.dumps(inspect_edit(images[0],images[1],images[2]>0)))
