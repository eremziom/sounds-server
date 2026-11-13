import tempfile
from pathlib import Path
import unittest
import torch
import safetensors.torch
from klein_loading import pread_weights


class ReaderTests(unittest.TestCase):
    def test_checkpoint_values_and_dtypes_match_and_loader_is_restored(self):
        values={'scalar':torch.tensor(.5),'bf16':torch.arange(12,dtype=torch.bfloat16).reshape(3,4)}
        original=safetensors.torch.load_file
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'weights.safetensors'
            safetensors.torch.save_file(values,file)
            with pread_weights():
                actual=safetensors.torch.load_file(file)
            self.assertIs(safetensors.torch.load_file,original)
            for key in values:
                torch.testing.assert_close(actual[key],values[key],atol=0,rtol=0)

    def test_loader_is_restored_on_error(self):
        original=safetensors.torch.load_file
        with self.assertRaises(FileNotFoundError):
            with pread_weights():
                safetensors.torch.load_file('this-file-does-not-exist.safetensors')
        self.assertIs(safetensors.torch.load_file,original)
