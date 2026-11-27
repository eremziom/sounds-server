import unittest
try:
    import torch
except ImportError:
    torch=None
if torch is not None:
    import torch.nn.functional as F
    from torch.nn.attention import sdpa_kernel,SDPBackend
    from bounded_attention import bounded_attention


@unittest.skipIf(torch is None,'Run with isolated GPU Python (PyTorch required)')
class BoundedAttentionTests(unittest.TestCase):
    def test_query_partition_matches_full_attention_with_different_key_length(self):
        torch.manual_seed(123)
        q=torch.randn(2,519,3,16);k=torch.randn(2,601,3,16);v=torch.randn_like(k)
        with sdpa_kernel(SDPBackend.MATH):
            expected=F.scaled_dot_product_attention(q.transpose(1,2),k.transpose(1,2),v.transpose(1,2)).transpose(1,2)
        actual=bounded_attention(q,k,v)
        torch.testing.assert_close(actual,expected,atol=1e-6,rtol=1e-5)

    @unittest.skipUnless(torch is not None and torch.cuda.is_available(),'AMD GPU required')
    def test_bf16_gpu_matches_full_math_attention(self):
        torch.manual_seed(124)
        q=torch.randn(1,519,4,32,device='cuda:0',dtype=torch.bfloat16)
        k=torch.randn(1,601,4,32,device='cuda:0',dtype=torch.bfloat16);v=torch.randn_like(k)
        with sdpa_kernel(SDPBackend.MATH):
            expected=F.scaled_dot_product_attention(q.transpose(1,2),k.transpose(1,2),v.transpose(1,2)).transpose(1,2)
        actual=bounded_attention(q,k,v)
        torch.testing.assert_close(actual,expected,atol=.008,rtol=.008)
        self.assertEqual(actual.device.type,'cuda')

    def test_unsupported_semantics_are_rejected(self):
        q=torch.ones(1,2,1,4)
        for options in [{'is_causal':True},{'dropout_p':.1},{'attn_mask':torch.ones(2,2)}]:
            with self.assertRaises(ValueError):
                bounded_attention(q,q,q,**options)


if __name__=='__main__':
    unittest.main()
