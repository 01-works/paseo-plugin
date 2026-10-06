// 실제 플러그인 UI를 React Native Web + React portal로 실행한다.
// Paseo 0.10.2의 action pending → 아이콘 교체 동작을 재현한다.
// 임시 의존성: npm install --prefix /tmp/mac-monitor-click-check --no-audit --no-fund react@19.1.0 react-dom@19.1.0 react-native-web@0.21.0 jsdom@26.1.0
// node test/manual/click-preview.mjs --verify 로 DOM 실행 회귀 검사. 실제 Paseo/모바일 검증은 별도다.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const out = '/tmp/mac-monitor-click-check';
await mkdir(out, { recursive: true });
await build({
  stdin: { contents: `
    import React, { useEffect, useState, useSyncExternalStore } from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { Pressable, Text, View } from 'react-native';
    import { contributePills } from './client/pill';
    import { configureRequester } from './client/data';
    import { emptySnapshot } from './shared/compute';
    import { stats, bump, subscribe } from 'click-stats';
    const snapshot = { ...emptySnapshot('native'), status:'ok', seq:1, sampledAt:Date.now(),
      cpu:{total:23,user:18,system:5}, pressure:'normal', memoryLevel:40,
      memory:{total:16*1024**3,used:12*1024**3,app:6*1024**3,wired:3*1024**3,compressed:3*1024**3,cached:1024**3},
      swap:{total:0,used:0}, processesStatus:'ok', processes:{ready:true, sampledAt:Date.now(),coreCount:10,
      excludedRoot:2,excludedPermission:1,otherErrors:0,
      topCpu:[{name:'codex',processCount:2,cpuPercent:20,memoryBytes:1024**3}],
      topMemory:[{name:'Google Chrome',processCount:12,cpuPercent:4,memoryBytes:3*1024**3}]}};
    globalThis.clickRead = async input => { if(input.includeProcesses) bump('reads'); return { ...snapshot, sampledAt:Date.now() }; };
    configureRequester(globalThis.clickRead);
    let button, notify = () => {};
    contributePills({paseo:{agents:{list:async()=>({subscription:{subscribe:callbacks=>callbacks.snapshot({entries:[{agent:{id:'a',workspaceId:'w'}}]})}})}},
      addComposerPill:input=>{button=input.button;notify();return{update:patch=>{button={...button,...patch};notify()},remove:()=>{}}}});
    const props={theme:{colors:{foreground:'#eee',foregroundMuted:'#aaa',surface0:'#111',surface1:'#222',surface2:'#333',border:'#444',accent:'#aaf',statusSuccess:'#0a0',statusWarning:'#aa0',statusDanger:'#a00'}},
      host:{id:'h',label:'Test Mac'},layout:{compact:false,platform:'web'},size:14,color:'#aaa'};
    function App(){
      const [,render]=useState(0),[pending,setPending]=useState(false);
      useEffect(()=>{notify=()=>render(v=>v+1);notify();return()=>{notify=()=>{}}},[]);
      const counts=useSyncExternalStore(subscribe,stats);
      const Icon=button?.icon;
      const press=async()=>{if(pending)return;bump('actions');setPending(true);await button.behavior.onPress();await new Promise(r=>setTimeout(r,30));setPending(false)};
      return <View style={{padding:24,gap:12}}>
        <Text testID="counts" selectable>actions={counts.actions} mounts={counts.mounts} reads={counts.reads} copies={counts.copies}</Text>
        {button?<Pressable accessibilityRole="button" accessibilityLabel="모니터 열기" onPress={press} disabled={pending} style={{alignSelf:'flex-start',padding:12,backgroundColor:'#ddd'}}>
          {pending?<Text>읽는 중</Text>:<View pointerEvents="none"><Icon {...props}/></View>}<Text>{button.label}</Text>
        </Pressable>:null}
        <Text>unguarded 모드에서는 기존 클릭 전달 문제를 재현합니다.</Text>
      </View>;
    }
    createRoot(document.getElementById('app')).render(<QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider>);
  `, resolveDir: process.cwd(), loader: 'tsx' },
  outfile: out+'/click.js', bundle:true, platform:'browser', format:'iife',
  nodePaths:[out+'/node_modules'], alias:{react:out+'/node_modules/react', 'react-dom':out+'/node_modules/react-dom'},
  plugins:[{name:'click-runtime',setup(builder){
    builder.onResolve({filter:/^react-native$/},()=>({path:'native',namespace:'click'}));
    builder.onResolve({filter:/^click-stats$/},()=>({path:'stats',namespace:'click'}));
    builder.onResolve({filter:/^@getpaseo\/plugin\/client(?:\/react-native)?$/},args=>({path:args.path.endsWith('/react-native')?'modal':'sdk',namespace:'click'}));
    builder.onLoad({filter:/.*/,namespace:'click'},args=>({loader:'tsx',resolveDir:process.cwd(),contents:
      args.path==='stats'? 
        "let value={actions:0,mounts:0,reads:0,copies:0};const listeners=new Set();export const stats=()=>value;export function bump(key){value={...value,[key]:value[key]+1};for(const l of listeners)l()}export function subscribe(l){listeners.add(l);return()=>listeners.delete(l)}":
      args.path==='native'?
        "import React from 'react';import{Pressable as NativePressable,View}from'react-native-web';export{Text,View}from'react-native-web';export function Pressable(props){return location.search.includes('unguarded')&&props.accessible===false&&props.focusable===false?<View>{props.children}</View>:<NativePressable {...props}/>}":
      args.path==='sdk'?
        "const host=async()=>({hostname:'Test Mac'});const snapshot=input=>globalThis.clickRead(input);export function useRpc(contract){return contract.name==='mac-monitor.host.info'?host:snapshot}":
        "import React,{useEffect}from'react';import{createPortal}from'react-dom';import{Pressable,View,Text,ScrollView}from'react-native-web';import{bump}from'click-stats';export{ScrollView};export async function copyText(){bump('copies')}function Root({open,onOpenChange,children}){return open?createPortal(<View style={{position:'absolute',top:90,left:220,width:520,padding:24,backgroundColor:'#111',gap:12}}><Pressable accessibilityRole='button' accessibilityLabel='닫기' onPress={()=>onOpenChange(false)}><Text style={{color:'#eee'}}>닫기</Text></Pressable>{children}</View>,document.getElementById('overlay')):null}function Content({children}){useEffect(()=>{bump('mounts')},[]);return <View>{children}</View>}export const Modal=Object.assign(Root,{Content});"
    }));
  }}],
});
await writeFile(out+'/click.html','<!doctype html><meta charset="utf-8"><title>mac-monitor 클릭 회귀 검증</title><div id="app"></div><div id="overlay"></div><script src="click.js"></script>');
console.log(out+'/click.html');
if (process.argv.includes('--verify')) {
  const { JSDOM } = createRequire(out+'/package.json')('jsdom');
  const code = await readFile(out+'/click.js', 'utf8');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async check => {
    for (let i = 0; i < 200; i++) { if (check()) return; await delay(10); }
    throw new Error('렌더 완료 시간 초과');
  };
  for (const legacy of [true, false]) {
    const dom = new JSDOM('<div id="app"></div><div id="overlay"></div><script>'+code+'</script>', {
      url:'http://localhost/click.html'+(legacy?'?unguarded':''), runScripts:'dangerously', pretendToBeVisual:true,
    });
    try {
      const document = dom.window.document;
      const button = name => document.querySelector('[role="button"][aria-label="'+name+'"]');
      const counts = () => {
        const text = document.querySelector('[data-testid="counts"]').textContent;
        return Object.fromEntries([...text.matchAll(/(actions|mounts|reads|copies)=(\d+)/g)].map(match=>[match[1],Number(match[2])]));
      };
      await until(()=>button('모니터 열기'));
      button('모니터 열기').click();
      await until(()=>counts().mounts===1 && counts().reads===1);
      await delay(800); // 공유 요청의 700ms 캐시 구간 밖에서 클릭한다.
      const before = counts();
      [...document.getElementById('overlay').querySelectorAll('div')].find(node=>node.textContent==='CPU').click();
      if (legacy) {
        await until(()=>counts().mounts===2 && counts().reads===2);
        assert.equal(counts().actions,2);
        console.log(JSON.stringify({mode:'기존 경로',before,after:counts(),result:'본문 클릭 → pill 재실행·상세 remount·RPC 재요청 재현'}));
      } else {
        await delay(100);
        assert.deepEqual(counts(),before);
        const tabs = [...document.querySelectorAll('[role="button"]')].filter(node=>(node.getAttribute('aria-label')??'').endsWith('순위로 정렬'));
        assert.equal(tabs.length,2);
        tabs[1].click();
        await delay(100); assert.deepEqual(counts(),before);
        assert.ok(document.getElementById('overlay').textContent.includes('Google Chrome'));
        assert.ok(!button('모니터 값 복사'));
        assert.ok(!button('모니터 새로고침'));
        assert.ok(!document.getElementById('overlay').textContent.includes('샘플'));
        await until(()=>counts().reads>=2);
        assert.equal(counts().actions,1); assert.equal(counts().mounts,1);
        button('닫기').click();
        await delay(100);
        assert.equal(document.getElementById('overlay').textContent,'');
        assert.equal(counts().actions,1);
        const closedReads=counts().reads; await delay(2200); assert.equal(counts().reads,closedReads);
        console.log(JSON.stringify({mode:'수정 경로',before,after:counts(),result:'본문·정렬·닫기에 재실행/remount 없음; 자동 갱신·닫은 뒤 중단 확인'}));
      }
    } finally { dom.window.close(); }
  }
}
