"""Focused tests; no weights, network, application, or GPU required."""
import hashlib
import io
import os
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from capability_probes import iou

spec = importlib.util.spec_from_file_location('kre00', Path(__file__).with_name('kre00.py'))
kre00 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kre00)


class EvidenceTests(unittest.TestCase):
    def test_resumes_a_verified_byte_range_and_checks_final_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'weights.gguf'
            path.with_suffix('.gguf.partial').write_bytes(b'abc')
            response=io.BytesIO(b'def');response.status=206;response.headers={'Content-Range':'bytes 3-5/6'}
            with patch.object(kre00,'ROOT',Path(directory)), patch.object(kre00.urllib.request,'urlopen',return_value=response) as request:
                kre00.download('https://example.invalid',path,hashlib.sha256(b'abcdef').hexdigest())
                self.assertEqual(request.call_args.args[0].get_header('Range'),'bytes=3-')
            self.assertEqual(path.read_bytes(),b'abcdef')

    def test_ignored_range_replaces_partial_instead_of_appending(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'weights.gguf';path.with_suffix('.gguf.partial').write_bytes(b'ab')
            with patch.object(kre00,'ROOT',Path(directory)), patch.object(kre00.urllib.request,'urlopen',return_value=io.BytesIO(b'abcdef')):
                kre00.download('https://example.invalid',path,hashlib.sha256(b'abcdef').hexdigest())
            self.assertEqual(path.read_bytes(),b'abcdef')

    def test_wrong_resume_range_preserves_partial_and_never_promotes(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'weights.gguf';partial=path.with_suffix('.gguf.partial');partial.write_bytes(b'abc')
            response=io.BytesIO(b'def');response.status=206;response.headers={'Content-Range':'bytes 1-3/6'}
            with patch.object(kre00.urllib.request,'urlopen',return_value=response):
                with self.assertRaisesRegex(ValueError,'invalid resume range'):
                    kre00.download('https://example.invalid',path,'0'*64)
            self.assertEqual(partial.read_bytes(),b'abc');self.assertFalse(path.exists())

    def test_iou_distinguishes_correct_missed_and_partial_localization(self):
        self.assertEqual(iou([0,0,1,1],[0,0,1,1]),1)
        self.assertEqual(iou([0,0,.1,.1],[.5,.5,1,1]),0)
        self.assertAlmostEqual(iou([0,0,.5,.5],[.25,.25,.75,.75]),1/7)
    @unittest.skipUnless(os.name == 'nt', 'Windows telemetry')
    def test_real_process_memory_high_water_mark(self):
        result = kre00.process_memory(os.getpid())
        self.assertGreater(result['working_set_bytes'], 0)
        self.assertGreaterEqual(result['peak_working_set_bytes'], result['working_set_bytes'])

    def test_preserves_previous_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'result.json'
            kre00.write_json(path, {'good': True})
            with self.assertRaises(FileExistsError):
                kre00.write_json(path, {'good': False})
            self.assertIn('true', path.read_text())

    def test_rejects_corrupted_cached_weights_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.gguf'
            path.write_bytes(b'corrupt')
            with patch.object(kre00.urllib.request, 'urlopen') as network:
                with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                    kre00.download('https://example.invalid', path, '0' * 64)
                network.assert_not_called()
            self.assertEqual(path.read_bytes(), b'corrupt')

    def test_bad_download_does_not_become_usable_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.gguf'
            with patch.object(kre00.urllib.request, 'urlopen', return_value=io.BytesIO(b'wrong bytes')):
                with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                    kre00.download('https://example.invalid', path, '0' * 64)
            self.assertFalse(path.exists())

    def test_valid_cached_weights_are_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.gguf'
            path.write_bytes(b'valid')
            with patch.object(kre00, 'ROOT', Path(directory)):
                record = kre00.download('https://example.invalid', path, hashlib.sha256(b'valid').hexdigest())
            self.assertEqual(record['bytes'], 5)

    def test_network_timeout_never_promotes_partial_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weights.gguf'
            path.with_suffix('.gguf.partial').write_bytes(b'previous interrupted data')
            with patch.object(kre00.urllib.request, 'urlopen', side_effect=TimeoutError('stalled')):
                with self.assertRaises(TimeoutError):
                    kre00.download('https://example.invalid', path, '0' * 64)
            self.assertFalse(path.exists())

    def test_summary_does_not_hide_outlier(self):
        self.assertEqual(kre00.summarize([2, 100, 1]),
                         {'runs': 3, 'median_seconds': 2, 'min_seconds': 1, 'max_seconds': 100})
        with self.assertRaises(ValueError):
            kre00.summarize([])

    def test_refuses_under_sampled_measurement(self):
        with self.assertRaisesRegex(ValueError, 'At least three'):
            kre00.probe_llm(1, 18790)


if __name__ == '__main__':
    unittest.main()
