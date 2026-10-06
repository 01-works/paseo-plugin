import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { processListRpc, terminateRpc, terminateGroupRpc, type ProcessInfo } from '../shared/contracts';
import { useStableQuery } from './data';
import { appPercent, gib } from './format';
import { Card, type Theme } from './visuals';

export function ProcessPanel({ group, theme, onBack }: { group: string; theme: Theme; onBack: () => void }) {
  const c = theme.colors;
  const listRpc = useRpc(processListRpc);
  const terminate = useRpc(terminateRpc);
  const query = useStableQuery({ queryKey: ['mac-monitor', 'processes', group], queryFn: () => listRpc({ group }), refreshInterval: 2000 });
  const [chosen, choose] = useState<ProcessInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const ready = !query.error && query.data?.status === 'ok';
  const entries = query.data?.entries ?? [];
  const send = async () => {
    if (!chosen || pending) return;
    setPending(true); setMessage('');
    try {
      const result = await terminate({ pid: chosen.pid, start: chosen.start, group });
      setMessage(result.sent ? `PID ${chosen.pid}에 종료 요청을 보냈습니다.` : result.error ?? '종료하지 못했습니다.');
      choose(null); void query.refetch();
    } catch (error) { setMessage(`종료 실패: ${String(error)}`); }
    finally { setPending(false); }
  };
  return <Card theme={theme}>
    <ProcessHeader group={group} theme={theme} onBack={onBack} disabled={pending} />
    <ScrollView accessibilityLabel="개별 프로세스 목록" nestedScrollEnabled showsVerticalScrollIndicator
      style={{ height: 320, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, flexGrow: 1 }}>
      {query.error ? <Text selectable style={{ color: c.foregroundMuted }}>연결 오류: {query.error.message}</Text> : null}
      {message ? <Text selectable style={{ color: c.foregroundMuted }}>{message}</Text> : null}
      {chosen ? <View style={{ padding: 12, gap: 8, borderRadius: 6, backgroundColor: c.surface2 }}>
        <Text selectable style={{ color: c.foreground }}>PID {chosen.pid} · {chosen.name} 종료</Text>
        <Text style={{ color: c.foregroundMuted }}>저장하지 않은 작업을 잃을 수 있습니다.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
          <Pressable accessibilityRole="button" disabled={pending} onPress={() => choose(null)}><Text style={{ color: c.foreground }}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`PID ${chosen.pid} 종료 확인`} disabled={pending} onPress={() => void send()}>
            <Text style={{ color: pending ? c.foregroundMuted : c.statusDanger }}>{pending ? '요청 중' : '종료'}</Text>
          </Pressable>
        </View>
      </View> : null}
      {!entries.length ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.foregroundMuted }}>{ready ? '현재 상위 목록에 없거나 종료된 앱입니다.' : query.data?.status === 'unsupported' ? '프로세스 목록 미지원' : query.error ? '목록 확인 불가' : '프로세스 확인 중'}</Text>
      </View> : null}
      {entries.map(p => <View key={`${p.pid}:${p.start}`} style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border }}>
        <Text selectable numberOfLines={1} style={{ color: c.foreground }}>{p.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><Text selectable style={{ color: c.foregroundMuted }}>PID {p.pid}</Text></View>
          <Text selectable style={{ color: c.foregroundMuted }}>{appPercent(p.cpuPercent)}</Text>
          <Text selectable style={{ color: c.foregroundMuted }}>{gib(p.memoryBytes)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`PID ${p.pid} 종료 선택`} disabled={!ready || pending}
            onPress={() => { choose(p); setMessage(''); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: c.surface2 }}>
            <Text style={{ color: c.foreground }}>종료</Text>
          </Pressable>
        </View>
      </View>)}
    </ScrollView>
  </Card>;
}

function ProcessHeader({ group, theme, onBack, disabled = false }: { group: string; theme: Theme; onBack: () => void; disabled?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="상위 앱으로 돌아가기" disabled={disabled} onPress={onBack}
      style={{ paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.foregroundMuted }}>‹ 뒤로</Text>
    </Pressable>
    <Text numberOfLines={1} style={{ color: theme.colors.foreground, flex: 1, fontWeight: '600' }}>{group}</Text>
  </View>;
}

export function GroupTermination({ group, theme, onBack }: { group: string; theme: Theme; onBack: () => void }) {
  const c = theme.colors;
  const listRpc = useRpc(processListRpc);
  const terminate = useRpc(terminateGroupRpc);
  // 자동 갱신으로 확인 대상이 늘어나지 않도록 최초 결과를 고정한다.
  const query = useStableQuery({ queryKey: ['mac-monitor', 'terminate-group', group], queryFn: () => listRpc({ group }) });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ results: { pid: number; sent: boolean; error?: string }[] }>();
  const [error, setError] = useState('');
  const entries = query.data?.entries ?? [];
  const ready = !query.error && query.data?.status === 'ok' && entries.length > 0 && entries.length <= 4096;
  const send = async () => {
    if (!ready || pending || result) return;
    setPending(true); setError('');
    try { setResult(await terminate({ group, targets: entries.map(({ pid, start }) => ({ pid, start })) })); }
    catch (err) { setError(`종료 실패: ${String(err)}`); }
    finally { setPending(false); }
  };
  return <Card theme={theme}>
    <ProcessHeader group={group} theme={theme} onBack={onBack} disabled={pending} />
    <ScrollView accessibilityLabel="앱 전체 종료 확인" nestedScrollEnabled style={{ height: 320, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: 12 }}>
      {result ? <>
        <Text style={{ color: c.foreground }}>종료 요청 {result.results.filter(p => p.sent).length}개 · 보내지 못함 {result.results.filter(p => !p.sent).length}개</Text>
        {result.results.filter(p => !p.sent).map(p => <Text key={p.pid} style={{ color: c.foregroundMuted }}>PID {p.pid} · {p.error ?? '종료하지 못했습니다.'}</Text>)}
      </> : <>
        <Text style={{ color: c.foreground, fontWeight: '600' }}>전체 종료{query.data ? ` · ${entries.length}개` : ''}</Text>
        <Text style={{ color: c.foregroundMuted }}>저장하지 않은 작업을 잃을 수 있습니다.</Text>
        <Text style={{ color: c.foregroundMuted }}>아래에 표시된 프로세스만 종료합니다.</Text>
        {query.error || error ? <Text style={{ color: c.foregroundMuted }}>{error || `목록 확인 실패: ${query.error?.message}`}</Text> : null}
        {!ready ? <Text style={{ color: c.foregroundMuted }}>{query.data ? '종료할 수 있는 최신 목록이 없습니다. 뒤로 가서 다시 확인하세요.' : '프로세스 확인 중'}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
          <Pressable accessibilityRole="button" disabled={pending} onPress={onBack}><Text style={{ color: c.foreground }}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${group} 전체 종료 확인`} disabled={!ready || pending} onPress={() => void send()}>
            <Text style={{ color: ready && !pending ? c.statusDanger : c.foregroundMuted }}>{pending ? '요청 중' : '전체 종료'}</Text>
          </Pressable>
        </View>
        {entries.map(p => <Text key={`${p.pid}:${p.start}`} numberOfLines={1} style={{ color: c.foregroundMuted }}>{p.name} · PID {p.pid}</Text>)}
      </>}
    </ScrollView>
  </Card>;
}
