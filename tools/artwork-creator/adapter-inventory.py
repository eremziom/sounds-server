"""Read DXGI adapter capacity and LUID for WDDM-counter attribution. No GPU allocation."""
import ctypes as c
from ctypes import wintypes as w
import json
import uuid


class Guid(c.Structure):
    _fields_=[('bytes',c.c_ubyte*16)]


class Luid(c.Structure):
    _fields_=[('low',w.DWORD),('high',w.LONG)]


class Description(c.Structure):
    _fields_=[('name',w.WCHAR*128),('vendor',w.UINT),('device',w.UINT),('subsystem',w.UINT),('revision',w.UINT),
              ('dedicated_video_bytes',c.c_size_t),('dedicated_system_bytes',c.c_size_t),('shared_system_bytes',c.c_size_t),
              ('luid',Luid),('flags',w.UINT)]


def method(pointer,index,result,*args):
    address=c.cast(pointer,c.POINTER(c.POINTER(c.c_void_p))).contents[index]
    return c.WINFUNCTYPE(result,c.c_void_p,*args)(address)


def adapters():
    dxgi=c.WinDLL('dxgi')
    create=dxgi.CreateDXGIFactory1
    create.argtypes=[c.POINTER(Guid),c.POINTER(c.c_void_p)];create.restype=c.c_long
    iid=Guid((c.c_ubyte*16).from_buffer_copy(uuid.UUID('770aae78-f26f-4dba-a829-253c83d1b387').bytes_le))
    factory=c.c_void_p()
    if create(c.byref(iid),c.byref(factory))!=0:
        raise RuntimeError('Cannot enumerate DXGI adapters')
    found=[]
    try:
        for index in range(16):
            adapter=c.c_void_p()
            status=method(factory,12,c.c_long,w.UINT,c.POINTER(c.c_void_p))(factory,index,c.byref(adapter))
            if status!=0:
                break
            try:
                description=Description()
                if method(adapter,10,c.c_long,c.POINTER(Description))(adapter,c.byref(description))!=0:
                    raise RuntimeError('Cannot read DXGI adapter description')
                key=f'luid_0x{description.luid.high & 0xffffffff:08x}_0x{description.luid.low:08x}'
                found.append({'name':description.name,'counter_key':key,'dedicated_video_bytes':description.dedicated_video_bytes,
                              'shared_system_bytes':description.shared_system_bytes,'vendor_id':description.vendor,'device_id':description.device})
            finally:
                method(adapter,2,w.ULONG)(adapter)
    finally:
        method(factory,2,w.ULONG)(factory)
    return found


if __name__=='__main__':
    print(json.dumps(adapters(),indent=2))
