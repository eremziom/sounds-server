"""B-02/B-03: image grounding and bounded, executed tools against engine contracts."""
import base64
import json
from pathlib import Path
import subprocess
import time
from kre00 import ROOT, fetch_json, sha256, write_json, process_memory, summarize


def dispatch(name, arguments, output):
    execution = subprocess.run(['node', str(ROOT / 'tools/artwork-creator/benchmark-tools.mjs')],
        input=json.dumps({'name': name, 'arguments': arguments, 'output': str(output)}),
        capture_output=True, text=True, encoding='utf-8', timeout=45)
    try:
        return json.loads(execution.stdout)
    except ValueError:
        raise RuntimeError(f'Tool adapter failed: {execution.stderr[:2000]}')


def iou(a, b):
    area = lambda r: max(0, r[2]-r[0])*max(0, r[3]-r[1])
    intersection = area([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])])
    union = area(a)+area(b)-intersection
    return intersection/union if union else 0


def tool(name, description, properties):
    return {'type': 'function', 'function': {'name': name, 'description': description,
            'parameters': {'type': 'object', 'properties': properties,
                           'required': list(properties), 'additionalProperties': False}}}


TOOLS = [
    tool('setBeaconPeriod', 'Zmień wyłącznie okres navigation-flash istniejącej lampki. Walidacja silnika, bez zmiany obrazu i tła.',
         {'periodSeconds': {'type': 'number'}}),
    tool('setFlightPath', 'Ustaw layer.travel wszystkich trzech części samolotu. Obsługuje bezier/spline, nie pole arc. Punkty są przesunięciami od (0,0).',
         {'travel': {'type': 'object', 'properties': {
             'startSeconds': {'type': 'number'}, 'durationSeconds': {'type': 'number'},
             'path': {'type': 'object', 'properties': {'kind': {'type': 'string', 'enum': ['bezier']},
                 'segments': {'type': 'array', 'items': {'type': 'object', 'properties': {
                     key: {'type': 'object', 'properties': {'x': {'type': 'number'}, 'y': {'type': 'number'}},
                           'required': ['x','y'], 'additionalProperties': False} for key in ['control1','control2','to']},
                     'required': ['control1','control2','to'], 'additionalProperties': False}}},
                 'required': ['kind','segments'], 'additionalProperties': False},
             'easing': {'type': 'string', 'enum': ['linear','ease-in','ease-out','ease-in-out']},
             'orientToPath': {'type': 'boolean'},
             'pivot': {'type': 'object', 'properties': {'x': {'type': 'number'}, 'y': {'type': 'number'}},
                       'required': ['x','y'], 'additionalProperties': False}},
             'required': ['startSeconds','durationSeconds','path','easing','orientToPath','pivot'],
             'additionalProperties': False}}),
    tool('refineMask', 'Wyzeruj prostokąt tylko w kopii maski front-wheel-test. rectangle=[left,top,right,bottom], piksele 1600x900. Nie zmienia innych plików.',
         {'maskId': {'type': 'string', 'enum': ['front-wheel-test']},
          'rectangle': {'type': 'array', 'items': {'type': 'integer'}, 'minItems': 4, 'maxItems': 4}}),
    tool('reportUnsupported', 'Zarejestruj brak obsługi efektu. Zwraca błąd, nie generuje kodu i nie modyfikuje sceny.',
         {'effect': {'type': 'string'}}),
]

