import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { automationConfigureRpc, automationReportRpc, automationTargetRpc, type AutomationStatus } from '../shared/automation';
import { useStableQuery } from './data';
import { Card, type Theme } from './visuals';

export const automationLabels: Record<AutomationStatus['phase'], string> = {
  off: '꺼짐', idle: '감시', watching: '압력 지속', sampling: '추세 확인', reviewing: 'Luna 검토', cooldown: '대기', error: '확인 필요',
};
export function AutomationPanel({ theme, status, onBack }: { theme: Theme; status: AutomationStatus; onBack: () => void }) {
  const c = theme.colors;
  const get = useRpc(automationReportRpc), configure = useRpc(automationConfigureRpc), target = useRpc(automationTargetRpc);
  const query = useStableQuery({ queryKey: ['mac-monitor', 'automation'], queryFn: () => get({}), refreshInterval: 2000 });
  const [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const report = query.data;
  const toggle = async () => {
    if (!report || pending) return;
    setPending(true); setMessage('');
    try { await configure({ ...report.config, enabled: !report.config.enabled }); await query.refetch(); }
    catch { setMessage('설정을 저장하지 못했습니다.'); }
    finally { setPending(false); }
  };
  const remove = async (p: { pid: number; start: string; group: string }) => {
    if (pending) return;
    setPending(true); setMessage('');
    try { await target({ ...p, allow: false }); await query.refetch(); }
    catch { setMessage('허용을 해제하지 못했습니다.'); }
    finally { setPending(false); }
  };
  return <Card theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="모니터로 돌아가기" onPress={onBack} style={{ paddingVertical: 6 }}>
        <Text style={{ color: c.foregroundMuted }}>‹ 뒤로</Text>
      </Pressable>
      <Text style={{ color: c.foreground, flex: 1, fontWeight: '600' }}>자동 관리</Text>
      <Pressable accessibilityRole="switch" accessibilityLabel="메모리 자동 관리" accessibilityState={{ checked: report?.config.enabled ?? status.enabled, disabled: !report || pending }}
        disabled={!report || pending} onPress={() => void toggle()} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: c.surface2 }}>
        <Text style={{ color: c.foreground }}>{(report?.config.enabled ?? status.enabled) ? '켜짐' : '꺼짐'}</Text>
      </Pressable>
    </View>
    <ScrollView accessibilityLabel="자동 관리 설정과 기록" nestedScrollEnabled style={{ height: 320, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
      <Text style={{ color: c.foregroundMuted }}>{automationLabels[(report?.status ?? status).phase]} · gpt-6-luna</Text>
      <Text style={{ color: c.foregroundMuted }}>압력 {report?.config.pressure === 'warning' ? '주의 이상' : '위험'} {report?.config.sustainedSeconds ?? 120}초 지속 + 메모리 증가 시 검토</Text>
      <Text style={{ color: c.foregroundMuted }}>허용한 프로세스만 자동 종료합니다. 상위 앱의 개별 목록에서 지정하세요.</Text>
      <Text style={{ color: c.foregroundMuted }}>리뷰에는 프로세스 이름과 사용량만 전송합니다.</Text>
      {query.error || message ? <Text style={{ color: c.foregroundMuted }}>{message || '자동 관리 정보를 읽지 못했습니다.'}</Text> : null}
      <Text style={{ color: c.foreground, fontWeight: '600' }}>허용 대상 · {report?.targets.length ?? status.targetCount}개</Text>
      {report?.targets.map(p => <View key={`${p.pid}:${p.start}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: c.foreground }}>{p.name} · PID {p.pid}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`PID ${p.pid} 자동 관리 해제`} disabled={pending} onPress={() => void remove(p)} style={{ paddingVertical: 6 }}>
          <Text style={{ color: c.foregroundMuted }}>해제</Text>
        </Pressable>
      </View>)}
      {report?.events.length ? <Text style={{ color: c.foreground, fontWeight: '600' }}>최근 기록</Text> : null}
      {[...(report?.events ?? [])].reverse().map((e, i) => <View key={`${e.at}:${i}`} style={{ gap: 4 }}>
        <Text style={{ color: c.foregroundMuted }}>{new Date(e.at).toLocaleTimeString('ko-KR')}{e.pid ? ` · PID ${e.pid}` : ''}</Text>
        <Text style={{ color: c.foreground }}>{e.message}</Text>
      </View>)}
    </ScrollView>
  </Card>;
}
