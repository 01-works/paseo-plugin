# 저장소 헬퍼 한 개를 별도로 띄워 60초 측정한다. 완료 후 반드시 stdin EOF로 종료한다.
import json, resource, selectors, subprocess, time
before = resource.getrusage(resource.RUSAGE_CHILDREN)
child = subprocess.Popen(['bin/macmon-helper'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
child.stdin.write('procs on\n'); child.stdin.flush()
selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
started = time.monotonic(); samples = []
try:
    while time.monotonic() - started < 60:
        for key, _ in selector.select(timeout=min(2, max(0, 60 - (time.monotonic() - started)))):
            line = key.fileobj.readline()
            if not line: raise RuntimeError('helper exited')
            samples.append(json.loads(line))
finally:
    child.stdin.close(); child.wait(timeout=3); selector.close()
usage = resource.getrusage(resource.RUSAGE_CHILDREN)
elapsed = time.monotonic() - started
cpu = usage.ru_utime + usage.ru_stime - before.ru_utime - before.ru_stime
result = dict(seconds=elapsed, samples=len(samples), cpuSeconds=cpu, corePercent=cpu/elapsed*100,
              rssMiB=usage.ru_maxrss/1024**2, sampleIntervalsMs=[samples[i]['mono']-samples[i-1]['mono'] for i in range(1,len(samples))],
              diskReads=len(set(s['sys']['disk']['sampledAt'] for s in samples if s['sys']['disk'])),
              maxMembers=max(len(s['procs']['members']) if s['procs'] else 0 for s in samples))
with open('/tmp/mac-monitor-helper-cost.json','w') as file: json.dump(result,file,indent=2)
print(json.dumps(result))
