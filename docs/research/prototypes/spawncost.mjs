import { execFileSync } from 'node:child_process';
const mode=process.argv[2]; const N=50;
for (let i=0;i<N;i++){ if(mode==='vmstat'){ execFileSync('/usr/bin/vm_stat'); execFileSync('/usr/sbin/sysctl',['-n','vm.swapusage','kern.memorystatus_vm_pressure_level']); } else if(mode==='oneshot'){ execFileSync('./macmon',['0','1']); } else if (mode==='ps') { execFileSync('/bin/ps',['-axo','pid,rss,%cpu,comm'],{maxBuffer:1<<24}); } }
