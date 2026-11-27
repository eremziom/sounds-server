"""Read model/runtime facts. Run inside the corresponding isolated environment."""
import json
import sys
import time
from kre00 import DATA, write_json

started = time.perf_counter()
if sys.argv[1] == 'onnx':
    import onnx
    import onnxruntime as ort
    model = onnx.load(DATA/'models/lama/inpainting_lama_2025jan.onnx')
    report = {'onnx':onnx.__version__,'onnxruntime':ort.__version__,
              'opsets':[(v.domain,v.version) for v in model.opset_import],
              'operations':sorted({(v.domain,v.op_type) for v in model.graph.node}),
              'available_providers':ort.get_available_providers()}
    session = ort.InferenceSession(str(DATA/'models/lama/inpainting_lama_2025jan.onnx'),
                                   providers=['CPUExecutionProvider'])
    report.update({'inputs':[{ 'name':v.name,'shape':v.shape,'type':v.type} for v in session.get_inputs()],
                   'outputs':[{ 'name':v.name,'shape':v.shape,'type':v.type} for v in session.get_outputs()],
                   'active_providers':session.get_providers()})
else:
    import torch
    report = {'torch':torch.__version__,'hip':torch.version.hip,'cuda_available':torch.cuda.is_available()}
    if torch.cuda.is_available():
        report['devices']=[{'index':i,'name':torch.cuda.get_device_name(i),
                           'properties':str(torch.cuda.get_device_properties(i))} for i in range(torch.cuda.device_count())]
        index = next(i for i in range(torch.cuda.device_count()) if '7800 XT' in torch.cuda.get_device_name(i))
        device = f'cuda:{index}'
        a = torch.ones((256,256),device=device,dtype=torch.bfloat16)
        b = a@a
        torch.cuda.synchronize(index)
        report.update({'selected_device':device,'matmul_device':str(b.device),
                       'matmul_correct':bool(torch.all(b==256).item()),'dtype':str(b.dtype)})
report['elapsed_seconds'] = time.perf_counter()-started
path = DATA/'runs'/f'{sys.argv[1]}-inspection-{time.time_ns()}.json'
write_json(path,report)
print(json.dumps(report,indent=2),flush=True)
print(path,flush=True)
