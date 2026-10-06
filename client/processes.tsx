import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { processListRpc, terminateRpc, type ProcessInfo } from '../shared/contracts';
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text numberOfLines={1} style={{ color: c.foreground, flexShrink: 1, fontWeight: '600' }}>{group}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="상위 앱으로 돌아가기" onPress={onBack}>
        <Text style={{ color: c.foregroundMuted }}>뒤로</Text>
      </Pressable>
    </View>
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
            <Text style={{ color: c.foreground }}>{pending ? '요청 중' : '종료'}</Text>
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
