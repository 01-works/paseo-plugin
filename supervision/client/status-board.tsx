import { useQuery } from '@tanstack/react-query';
import { usePaseo, useRpc, type PluginScreenProps, type PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { Icon, Modal, SidebarRow } from '@getpaseo/plugin/client/ui';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { listReportsRpc } from '../shared/report';
import type { StatusRow } from '../shared/status';
import { BOARD, boardLayout, defaultLane, groupLanes, keepSelection, keepTab, LANE_MARK, type LaneId } from './board-model';
import { Card, Detail, Mark } from './board-parts';
import { loadStatus } from './status-data';

export function SupervisorsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="ListChecks" active={currentScreen?.screenId === 'supervisors'} onPress={() => openScreen({ screenId: 'supervisors' })} />;
}

/** Better Paseo Tasks 보드의 배치를 따른 감독 보드: 레인·카드·상세 사이드바/시트, 좁은 화면은 레인 탭. */
export function Supervisors({ theme, layout, host, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const list = useRpc(listReportsRpc);
  const query = useQuery({ queryKey: ['supervision-state', host.id], refetchInterval: 10_000,
    queryFn: () => loadStatus(paseo, () => list({})),
  });
  const [width, setWidth] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<LaneId | null>(null);
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const groups = useMemo(() => groupLanes(rows), [rows]);
  // 갱신마다 사라진 선택을 지우고, 첫 카드가 보인 뒤의 탭은 고정한다(새 카드가 생겨도 탭이 저절로 바뀌지 않음).
  useEffect(() => {
    if (!query.data) return;
    setSelectedKey(key => keepSelection(key, rows));
    setTab(current => keepTab(current, groups));
  }, [query.data, rows, groups]);
  const selected = rows.find(row => row.key === selectedKey) ?? null;
  const { phone, inline, laneWidth } = boardLayout(width, layout.compact, !!selected);
  const now = query.data?.now ?? Date.now();
  const { colors } = theme;
  const muted = { color: colors.foregroundMuted, fontSize: 13 };
  const openFor = (row: StatusRow) => navigation
    ? () => { if (row.agent && row.canOpen) navigation.openAgent({ agentId: row.agent.id, serverId: query.data!.serverId }); }
    : undefined;
  const select = (row: StatusRow) => setSelectedKey(key => key === row.key && !phone ? null : row.key);
  const card = (row: StatusRow) => <Card key={row.key} row={row} now={now} theme={theme} selected={row.key === selectedKey}
    onSelect={() => select(row)} onOpen={openFor(row)} />;
  const empty = <Text style={{ ...muted, paddingVertical: 8 }}>없음</Text>;

  const lanes = () => <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BOARD.pad }}>
    <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: BOARD.pad, gap: BOARD.gap, alignItems: 'flex-start' }}>
      {groups.map(group => <View key={group.id} accessibilityLabel={`${group.title} ${group.rows.length}개`} style={{ width: laneWidth, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <Mark status={LANE_MARK[group.id]} theme={theme} />
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{group.title}</Text>
          <Text style={muted}>{group.rows.length}</Text>
        </View>
        {group.rows.length ? group.rows.map(card) : empty}
      </View>)}
    </ScrollView>
  </ScrollView>;

  const tabs = () => {
    const current = groups.find(group => group.id === (tab ?? defaultLane(groups)))!;
    return <View style={{ flex: 1 }}>
      <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: BOARD.pad, paddingBottom: 8, gap: 6 }}>
        {groups.map(group => {
          const on = group.id === current.id;
          return <Pressable key={group.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${group.title} ${group.rows.length}개`}
            onPress={() => setTab(group.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8,
              borderRadius: 8, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.surface2 : 'transparent' }}>
            <Mark status={LANE_MARK[group.id]} theme={theme} size={10} />
            <Text style={{ color: colors.foreground, fontSize: 13 }}>{group.title}</Text>
            <Text style={muted}>{group.rows.length}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: BOARD.pad, paddingBottom: BOARD.pad, gap: 8 }}>
        {current.rows.length ? current.rows.map(card) : empty}
      </ScrollView>
    </View>;
  };

  const sidebar = selected && inline && <View style={{ width: BOARD.sidebar, borderLeftWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>감독 상세</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="상세 닫기" onPress={() => setSelectedKey(null)} style={{ padding: 6 }}>
        <Icon name="X" size={16} color={colors.foregroundMuted} />
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      <Detail row={selected} now={now} theme={theme} onOpen={openFor(selected)} />
    </ScrollView>
  </View>;

  const body = query.isPending ? <Text style={{ ...muted, paddingHorizontal: BOARD.pad }}>감독 상태를 불러옵니다.</Text>
    : !query.data ? null
    : !rows.length ? <Text style={{ color: colors.foreground, fontSize: 15, paddingHorizontal: BOARD.pad }}>
      이 호스트에 감독 보고가 없습니다. 작업 대화에서 /supervise &lt;목표&gt;로 감독을 시작하세요.</Text>
    : width === null ? null : phone ? tabs() : lanes();

  return <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={{ paddingHorizontal: BOARD.pad, paddingTop: layout.compact ? 12 : 16, paddingBottom: 8, gap: 4 }}>
      <Text style={muted}>{host.label} · 감독 {rows.length}개 · 10초마다 갱신 · 다른 호스트는 상단에서 선택하세요.</Text>
      {query.error && <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: 13 }}>
        상태를 갱신하지 못했습니다{query.data ? '(마지막 결과 표시 중)' : ''}: {query.error.message}</Text>}
    </View>
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1 }}>{body}</View>
      {sidebar}
    </View>
    {selected && !inline && width !== null && <Modal title="감독 상세" open onOpenChange={open => { if (!open) setSelectedKey(null); }}>
      <Modal.Content><Detail row={selected} now={now} theme={theme} onOpen={openFor(selected)} /></Modal.Content>
    </Modal>}
  </View>;
}
