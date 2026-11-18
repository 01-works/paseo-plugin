import { useQuery } from '@tanstack/react-query';
import { usePaseo, useRpc, type PluginScreenProps, type PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { Icon, Modal, SidebarRow } from '@getpaseo/plugin/client/ui';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listReportsRpc } from '../shared/report';
import type { StatusRow } from '../shared/status';
import { boardColors, boardLayout, defaultLane, groupLanes, keepSelection, keepTab, LANE, LANE_MARK, SIDEBAR, type LaneId } from './board-model';
import { Detail } from './board-detail';
import { Card, LaneEmpty, StatusIcon } from './board-parts';
import { loadStatus } from './status-data';

const HAIR = StyleSheet.hairlineWidth;
const WEB = Platform.OS === 'web';

export function SupervisorsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="ListChecks" active={currentScreen?.screenId === 'supervisors'} onPress={() => openScreen({ screenId: 'supervisors' })} />;
}

/**
 * 감독 보드. Better Paseo Tasks 보드처럼 surface0 위에 둥근 레인 패널을 나란히 두고(각 레인이 세로로 스크롤),
 * 카드를 고르면 1020 이상은 오른쪽 사이드바, 그보다 좁으면 host Modal에 상세를 연다. host compact는 레인 탭.
 */
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
  const { phone, inline, sidebar, laneWidth } = boardLayout(width, layout.compact, !!selected);
  const now = query.data?.now ?? Date.now();
  const { colors } = theme;
  const palette = useMemo(() => boardColors(colors), [colors]);
  const muted = { color: colors.foregroundMuted, fontSize: 12 };
  const openFor = (row: StatusRow) => navigation
    ? () => { if (row.agent && row.canOpen) navigation.openAgent({ agentId: row.agent.id, serverId: query.data!.serverId }); }
    : undefined;
  const select = (row: StatusRow) => setSelectedKey(key => key === row.key && !phone ? null : row.key);
  const card = (row: StatusRow) => <Card key={row.key} row={row} now={now} theme={theme} palette={palette} compact={phone}
    selected={row.key === selectedKey} onSelect={() => select(row)} onOpen={openFor(row)} />;

  const lanes = () => <ScrollView horizontal style={{ flex: 1 }}
    contentContainerStyle={{ gap: LANE.gap, paddingLeft: LANE.edge, paddingRight: LANE.edge, paddingTop: 4, paddingBottom: 12 }}>
    {groups.map(group => <View key={group.id} accessibilityLabel={`${group.title} ${group.rows.length}개`}
      style={{ width: laneWidth, minHeight: 0, borderRadius: 5, backgroundColor: palette.panel, overflow: 'hidden' }}>
      <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 8 }}>
        <StatusIcon status={LANE_MARK[group.id]} theme={theme} size={14} />
        <Text accessibilityRole="header" style={{ fontSize: 14, fontWeight: '500', color: colors.foreground }}>{group.title}</Text>
        <Text style={{ fontSize: 14, color: colors.foregroundMuted, fontVariant: ['tabular-nums'] }}>{group.rows.length}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingLeft: 8, paddingRight: WEB ? 4 : 8, paddingTop: WEB ? 4 : 2, paddingBottom: 8, gap: 12 }}>
        {group.rows.length ? group.rows.map(card) : <LaneEmpty lane={group} theme={theme} narrow />}
      </ScrollView>
    </View>)}
  </ScrollView>;

  // 폰: 패널 색 트랙 위의 세그먼트. 고른 칸은 카드처럼 올라오고, 결정 레인의 개수는 경고색으로 표시한다.
  const tabs = () => {
    const current = groups.find(group => group.id === (tab ?? defaultLane(groups)))!;
    return <View style={{ flex: 1 }}>
      <View style={{ borderBottomWidth: HAIR, borderBottomColor: colors.border, backgroundColor: palette.panel }}>
        <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 8, paddingVertical: 4, gap: 4 }}>
          {groups.map(group => {
            const on = group.id === current.id;
            const warn = group.id === 'decision' && group.rows.length > 0;
            return <Pressable key={group.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${group.title} ${group.rows.length}개`}
              onPress={() => setTab(group.id)} style={{ flexGrow: 1, flexBasis: 0, minHeight: 36, paddingHorizontal: 6, borderRadius: 8, borderWidth: HAIR,
                borderColor: on ? colors.border : 'transparent', backgroundColor: on ? palette.card : 'transparent', boxShadow: on ? palette.shadow : undefined,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <StatusIcon status={LANE_MARK[group.id]} theme={theme} size={13} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: on ? '600' : '500', color: on ? colors.foreground : colors.foregroundMuted }}>{group.tab}</Text>
              <Text style={{ fontSize: 14, fontWeight: warn || on ? '600' : '400', fontVariant: ['tabular-nums'],
                color: warn ? colors.statusWarning : on ? colors.foreground : colors.foregroundMuted }}>{group.rows.length}</Text>
            </Pressable>;
          })}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        {current.rows.length ? current.rows.map(card) : <LaneEmpty lane={current} theme={theme} />}
      </ScrollView>
    </View>;
  };

  const empty = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <View style={{ width: '100%', maxWidth: 480, alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 20,
      borderWidth: HAIR, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8 }}>
      <Icon name="ListChecks" size={20} color={colors.foregroundMuted} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.foreground, textAlign: 'center' }}>이 호스트에 감독 보고가 없습니다</Text>
      <Text style={{ ...muted, lineHeight: 16, textAlign: 'center' }}>작업 대화에서 /supervise &lt;목표&gt;로 감독을 시작하세요.</Text>
    </View>
  </View>;

  const body = query.isPending ? <Text style={{ ...muted, paddingHorizontal: 16 }}>감독 상태를 불러옵니다.</Text>
    : !query.data ? null : !rows.length ? empty : width === null ? null : phone ? tabs() : lanes();

  return <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {/* Better Paseo 툴바의 가운데 총수 배치만 따른다. 검색·필터·정렬은 두지 않는다. */}
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
      <Text numberOfLines={1} style={{ ...muted, flex: 1 }}>{host.label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] }}>감독 {rows.length}개</Text>
      <Text numberOfLines={1} style={{ ...muted, flex: 1, textAlign: 'right' }}>10초마다 갱신{phone ? '' : ' · 다른 호스트는 상단에서 선택'}</Text>
    </View>
    {query.error && <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 }}>
      상태를 갱신하지 못했습니다{query.data ? '(마지막 결과 표시 중)' : ''}: {query.error.message}</Text>}
    <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
      {selected && inline && sidebar > 0 && <View style={{ width: sidebar, marginRight: SIDEBAR.gap, paddingTop: 4, paddingBottom: 12 }}>
        <ScrollView style={{ flex: 1 }}>
          <Detail row={selected} now={now} theme={theme} palette={palette} onOpen={openFor(selected)} onClose={() => setSelectedKey(null)} framed />
        </ScrollView>
      </View>}
    </View>
    {selected && !inline && width !== null && <Modal title="감독 상세" open onOpenChange={open => { if (!open) setSelectedKey(null); }}>
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 16, gap: 0 }}>
        <Detail row={selected} now={now} theme={theme} palette={palette} onOpen={openFor(selected)} />
      </Modal.Content>
    </Modal>}
  </View>;
}
