"""Deterministic contracts use small real PNGs and no weights/downloads."""
import json
import os
from pathlib import Path
import tempfile
import unittest
import numpy as np
from PIL import Image
from worker import execute


class ToolsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sounds-artwork-tools-')
        self.root = Path(self.temp.name).resolve()
        os.environ['ARTWORK_JOB_ROOT'] = str(self.root)
        self.number = 0

    def tearDown(self):
        self.temp.cleanup()

    def run_tool(self, tool, args, pixels=None, mask=None):
        self.number += 1
        directory = self.root / str(self.number); directory.mkdir()
        if pixels is None:
            pixels=np.zeros((18,32,3),np.uint8);pixels[4:14,6:24]=[40,230,240]
        if mask is None:
            mask=np.zeros((18,32),np.uint8);mask[4:14,6:24]=255
        Image.fromarray(pixels).save(directory/'input-0.png')
        Image.fromarray(mask).save(directory/'input-1.png')
        (directory/'request.json').write_text(json.dumps({'tool':tool,'arguments':args,'inputs':[{},{}]}),encoding='utf-8')
        execute('cpu',directory)
        result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
        return np.array(Image.open(directory/result['outputs'][0]['file'])),result

    def test_extract_and_registered_image(self):
        output,metadata=self.run_tool('extractLayer',{})
        self.assertEqual(output.shape,(18,32,4))
        self.assertEqual(int(output[0,0,3]),0)
        self.assertEqual(int(output[5,8,3]),255)
        registered,_=self.run_tool('registerImage',{'width':64,'height':36})
        self.assertEqual(registered.shape,(36,64,3))

    def test_refine_roles(self):
        dilated,meta=self.run_tool('refineMask',{'operation':'dilate','radius':1,'role':'occlusion-mask'})
        self.assertEqual(meta['outputs'][0]['kind'],'occlusion-mask')
        self.assertGreater(np.count_nonzero(dilated),180)
        eroded,_=self.run_tool('refineMask',{'operation':'erode','radius':1,'role':'visibility-mask'})
        self.assertLess(np.count_nonzero(eroded),180)

    def test_material_and_influence(self):
        selection,_=self.run_tool('deriveLightSelection',{'minLuma':100,'minSaturation':.3,'hueFrom':150,'hueTo':210})
        self.assertEqual(np.count_nonzero(selection),180)
        influence,meta=self.run_tool('buildInfluenceMap',{'feather':2})
        self.assertEqual(meta['outputs'][0]['kind'],'influence-map')
        self.assertTrue(np.any((influence>0)&(influence<255)))

    def test_direction_and_path_delay(self):
        horizontal,_=self.run_tool('buildDelayMap',{'direction':'x'})
        vertical,_=self.run_tool('buildDelayMap',{'direction':'y'})
        self.assertLess(horizontal[5,6],horizontal[5,23])
        self.assertLess(vertical[4,8],vertical[13,8])
        curved,_=self.run_tool('buildDelayMap',{'direction':'path','path':[{'x':6,'y':4},{'x':6,'y':13},{'x':23,'y':13}]})
        self.assertLess(curved[4,6],curved[13,23])

    def test_mismatched_mask_rejected(self):
        with self.assertRaisesRegex(ValueError,'dimensions'):
            self.run_tool('extractLayer',{},mask=np.zeros((8,8),np.uint8))

if __name__=='__main__': unittest.main()
