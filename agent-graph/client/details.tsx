import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import type { Forest, ForestNode } from '../shared/types';
import { Button, Status } from './controls';
export function Details({ node, forest, theme, stale, onNavigate, compact, onCopyId, onFocus, onToggle, collapsed }: {
  node: ForestNode | undefined; forest: Forest; theme: PluginTheme; stale: boolean; compact: boolean;
  onNavigate?: (id: string) => void; onCopyId: (id: string) => void; onFocus?: () => void; onToggle?: () => void; collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = theme.colors, agent = node?.agent;
  const floating = compact ? { position: 'absolute' as const, bottom: 0, left: 0, right: 0, zIndex: 2, minHeight: 76,
    borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.surface1 } : {};
  if (!node) return <View style={{ minHeight: 64, padding: 12, ...floating }}><Text style={{ color: c.foregroundMuted }}>노드를 선택하면 상세를 볼 수 있습니다.</Text></View>;
  if (!agent) return <View style={{ minHeight: 64, padding: 12, ...floating }}><Text style={{ color: c.foregroundMuted }}>부모 정보 없음</Text></View>;
  const parent = node.parent ? forest.nodes.get(node.parent)?.agent?.title ?? '부모 정보 없음' : '없음';
  if (compact) return <View style={{ flexShrink: 0, ...floating }}>
    {expanded ? <ScrollView style={{ height: 144, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {onToggle ? <Button theme={theme} onPress={onToggle}>{collapsed ? '가지 펼치기' : '가지 접기'}</Button> : null}
        {onNavigate ? <Button theme={theme} onPress={() => onNavigate(agent.id)}>대화 열기</Button> : null}
      </View>
      <Text selectable style={{ color: c.foregroundMuted }}>{agent.provider}{agent.model ? ' · ' + agent.model : ''}</Text>
      <Text selectable style={{ color: c.foregroundMuted }}>워크스페이스 · {agent.cwd || agent.workspaceId || '없음'}</Text>
      <Text selectable style={{ color: c.foregroundMuted }}>부모 · {parent}</Text>
      <Text selectable style={{ color: c.foregroundMuted }}>ID · {agent.id}</Text>
      {node.issue ? <Text style={{ color: c.statusWarning }}>{node.issue}</Text> : null}
    </ScrollView> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, minHeight: 74 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${agent.title} 위치로 확대`} onPress={onFocus}
        style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 4 }}>
        <Text numberOfLines={2} style={{ color: c.foreground }}>{agent.title} ↗</Text>
        <Status state={agent.state} theme={theme} stale={stale} />
      </Pressable>
      <Button theme={theme} label={`${agent.title} ID 복사`} onPress={() => onCopyId(agent.id)}>ID 복사</Button>
      <Button theme={theme} active={expanded} label={expanded ? '에이전트 상세 접기' : '에이전트 상세 펼치기'}
        onPress={() => setExpanded(!expanded)}>{expanded ? '접기' : '상세'}</Button>
    </View>
  </View>;
  return <ScrollView style={{ height: compact ? 168 : 184, flexGrow: 0, flexShrink: 0,
    borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text selectable style={{ flex: 1, color: c.foreground, fontWeight: '600' }}>{agent.title}</Text>
      <Button theme={theme} label={`${agent.title} ID 복사`} onPress={() => onCopyId(agent.id)}>ID 복사</Button>
      {onNavigate ? <Button theme={theme} onPress={() => onNavigate(agent.id)}>대화 열기</Button> : null}
    </View>
    <Status state={agent.state} theme={theme} stale={stale} />
    <Text selectable style={{ color: c.foregroundMuted }}>{agent.provider}{agent.model ? ' · ' + agent.model : ''}</Text>
    <Text selectable style={{ color: c.foregroundMuted }}>워크스페이스 · {agent.cwd || agent.workspaceId || '없음'}</Text>
    <Text selectable style={{ color: c.foregroundMuted }}>부모 · {parent}</Text>
    <Text selectable style={{ color: c.foregroundMuted }}>ID · {agent.id}</Text>
    {node.issue ? <Text style={{ color: c.statusWarning }}>{node.issue}</Text> : null}
  </ScrollView>;
}