CASES = [
    ('period', 'Ustaw błysk lampki samolotu co 5 sekund. Nie zmieniaj tła.', 'setBeaconPeriod'),
    ('preserve', 'Nie zmieniaj tła ani żadnych obrazów; zmień tylko okres lampki samolotu na 5 sekund.', 'setBeaconPeriod'),
    ('mask', 'Popraw tylko maskę front-wheel-test: usuń błędny prostokąt [40,40,100,100]. Pozostałe piksele i tło zachowaj.', 'refineMask'),
    ('arc', 'Ustaw lot samolotu po łuku: start 30 s, czas 120 s, Bezier control1=(400,-220), control2=(1200,160), to=(1700,0), ease-in-out, orientToPath=true, pivot=(1646.4,432). Zachowaj wspólny ruch trzech części i tło.', 'setFlightPath'),
    ('retry', 'To próba walidacji: najpierw rzeczywiście spróbuj ustawić okres lampki 0 sekund. Jeśli walidator odrzuci, popraw okres na 5 sekund i ponów narzędzie. Nie deklaruj sukcesu przed wynikiem narzędzia.', 'setBeaconPeriod'),
    ('unsupported', 'Dodaj smugę akumulowaną po historii zakrzywionego lotu i wygeneruj nowy shader silnika. Jeśli brak takiej funkcji, zarejestruj ograniczenie przez reportUnsupported i wyjaśnij brak wykonania.', 'reportUnsupported'),
]


