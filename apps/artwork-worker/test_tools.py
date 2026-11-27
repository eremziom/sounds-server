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
        if tool=='composeMasks':Image.fromarray(mask//2).save(directory/'input-2.png')
        (directory/'request.json').write_text(json.dumps({'tool':tool,'arguments':args,'inputs':[{}, {}, {}] if tool=='composeMasks' else [{},{}]}),encoding='utf-8')
        execute('cpu',directory)
        result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
        file=directory/result['outputs'][0]['file']
        return (json.loads(file.read_text(encoding='utf-8')) if result['outputs'][0]['kind']=='report' else np.array(Image.open(file))),result

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

    def test_material_detail_selection_preserves_ridges_not_flat_surface(self):
        pixels=np.full((18,32,3),[20,120,160],np.uint8)
        pixels[3:15,15]=[40,220,240]
        mask=np.full((18,32),255,np.uint8)
        selected,_=self.run_tool('deriveLightSelection',{'minLuma':60,'minSaturation':.3,'detailRadius':2,'detailContrast':8},pixels,mask)
        self.assertTrue(np.all(selected[3:15,15]==255))
        self.assertEqual(np.count_nonzero(selected),12)

    def test_mismatched_mask_rejected(self):
        with self.assertRaisesRegex(ValueError,'dimensions'):
            self.run_tool('extractLayer',{},mask=np.zeros((8,8),np.uint8))

    def test_color_plate_and_polygon_selection(self):
        plate,_=self.run_tool('createColorPlate',{'width':16,'height':9,'rgb':[0,0,0]})
        self.assertEqual(plate.shape,(9,16,3));self.assertFalse(plate.any())
        mask,_=self.run_tool('createMask',{'role':'visibility-mask','value':255,'polygon':[{'x':2,'y':2},{'x':8,'y':2},{'x':8,'y':8},{'x':2,'y':8}]})
        self.assertEqual(np.count_nonzero(mask),49)

    def test_composition_and_explicit_registration(self):
        union,_=self.run_tool('composeMasks',{'operation':'union','role':'material-mask'})
        intersection,_=self.run_tool('composeMasks',{'operation':'intersect','role':'material-mask'})
        difference,_=self.run_tool('composeMasks',{'operation':'subtract','role':'material-mask'})
        self.assertEqual(int(union.max()),255);self.assertEqual(int(intersection.max()),127);self.assertEqual(int(difference.max()),128)
        registered,_=self.run_tool('registerMap',{'role':'occlusion-mask'},mask=np.full((9,16),255,np.uint8))
        self.assertEqual(registered.shape,(18,32));self.assertTrue(np.all(registered==255))

    def test_selection_report_preserves_measured_pivot(self):
        report,_=self.run_tool('inspectSelection',{})
        self.assertEqual(report['selectedPixels'],180)
        self.assertEqual(report['centroid'],{'x':14.5,'y':8.5})

if __name__=='__main__': unittest.main()
