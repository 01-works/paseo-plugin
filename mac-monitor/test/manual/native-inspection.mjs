// 요청 전후의 네이티브 관찰·실행 정보·고정 간격을 확인한다. 종료/모델 요청은 하지 않는다.
import assert from 'node:assert/strict';
import { spawnSource } from '../../server/helper-process.ts';
import { inspectionSchema } from '../../shared/cleanup.ts';
const samples = []; let current;
const source = spawnSource(new URL('../../bin/macmon-helper', import.meta.url).pathname, [], line => {
  current = JSON.parse(line); samples.push(current);
}, reason => { throw new Error(reason); });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => { const end=Date.now()+20_000;while(!predicate()){assert.ok(Date.now()<end,'관찰 대기 시간 초과');await pause(50);} };
try {
  await until(()=>samples.length>=2); assert.equal(current.procs,null);
  source.setInspection(true);
  await until(()=>samples.filter(s=>s.procs?.inspection && s.procs.ready).length>=6);
  const observation = inspectionSchema.parse(current.procs.inspection);
  assert.ok(observation.entries.length<=128);
  for(const p of observation.entries) { assert.ok(p.ageSeconds>=1800);assert.ok(p.memoryBytes>=8*1024**2);assert.ok(p.cpuPercent===null||p.cpuPercent<=0.1); }
  let complete=0;
  for(const p of observation.entries.slice(0,16)) { const m=await source.inspect(p.pid,p.start);if(m.args){complete++;assert.equal(typeof m.cpuPercent,'number');} }
  source.setInspection(false); await until(()=>current.procs===null);
  const intervals=samples.slice(1).map((s,i)=>s.mono-samples[i].mono);intervals.forEach(t=>assert.ok(t>1850&&t<2150));
  console.log(JSON.stringify({result:'관찰 요청 전후 스캔 off, 실행 정보 읽기, 2초 간격 유지',entries:observation.entries.length,completeMetadata:complete,truncated:observation.truncated,intervals}));
} finally { await source.close(); }