def run_suite(base, output, runs, max_tokens, pid):
    fixture = output / 'fixture'
    before = dispatch('fingerprint', {}, fixture)
    info = dispatch('visionFixture', {}, fixture)
    if info.get('ok') is False:
        raise RuntimeError(info['error'])
    write_json(fixture / 'ground-truth.json', info | {
        'vehicleBoxApproximate': [135/1600, 350/900, 1470/1600, 835/900],
        'vehicleGroundTruth': 'Manual approximate extent after visual source inspection; not pixel segmentation'})
    records = []
    for index in range(runs):
        for kind in ['vehicle', 'defect', 'defect-hint']:
            image_path = ROOT / 'apps/ui/public/infinite-zoom/samples/digital-grid/plate.png' if kind == 'vehicle' else fixture / 'mask-overlay.png'
            question = ('Wskaż cały motocykl na pierwszym planie.' if kind == 'vehicle' else
                'To obraz z czerwoną nakładką maski przedniego koła. Wskaż błędny, odłączony prostokątny fragment maski poza motocyklem. Nie wskazuj koła jako błędu.')
            if kind == 'defect-hint':
                question += ' Wskazówka użytkownika: błąd jest w lewym górnym rogu obrazu; wybierz jego dokładny prostokąt, nie całą ćwiartkę.'
            encoded = base64.b64encode(image_path.read_bytes()).decode('ascii')
            request = {'model': 'local', 'seed': 200+index, 'temperature': .1, 'max_tokens': 500,
                'chat_template_kwargs': {'enable_thinking': False},
                'response_format': {'type': 'json_schema', 'json_schema': {'name': 'grounding', 'strict': True,
                    'schema': {'type':'object','properties': {
                        'box': {'type':'array','items':{'type':'integer','minimum':0,'maximum':1000},'minItems':4,'maxItems':4},
                        'problem': {'type':'string'}}, 'required':['box','problem'],'additionalProperties':False}}},
                'messages': [{'role': 'user', 'content': [
                    {'type': 'text', 'text': question + ' Zwróć obiekt JSON {"box":[left,top,right,bottom],"problem":"opis"}. Współrzędne całkowite 0..1000, początek lewy górny róg, 1000 oznacza prawą/dolną krawędź.'},
                    {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,'+encoded}}]}]}
            tick = time.perf_counter()
            response = fetch_json(base+'/v1/chat/completions', request, timeout=300)
            seconds = time.perf_counter()-tick
            # Keep reproducible source/hash, not a duplicated megabyte-sized base64 payload.
            request['messages'][0]['content'][1]['image_url']['url'] = str(image_path.relative_to(ROOT))
            record = {'id': 'B-02', 'kind': kind, 'index': index, 'request': request,
                      'image_sha256': sha256(image_path), 'response': response, 'request_seconds': seconds,
                      'process_memory': process_memory(pid), 'coordinate_system': 'integer-0-1000',
                      'assistance': 'explicit top-left location hint' if kind=='defect-hint' else 'none'}
            try:
                text = response['choices'][0]['message']['content'].strip()
                if text.startswith('```'):
                    text = text.split('\n',1)[1].rsplit('```',1)[0]
                parsed = json.loads(text)
                box = [value/1000 for value in parsed['box']]
                annotation = dispatch('annotate', {'file': 'plate.png' if kind == 'vehicle' else 'mask-overlay.png', 'boxes': [box]}, output / f'B-02-{kind}-{index}')
                if annotation.get('ok') is False:
                    raise ValueError(annotation['error'])
                reference = [135/1600,350/900,1470/1600,835/900] if kind == 'vehicle' else info['defectNormalized']
                record.update({'box_model': parsed['box'], 'box': box, 'reference': reference, 'iou': iou(box, reference), 'annotation': annotation})
            except (KeyError, ValueError, TypeError) as error:
                record['parse_error'] = str(error)
            write_json(output/f'B-02-{kind}-{index}.json', record)
            records.append(record)
            print(f'B-02 {kind} {index+1}: {seconds:.3f}s, IoU={record.get("iou")}', flush=True)
    for index in range(runs):
        for case_id, prompt, expected_tool in CASES:
            messages = [{'role': 'system', 'content':
                'Jesteś operatorem lokalnej próby KRE-00. Dostępne narzędzia faktycznie wykonuje kod. '
                'Nie generuj kodu. Wybierz właściwą funkcję; nie potwierdzaj wykonania przed ok:true. '
                'Błędy walidacji są wiążące. Nieobsługiwany efekt pozostaje niewykonany. '
                'Kopie mają istniejący schemat 2; początkowy okres lampki w kopii to 6 s. Cała scena i audio są poza tą próbą. '
                'Po wykonaniu odpowiedz krótko po polsku. Maksymalnie 4 wywołania.'},
                {'role': 'user', 'content': prompt}]
            record = {'id': 'B-03', 'kind': case_id, 'index': index, 'expected_tool': expected_tool,
                      'turns': [], 'executions': []}
            tick = time.perf_counter()
            calls_count = 0
            for turn in range(5):
                request = {'model': 'local', 'seed': 300+index, 'temperature': .1,
                    'max_tokens': min(max_tokens,1200), 'messages': messages.copy(),
                    'chat_template_kwargs': {'enable_thinking': False}, 'tools': TOOLS, 'tool_choice': 'auto'}
                response = fetch_json(base+'/v1/chat/completions', request, timeout=300)
                record['turns'].append({'request': request, 'response': response})
                message = response['choices'][0]['message']
                messages.append(message)
                calls = message.get('tool_calls') or []
                if not calls:
                    record['final'] = message.get('content')
                    record['finish_reason'] = response['choices'][0]['finish_reason']
                    break
                if calls_count+len(calls)>4:
                    record['error'] = 'Tool call budget exceeded'
                    break
                for call in calls:
                    calls_count += 1
                    name = call['function']['name']
                    try:
                        arguments = json.loads(call['function']['arguments'])
                        if name not in {t['function']['name'] for t in TOOLS}:
                            raise ValueError('Unknown tool')
                        outcome = dispatch(name, arguments, output/f'B-03-{case_id}-{index}-call{calls_count}')
                    except (ValueError, TypeError) as error:
                        arguments = None
                        outcome = {'ok': False, 'error': str(error)}
                    record['executions'].append({'name': name, 'arguments': arguments, 'result': outcome})
                    messages.append({'role': 'tool', 'tool_call_id': call['id'], 'content': json.dumps(outcome)})
            record['request_seconds'] = time.perf_counter()-tick
            record['process_memory'] = process_memory(pid)
            write_json(output/f'B-03-{case_id}-{index}.json', record)
            records.append(record)
            print(f'B-03 {case_id} {index+1}: {len(record["executions"])} executed, {record["request_seconds"]:.3f}s', flush=True)
    after = dispatch('fingerprint', {}, fixture)
    write_json(output/'source-integrity.json', {'before': before, 'after': after, 'unchanged': before == after})
    return {'cases': records, 'source_assets_unchanged': before == after,
        'timing_by_case': {f'{r["id"]}-{r["kind"]}': summarize([c['request_seconds'] for c in records if c['id']==r['id'] and c['kind']==r['kind']]) for r in records}}
