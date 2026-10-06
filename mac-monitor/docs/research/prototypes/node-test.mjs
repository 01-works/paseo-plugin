import os from 'node:os';
import { execFileSync, execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const G = x => (x / 2**30).toFixed(2);
console.log('os.freemem', G(os.freemem()), 'GiB; process.availableMemory', G(process.availableMemory?.() ?? 0), 'os.totalmem', G(os.totalmem()));
let t=performance.now(); for (let i=0;i<1000;i++) os.freemem(); console.log('os.freemem() cost us', ((performance.now()-t)).toFixed(1)/1000*1000);
t=performance.now(); let c; for (let i=0;i<1000;i++) c=os.cpus(); console.log('os.cpus() cost us', ((performance.now()-t)*1000/1000).toFixed(1), 'ncpu', c.length);
const sum = cs => cs.reduce((a,c)=>{for(const k in c.times)a[k]+=c.times[k];return a},{user:0,nice:0,sys:0,idle:0,irq:0});
const a=sum(os.cpus()); await new Promise(r=>setTimeout(r,2000)); const b=sum(os.cpus());
const d={}; let tot=0; for(const k in a){d[k]=b[k]-a[k]; tot+=d[k];}
console.log('os.cpus 2s delta %: user', (100*d.user/tot).toFixed(1), 'sys', (100*d.sys/tot).toFixed(1), 'idle', (100*d.idle/tot).toFixed(1), 'nice', (100*d.nice/tot).toFixed(1), 'tot ms', tot);
t=performance.now(); for (let i=0;i<20;i++){ execFileSync('/usr/bin/vm_stat'); execFileSync('/usr/sbin/sysctl',['-n','vm.swapusage','kern.memorystatus_vm_pressure_level']); }
console.log('spawn vm_stat+sysctl (sync) ms per sample', ((performance.now()-t)/20).toFixed(2));
t=performance.now(); for (let i=0;i<20;i++) execFileSync('./macmon',['0','1']);
console.log('spawn one-shot macmon (incl. full proc scan) ms', ((performance.now()-t)/20).toFixed(2));
const ru=process.resourceUsage(); console.log('node self user+sys ms', (ru.userCPUTime+ru.systemCPUTime)/1000, 'maxRSS KB', ru.maxRSS);
