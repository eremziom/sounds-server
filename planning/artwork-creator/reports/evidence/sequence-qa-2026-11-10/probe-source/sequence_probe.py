"""B-09 fixed-pilot queue and sequential execution. Not a production coordinator."""
import json
from pathlib import Path
import subprocess
import sys
import time
import shutil
from kre00 import ROOT,DATA,fetch_json,write_json,sha256,summarize
from image_environment import child_environment


def plan_suite(base,output,runs,pid):
    tools=[{'type':'function','function':{'name':'queuePilot','description':'Kolejkuj istniejący brief bramy/drona: generacja -> SAM -> maska materiału -> LaMa. Zwraca stan queued, nie gotowy artwork.',
        'parameters':{'type':'object','properties':{'seed':{'type':'integer','enum':[500]},'width':{'type':'integer','enum':[1024]},'height':{'type':'integer','enum':[576]}},
        'required':['seed','width','height'],'additionalProperties':False}}}]
    cases=[]
    for index in range(runs):
        request={'model':'local','seed':700+index,'temperature':.1,'max_tokens':500,
            'chat_template_kwargs':{'enable_thinking':False},'tools':tools,'tool_choice':'auto',
            'messages':[{'role':'system','content':'Wywołuj tylko dostępne narzędzia. Stan queued oznacza przyjęty plan, nie wykonane obrazy. Nie deklaruj sukcesu generacji bez artefaktów.'},
                        {'role':'user','content':'Zleć stały pilot KRE-00 według gotowego briefu bramy i drona: seed 500, 1024x576. Sekwencja ma wygenerować draft, wydzielić drona SAM, przygotować osobną maskę świateł i uzupełnić tło LaMa. Maski wymagają późniejszej oceny. Nie zmieniaj muzyki ani scen aplikacji.'}]}
        tick=time.perf_counter();response=fetch_json(base+'/v1/chat/completions',request,timeout=120)
        calls=response['choices'][0]['message'].get('tool_calls') or []
        if len(calls)!=1 or calls[0]['function']['name']!='queuePilot':
            raise ValueError('LLM did not select the expected supported queue operation')
        arguments=json.loads(calls[0]['function']['arguments'])
        if arguments!={'seed':500,'width':1024,'height':576}:
            raise ValueError('Unsupported pilot configuration')
        job={'id':index,'state':'queued','arguments':arguments,'recipe':'fixed-gate-drone-v1',
             'selection_policy':'Manual reviewed point/box for this known seed; not free-form scene localization'}
        write_json(output/f'job-{index}.json',job)
        record={'id':'B-09-plan','index':index,'request':request,'response':response,
            'request_seconds':time.perf_counter()-tick,'tool_execution':{'name':'queuePilot','result':job}}
        write_json(output/f'plan-{index}.json',record);cases.append(record)
    return {'cases':cases,'queued_jobs':runs,'scope':'Fixed pilot queue, real model call and executed disk write; heavy workers run only after LLM unload'}


def worker(command,output,label,timeout=600):
    tick=time.perf_counter()
    with (output/f'{label}-worker.txt').open('x',encoding='utf-8') as log:
        result=subprocess.run(command,env=child_environment(),stdout=log,stderr=subprocess.STDOUT,
            timeout=timeout,creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
    record={'command':command,'exit_code':result.returncode,'wall_seconds':time.perf_counter()-tick}
    write_json(output/f'{label}-command.json',record)
    if result.returncode:
        raise RuntimeError(f'{label} failed; previous artifacts retained: {output}')
    return record


def execute(plans):
    plans=plans.resolve()
    if not plans.is_relative_to((DATA/'runs').resolve()):
        raise ValueError('Expected isolated plan run')
    jobs=[json.loads(p.read_text(encoding='utf-8')) for p in sorted(plans.glob('job-*.json'))]
    if len(jobs)<3:
        raise ValueError('Three queued comparable jobs required')
    out=DATA/'runs'/f'sequence-{time.time_ns()}';out.mkdir(parents=True)
    result={'plan_source':str(plans.relative_to(ROOT)),'jobs':[], 'scope':'Three fixed-seed pilot jobs; LLM plans batched first, then unloaded before heavy workers'}
    for index,job in enumerate(jobs):
        if job['arguments']!={'seed':500,'width':1024,'height':576}:
            raise ValueError('Untrusted plan parameters')
        directory=out/f'job-{index}';directory.mkdir();write_json(directory/'job.json',job)
        brief=ROOT/'tools/artwork-creator/klein-authoring-brief.md'
        shutil.copyfile(brief,directory/'authoring-brief.md')
        gpu=str(DATA/'venvs/torch-rocm721/Scripts/python.exe');cpu=str(DATA/'venvs/onnx/Scripts/python.exe')
        tick=time.perf_counter();stages=[]
        for stage in ['encode','single']:
            stages.append(worker([gpu,str(ROOT/'tools/artwork-creator/klein_probe.py'),stage,str(directory)],directory,stage))
        stages.append(worker([gpu,str(ROOT/'tools/artwork-creator/sequence_image_tools.py'),'segment',str(directory)],directory,'segment'))
        stages.append(worker([cpu,str(ROOT/'tools/artwork-creator/sequence_image_tools.py'),'fill',str(directory)],directory,'fill'))
        record={'job_id':index,'wall_seconds':time.perf_counter()-tick,'stages':stages,
                'artifacts':{p.name:sha256(p) for p in directory.glob('*.png')}}
        result['jobs'].append(record);write_json(directory/'completed.json',record)
        print(f'B-09 job {index+1}: {record["wall_seconds"]:.3f}s',flush=True)
    result['wall_summary']=summarize([j['wall_seconds'] for j in result['jobs']])
    write_json(out/'result.json',result);print(out,flush=True)


if __name__=='__main__':
    execute(Path(sys.argv[1]))
