import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { automationConfigureRpc, automationReportRpc, automationTargetRpc, reviewConfirmRpc, REVIEW_MAX_AGE_MS,
  type AutomationStatus, type ReviewedProcess } from '../shared/automation';
import { useStableQuery } from './data';
import { gib } from './format';
import { Card, type Theme } from './visuals';

export const automationLabels: Record<AutomationStatus['phase'], string> = {
  off: '꺼짐', idle: '감시', watching: '압력 지속', sampling: '추세 확인', reviewing: 'Luna 검토', cooldown: '대기', error: '확인 필요',
};
const verdicts = { normal: '정상', observe: '관찰', terminate: '종료 검토' };
const outcomes: Record<ReviewedProcess['outcome'], string> = {
  pending: '', requested: '요청 중', sent: '종료 요청 · 결과 확인 중', refused: '종료 요청 거절', cancelled: '상태 변경으로 취소',
  exited: '종료 확인', running: '계속 실행 중', unknown: '종료 여부 확인 불가',
};
export function AutomationPanel({ theme, status, onBack }: { theme: Theme; status: AutomationStatus; onBack: () => void }) {
  const c = theme.colors;
  const get = useRpc(automationReportRpc), configure = useRpc(automationConfigureRpc), target = useRpc(automationTargetRpc), confirm = useRpc(reviewConfirmRpc);
  const query = useStableQuery({ queryKey: ['mac-monitor', 'automation'], queryFn: () => get({}), refreshInterval: 2000 });
  const [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const [chosen, choose] = useState<ReviewedProcess | null>(null);
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
    try { const result = await target({ ...p, allow: false }); if (!result.changed) setMessage(result.error ?? '허용을 해제하지 못했습니다.'); await query.refetch(); }
    catch { setMessage('허용을 해제하지 못했습니다.'); }
    finally { setPending(false); }
  };
  const send = async () => {
    if (!chosen?.target.path || pending) return;
    setPending(true); setMessage('');
    try {
      const result = await confirm({ ...chosen.target, path: chosen.target.path, reviewedAt: chosen.at });
      setMessage(result.sent ? `PID ${chosen.target.pid}에 종료 요청을 보냈습니다.` : result.error ?? '종료하지 못했습니다.');
      choose(null); await query.refetch();
    } catch { setMessage('종료 요청의 결과를 확인하지 못했습니다. 기록과 현재 프로세스를 확인하세요.'); choose(null); }
    finally { setPending(false); }
  };
  return <Card theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="모니터로 돌아가기" disabled={pending} onPress={onBack} style={{ paddingVertical: 6 }}>
        <Text style={{ color: c.foregroundMuted }}>‹ 뒤로</Text>
      </Pressable>
      <Text style={{ color: c.foreground, flex: 1, fontWeight: '600' }}>자동 리뷰</Text>
      <Pressable accessibilityRole="switch" accessibilityLabel="메모리 자동 리뷰" accessibilityState={{ checked: report?.config.enabled ?? status.enabled, disabled: !report || pending }}
        disabled={!report || pending} onPress={() => void toggle()} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: c.surface2 }}>
        <Text style={{ color: c.foreground }}>{(report?.config.enabled ?? status.enabled) ? '켜짐' : '꺼짐'}</Text>
      </Pressable>
    </View>
    <ScrollView accessibilityLabel="자동 리뷰 후보와 기록" nestedScrollEnabled style={{ height: 320, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
      <Text style={{ color: c.foregroundMuted }}>{automationLabels[(report?.status ?? status).phase]} · gpt-6-luna</Text>
      <Text style={{ color: c.foregroundMuted }}>압력 {report?.config.pressure === 'warning' ? '주의 이상' : '위험'} {report?.config.sustainedSeconds ?? 120}초 지속 + 메모리 증가 시 검토</Text>
      {query.error || message ? <Text style={{ color: c.foregroundMuted }}>{message || '리뷰 정보를 읽지 못했습니다.'}</Text> : null}
      {chosen ? <View style={{ padding: 12, gap: 8, borderRadius: 6, backgroundColor: c.surface2 }}>
        <Text style={{ color: c.foreground }}>{chosen.target.name} · PID {chosen.target.pid} 종료</Text>
        <Text style={{ color: c.foregroundMuted }}>저장하지 않은 작업을 잃을 수 있습니다.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="리뷰 종료 취소" disabled={pending} onPress={() => choose(null)}><Text style={{ color: c.foreground }}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`PID ${chosen.target.pid} 리뷰 종료 확인`} disabled={pending || Boolean(query.error)} onPress={() => void send()}>
            <Text style={{ color: pending || query.error ? c.foregroundMuted : c.statusDanger }}>{pending ? '요청 중' : '종료'}</Text>
          </Pressable>
        </View>
      </View> : null}
      {!report?.reviews.length ? <Text style={{ color: c.foregroundMuted }}>{report ? '검토한 후보 없음' : query.error ? '후보 확인 불가' : '리뷰 확인 중'}</Text> : null}
      {report?.reviews.map(r => {
        const expired = Date.now() < r.at || Date.now() - r.at > REVIEW_MAX_AGE_MS;
        const canConfirm = !expired && r.outcome === 'pending' && r.decision !== 'normal' && Boolean(r.target.path);
        return <View key={`${r.at}:${r.target.pid}:${r.target.start}`} style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontWeight: '600' }}>{r.target.group}</Text>
            {canConfirm ? <Pressable accessibilityRole="button" accessibilityLabel={`PID ${r.target.pid} 리뷰 종료 선택`} disabled={pending || Boolean(query.error) || report.status.phase === 'reviewing'}
              onPress={() => { choose(r); setMessage(''); }} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: c.surface2 }}>
              <Text style={{ color: c.foreground }}>종료</Text>
            </Pressable> : null}
          </View>
          <Text style={{ color: c.foregroundMuted }}>{verdicts[r.decision]} · PID {r.target.pid} · {gib(r.memoryBytes)} · 증가 {gib(r.growthBytes)}</Text>
          <Text style={{ color: c.foreground }}>{r.reason}</Text>
          <Text style={{ color: c.foregroundMuted }}>{new Date(r.at).toLocaleTimeString('ko-KR')}{r.outcome !== 'pending' ? ` · ${outcomes[r.outcome]}` : expired ? ' · 다시 검토 필요' : ''}</Text>
        </View>;
      })}
      {report?.targets.length ? <>
        <Text style={{ color: c.foreground, fontWeight: '600' }}>자동 종료 허용 · {report.targets.length}개</Text>
        {report.targets.map(p => <View key={`${p.pid}:${p.start}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.foreground }}>{p.name} · PID {p.pid}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`PID ${p.pid} 자동 종료 허용 해제`} disabled={pending} onPress={() => void remove(p)} style={{ paddingVertical: 6 }}>
            <Text style={{ color: c.foregroundMuted }}>해제</Text>
          </Pressable>
        </View>)}
      </> : null}
      {report?.events.length ? <Text style={{ color: c.foreground, fontWeight: '600' }}>최근 기록</Text> : null}
      {[...(report?.events ?? [])].reverse().map((e, i) => <View key={`${e.at}:${i}`} style={{ gap: 4 }}>
        <Text style={{ color: c.foregroundMuted }}>{new Date(e.at).toLocaleTimeString('ko-KR')}{e.pid ? ` · PID ${e.pid}` : ''}</Text>
        <Text style={{ color: c.foreground }}>{e.message}</Text>
      </View>)}
    </ScrollView>
  </Card>;
}
