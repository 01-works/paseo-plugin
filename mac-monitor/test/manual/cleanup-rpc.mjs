// 로컬 설치의 계약·취소만 검사한다. 모델 호출이나 사용자 프로세스 종료는 하지 않는다.
import assert from 'node:assert/strict';
import { DaemonClient } from '../../node_modules/@getpaseo/client/dist/daemon-client.js';
import WebSocket from 'ws';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
const taskHome=process.env.PASEO_HOME??path.join(homedir(),'.paseo');
const client=new DaemonClient({url:'ws://127.0.0.1:6767/ws',clientId:'mac-monitor-cleanup-validation',clientType:'cli',appVersion:'0.10.2',
  localCredential:()=>readFileSync(path.join(taskHome,'local-credential'),'utf8').trim(),
  webSocketFactory:(url,options)=>new WebSocket(url,options?.protocols,{headers:options?.headers}),reconnect:{enabled:false},connectTimeoutMs:5000});
const rpc=(method,input)=>client.invokePluginRpc('mac-monitor',`mac-monitor.cleanup.${method}`,input);
let id;
try {
  await client.connect();const host=await client.invokePluginRpc('mac-monitor','mac-monitor.host.info',{});
  assert.equal(host.version,JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version);
  let snapshot;
  for(let attempt=0;attempt<20;attempt++) {
    snapshot=await client.invokePluginRpc('mac-monitor','mac-monitor.snapshot.get',{includeProcesses:false});
    if(snapshot.status==='ok')break;await wait(500);
  }
  assert.equal(snapshot?.status,'ok','reload 직후 첫 CPU 기준점 다음 고정 샘플이 필요합니다');
  const state=await rpc('start',{});id=state.id;assert.equal(state.phase,'observing');
  await assert.rejects(rpc('start',{}));
  assert.equal((await rpc('get',{id})).id,id);
  await assert.rejects(rpc('get',{id:'00000000-0000-4000-a000-000000000001'}));
  await assert.rejects(rpc('terminate',{id,targets:[]}));
  const denied=await rpc('terminate',{id,targets:[{pid:process.pid,start:'0'}]});assert.equal(denied.results[0].sent,false);
  assert.equal((await rpc('cancel',{id})).cancelled,true);assert.equal((await rpc('get',{id})).phase,'cancelled');id=undefined;
  const catalog=await client.getPluginCatalog(), installed=catalog.find(plugin=>plugin.id==='mac-monitor');assert.ok(installed);
  writeFileSync('/tmp/mac-monitor-installed-client.js',installed.clientBundle);
  const logs=await client.getPluginLogs('mac-monitor');
  console.log(JSON.stringify({result:`${host.version} 로컬 계약·동시 검사/잘못된 ID/선택 거절·취소 통과`,host,bundleBytes:Buffer.byteLength(installed.clientBundle),recentLogs:logs.slice(-6)}));
} finally { if(id)await rpc('cancel',{id}).catch(()=>{});await client.close(); }
