import unittest
try:
    import numpy as np
except ImportError:
    np=None
if np is not None:
    from image_ops import lama_inputs,compose_lama_result,select_bright_material,compose_masked_edit


@unittest.skipIf(np is None,'Run with isolated ONNX Python (NumPy required)')
class ImageContracts(unittest.TestCase):
    def test_locked_edit_preserves_background_and_protected_light_pixels(self):
        original=np.zeros((3,3,3),np.uint8);original[1,1]=[0,255,255]
        proposed=np.full((3,3,3),[255,0,0],np.uint8)
        mask=np.zeros((3,3),bool);mask[1,0]=True
        result=compose_masked_edit(original,proposed,mask)
        np.testing.assert_array_equal(result[~mask],original[~mask])
        self.assertEqual(result[1,0].tolist(),[255,0,0])
        with self.assertRaises(ValueError):
            compose_masked_edit(original,proposed[:2],mask)

    def test_opencv_bgr_contract_and_binary_mask_preserve_source(self):
        rgb=np.array([[[255,0,0],[0,255,0]]],dtype=np.uint8);before=rgb.copy()
        inputs=lama_inputs(rgb,np.array([[0,7]],dtype=np.uint8))
        self.assertEqual(inputs['image'].dtype,np.float32)
        self.assertAlmostEqual(float(inputs['image'][0,2,0,0]),.9996,places=5)
        self.assertEqual(float(inputs['image'][0,0,0,0]),0)
        self.assertEqual(inputs['mask'].tolist(),[[[[0,1]]]])
        np.testing.assert_array_equal(rgb,before)

    def test_empty_mask_preserves_every_pixel_even_if_model_alters_background(self):
        rgb=np.arange(18,dtype=np.uint8).reshape(2,3,3)
        result=compose_lama_result(rgb,np.zeros((2,3),bool),np.full((1,3,2,3),250,dtype=np.float32))
        np.testing.assert_array_equal(result,rgb)

    def test_selected_pixel_uses_rgb_output_and_neighbors_are_exact(self):
        rgb=np.arange(18,dtype=np.uint8).reshape(2,3,3)
        raw=np.zeros((1,3,2,3),np.float32);raw[0,0]=5;raw[0,1]=7;raw[0,2]=11
        mask=np.zeros((2,3),bool);mask[0,1]=True
        result=compose_lama_result(rgb,mask,raw)
        self.assertEqual(result[0,1].tolist(),[11,7,5])
        np.testing.assert_array_equal(result[~mask],rgb[~mask])
        with self.assertRaises(ValueError):
            compose_lama_result(rgb,mask,np.full((1,3,2,3),np.nan))

    def test_material_selection_keeps_dark_holes_and_protects_neighbors(self):
        rgb=np.full((3,3,3),255,np.uint8);rgb[1,1]=0
        obj=np.ones((3,3),bool);obj[0,0]=False
        selected=select_bright_material(rgb,obj,170)
        self.assertFalse(selected[1,1]);self.assertFalse(selected[0,0]);self.assertTrue(selected[0,1])
        with self.assertRaises(ValueError):
            select_bright_material(rgb,np.ones((2,2),bool),170)


if __name__=='__main__':
    unittest.main()
