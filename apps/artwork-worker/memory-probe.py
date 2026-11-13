"""RAM/commit headroom and adapter-specific WDDM usage; never loads Torch or allocates GPU memory."""
import ctypes as c
from ctypes import wintypes as w
import importlib.util
import json
import os
from pathlib import Path
import subprocess

if os.name != 'nt':
    raise RuntimeError('This admission profile requires Windows WDDM')
class MemoryStatus(c.Structure):
    _fields_ = [('length',w.DWORD),('load',w.DWORD)]+[(name,c.c_ulonglong) for name in
        ['totalPhysical','availablePhysical','totalPageFile','availablePageFile','totalVirtual','availableVirtual','extended']]
status=MemoryStatus(); status.length=c.sizeof(status)
if not c.windll.kernel32.GlobalMemoryStatusEx(c.byref(status)):
    raise RuntimeError('Memory status unavailable')
source = Path(__file__).resolve().parents[2]/'tools/artwork-creator/adapter-inventory.py'
spec = importlib.util.spec_from_file_location('dxgi_inventory',source)
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
adapters=[a for a in module.adapters() if '7800 XT' in a['name']]
if len(adapters)!=1: raise RuntimeError('Expected exactly one RX 7800 XT')
adapter=adapters[0]
probe=subprocess.run(['powershell','-NoProfile','-Command',
    '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory | Select-Object Name,DedicatedUsage,SharedUsage) | ConvertTo-Json -Compress'],
    capture_output=True,text=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
if probe.returncode: raise RuntimeError('WDDM counters unavailable')
counters=json.loads(probe.stdout)
if isinstance(counters,dict): counters=[counters]
matched=[a for a in counters if adapter['counter_key'].lower() in a['Name'].lower()]
if not matched: raise RuntimeError('Adapter WDDM counter missing')
used=sum(int(a['DedicatedUsage']) for a in matched)
print(json.dumps({'ramAvailableBytes':status.availablePhysical,'commitAvailableBytes':status.availablePageFile,
    'vramAvailableBytes':max(0,adapter['dedicated_video_bytes']-used),'adapter':adapter['name'],
    'adapterKey':adapter['counter_key'],'dedicatedUsedBytes':used,'sharedUsedBytes':sum(int(a['SharedUsage']) for a in matched)}))
