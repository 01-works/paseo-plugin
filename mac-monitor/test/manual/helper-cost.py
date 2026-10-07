# 저장소 헬퍼 한 개를 별도로 띄워 60초 측정한다. 완료 후 반드시 stdin EOF로 종료한다.
import json, resource, selectors, subprocess, time, argparse
parser = argparse.ArgumentParser()
parser.add_argument('--inspection', action='store_true', help='수동 검사 관찰을 켠 헬퍼만 측정; AI 호출 없음')
parser.add_argument('--seconds', type=float, default=60)
parser.add_argument('--history', action='store_true', help='1분 숫자 이력 수집')
parser.add_argument('--system-only', action='store_true', help='2초 앱 목록 스캔을 켜지 않음')
parser.add_argument('--output', help='측정 결과 JSON 경로')
options = parser.parse_args()
before = resource.getrusage(resource.RUSAGE_CHILDREN)
child = subprocess.Popen(['bin/macmon-helper'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
if not options.system_only:
    child.stdin.write('procs on\n'); child.stdin.flush()
if options.history:
    child.stdin.write('history on\n'); child.stdin.flush()
if options.inspection:
    child.stdin.write('inspection on\n'); child.stdin.flush()
selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
started = time.monotonic(); samples = []
try:
    while time.monotonic() - started < options.seconds:
        for key, _ in selector.select(timeout=min(2, max(0, options.seconds - (time.monotonic() - started)))):
            line = key.fileobj.readline()
            if not line: raise RuntimeError('helper exited')
            samples.append(json.loads(line))
finally:
    child.stdin.close(); child.wait(timeout=3); selector.close()
usage = resource.getrusage(resource.RUSAGE_CHILDREN)
elapsed = time.monotonic() - started
cpu = usage.ru_utime + usage.ru_stime - before.ru_utime - before.ru_stime
history = [s for s in samples if s.get('history') is not None]
result = dict(inspection=options.inspection, history=options.history, systemOnly=options.system_only, seconds=elapsed, samples=len(samples), cpuSeconds=cpu, corePercent=cpu/elapsed*100,
              rssMiB=usage.ru_maxrss/1024**2, sampleIntervalsMs=[samples[i]['mono']-samples[i-1]['mono'] for i in range(1,len(samples))],
              diskReads=len(set(s['sys']['disk']['sampledAt'] for s in samples if s['sys']['disk'])),
              maxMembers=max(len(s['procs']['members']) if s['procs'] else 0 for s in samples),
              maxInspected=max(len(s['procs'].get('inspection',{}).get('entries',[])) if s['procs'] else 0 for s in samples),
              historyFrames=len(history), maxHistoryEntries=max((len(s['history']['entries']) for s in history), default=0),
              historyIntervalsMs=[history[i]['mono']-history[i-1]['mono'] for i in range(1,len(history))],
              errors=sorted(set(e for s in samples for e in s['errors'])))
with open(options.output or ('/tmp/mac-monitor-inspection-cost.json' if options.inspection else '/tmp/mac-monitor-helper-cost.json'),'w') as file: json.dump(result,file,indent=2)
print(json.dumps(result))
