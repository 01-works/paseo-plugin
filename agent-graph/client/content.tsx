import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { copyText, TextInput, useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { agentKey } from '../shared/types';
import { countForest, initialCollapse, scopeForest } from '../shared/forest';
import { fitZoom } from '../shared/layout';
import type { AgentDirectory } from './directory';
import type { GraphViews } from './view-state';
import { Button, IconButton, Tab } from './controls';
import { Graph } from './graph';
import { Tree } from './tree';
import { Details } from './details';
import { useForceLayout } from './use-force-layout';
import { AgentBrowser } from './browser';
export type GraphContentProps = PluginHostProps & {
  directory: AgentDirectory; views: GraphViews; workspaceId: string; agentId: string; surface: 'modal' | 'panel';
  onLarge?: () => void; onNavigate?: (id: string) => void;
};
export function GraphContent(props: GraphContentProps) {
  const toast = useToast();
  const store = useMemo(() => props.views.forAgent(props.host.id, props.workspaceId, props.agentId),
    [props.views, props.host.id, props.workspaceId, props.agentId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot), c = props.theme.colors;
  const navigate = props.onNavigate ? (id: string) => {
    try { props.onNavigate!(id); }
    catch { toast.error('대화를 열지 못했습니다. 다시 눌러 주세요'); }
  } : undefined;
  return <View style={{ flex: props.surface === 'panel' || props.layout.compact ? 1 : undefined, minHeight: 0, gap: 8, backgroundColor: c.surface0,
    width: '100%', alignSelf: 'center', maxWidth: state.view === 'browse' && !props.layout.compact ? 760 : undefined }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1, borderColor: c.border }}>
      <View style={{ flexDirection: 'row' }}>
        <Tab theme={props.theme} active={state.view === 'browse'} onPress={() => store.set({ view: 'browse', message: null })}>탐색</Tab>
        <Tab theme={props.theme} active={state.view === 'structure'} onPress={() => store.set({ view: 'structure', message: null })}>구조</Tab>
      </View>
      {props.onLarge ? <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {props.layout.compact ? <IconButton theme={props.theme} name="Maximize2" label="크게 보기" onPress={props.onLarge} /> :
          <Button theme={props.theme} onPress={props.onLarge}>크게 보기</Button>}
      </View> : null}
    </View>
    {state.view === 'browse' ? <AgentBrowser {...props} store={store} onNavigate={navigate} /> : <StructureContent {...props} onNavigate={navigate} />}
    {state.view === 'browse' && state.message ? <Text style={{ color: c.foregroundMuted }}>{state.message}</Text> : null}
  </View>;
}
function StructureContent(props: GraphContentProps) {
  const { directory, views, workspaceId, agentId, surface, layout, theme, host } = props;
  const toast = useToast();
  const copyId = async (id: string) => {
    try { await copyText(id); toast.show('에이전트 ID 복사됨', { durationMs: 1800 }); }
    catch { toast.error('ID를 복사하지 못했습니다'); }
  };
  const c = theme.colors, snapshot = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
  const store = useMemo(() => views.forAgent(host.id, workspaceId, agentId), [views, host.id, workspaceId, agentId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const origin = agentKey(directory.hostId, agentId);
  const forest = useMemo(() => scopeForest(directory.getForest(), origin, workspaceId, state.scope), [snapshot.agents, origin, workspaceId, state.scope, directory]);
  const { geometry, arranging } = useForceLayout(forest, state.collapsed, store, state.mode === 'graph');
  const [viewport, setViewport] = useState({ width: 0, height: 360 });
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? [...forest.nodes.values()].filter(node => node.agent &&
      (node.agent.title.toLocaleLowerCase().includes(term) || node.agent.id.toLocaleLowerCase().includes(term))).map(node => node.key) : [];
  }, [forest, query]);
  const count = countForest(forest);
  const originMissing = state.scope === 'group' && !directory.getForest().nodes.has(origin);
  const tree = state.mode === 'tree' || geometry.truncated;
  useEffect(() => {
    if (!tree && !arranging && !state.forceFitted && viewport.width > 0) {
      store.set({ zoom: fitZoom(geometry, viewport.width, viewport.height), forceFitted: true, focus: state.focus + 1 });
    }
  }, [tree, arranging, state.forceFitted, viewport.width, viewport.height, geometry]);
  useEffect(() => directory.watch(), [directory]);
  useEffect(() => {
    if (!state.initialized && forest.nodes.has(origin)) {
      store.set({ initialized: true, selected: origin, collapsed: initialCollapse(forest, origin), focus: state.focus + 1 });
    } else if (state.selected && !forest.nodes.has(state.selected) && !snapshot.loading && !snapshot.stale) {
      store.set({ selected: null, message: '선택한 에이전트가 이 범위에 없습니다' });
    }
  }, [forest, state.initialized, state.selected, snapshot.loading, snapshot.stale]);
  const reveal = (key: string, detail = false) => {
    if (!forest.nodes.has(key)) { store.set({ message: '현재 에이전트를 아직 확인하지 못했습니다' }); return; }
    const collapsed = new Set(state.collapsed);
    let node = forest.nodes.get(key);
    while (node) { collapsed.delete(node.key); node = node.parent ? forest.nodes.get(node.parent) : undefined; }
    store.set({ collapsed, selected: key, focus: state.focus + 1, message: null,
      ...(detail && !tree ? { zoom: Math.max(0.75, state.zoom), forceFitted: true } : {}) });
  };
  const findMatch = (step: number) => {
    if (!matches.length) return;
    const index = matches.indexOf(state.selected ?? '');
    reveal(matches[index < 0 ? step > 0 ? 0 : matches.length - 1 : (index + step + matches.length) % matches.length], true);
  };
  const zoomControls = (zoom: number) => layout.compact && viewport.height < 160 && !zoomOpen ?
    <View style={{ position: 'absolute', bottom: 8, right: 8, borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.surface1 }}>
      <Button theme={theme} label="확대 도구 열기" onPress={() => setZoomOpen(true)}>{Math.round(zoom * 100)}%</Button>
    </View> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0,
    ...(layout.compact ? { position: 'absolute' as const, bottom: 8, left: 8, padding: 2, borderRadius: 8,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 } : {}) }}>
    <Button theme={theme} label="축소" disabled={zoom <= 0.03} onPress={() => { store.zoomTo(zoom - 0.25); setZoomOpen(false); }}>−</Button>
    <Text style={{ color: c.foregroundMuted, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
    <Button theme={theme} label="확대" disabled={zoom >= 1.5} onPress={() => { store.zoomTo(zoom + 0.25); setZoomOpen(false); }}>+</Button>
    <Button theme={theme} onPress={() => { store.set({ zoom: fitZoom(geometry, viewport.width, viewport.height), forceFitted: true, focus: state.focus + 1 }); setZoomOpen(false); }}>맞춤</Button>
    {layout.compact && viewport.height < 160 ? <Button theme={theme} label="확대 도구 닫기" onPress={() => setZoomOpen(false)}>×</Button> : null}
  </View>;
  return <View style={{ flex: surface === 'panel' || layout.compact ? 1 : undefined, minHeight: 0, gap: 8, backgroundColor: c.surface0 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      <Button theme={theme} active={state.scope === 'group'} onPress={() => store.set({ scope: 'group', message: null })}>현재 구조</Button>
      <Button theme={theme} active={state.scope === 'workspace'} onPress={() => store.set({ scope: 'workspace', message: null })}>워크스페이스</Button>
      {layout.compact ? <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', minWidth: 88 }}>
        <IconButton theme={theme} name="GitFork" label="그래프" active={!tree} disabled={geometry.truncated} onPress={() => store.set({ mode: 'graph' })} />
        <IconButton theme={theme} name="ListTree" label="목록" active={tree} onPress={() => store.set({ mode: 'tree' })} />
      </View> : null}
    </View>
    {!layout.compact ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      <View style={{ flexDirection: 'row', borderRadius: 8, backgroundColor: c.surface1 }}>
        <Button theme={theme} active={!tree} disabled={geometry.truncated} onPress={() => store.set({ mode: 'graph' })}>그래프</Button>
        <Button theme={theme} active={tree} onPress={() => store.set({ mode: 'tree' })}>목록</Button>
      </View>
      {!tree && !layout.compact ? zoomControls(state.zoom) : null}
      <Button theme={theme} onPress={() => reveal(origin, true)}>현재 위치</Button>
      {!layout.compact && state.selected && forest.nodes.get(state.selected)?.children.length ? <Button theme={theme}
        onPress={() => store.toggle(state.selected!)}>{state.collapsed.has(state.selected) ? '펼치기' : '접기'}</Button> : null}
    </View> : null}
    {!layout.compact || searchOpen ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      <TextInput accessibilityLabel="에이전트 이름 또는 ID 검색" placeholder="이름 또는 ID 찾기" value={query}
        onChangeText={setQuery} onSubmitEditing={() => findMatch(1)} returnKeyType="search" autoCorrect={false} autoCapitalize="none"
        placeholderTextColor={c.foregroundMuted} selectionColor={c.accent}
        style={{ flex: 1, minWidth: 80, minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border,
          borderRadius: 8, backgroundColor: c.surface1, color: c.foreground }} />
      {query.trim() ? <>
        <Text style={{ color: c.foregroundMuted }}>{matches.length ? matches.includes(state.selected ?? '') ?
          (matches.indexOf(state.selected ?? '') + 1) + '/' + matches.length : matches.length + '개' : '결과 없음'}</Text>
        <Button theme={theme} label="이전 검색 결과" disabled={!matches.length} onPress={() => findMatch(-1)}>‹</Button>
        <Button theme={theme} label="다음 검색 결과" disabled={!matches.length} onPress={() => findMatch(1)}>›</Button>
        <Button theme={theme} label="검색 지우기" onPress={() => setQuery('')}>×</Button>
      </> : null}
    </View> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, minHeight: 24 }}>
      <Text numberOfLines={layout.compact ? 1 : undefined} style={{ flex: 1, minWidth: 0, color: c.foregroundMuted }}>
        {snapshot.loaded ? originMissing ? '현재 에이전트 확인 불가' :
          (snapshot.partial ? '일부 · ' : '') + (layout.compact ? count.total + '개' : '에이전트 ' + count.total) + ' · 실행 ' + (snapshot.stale ? '—' : count.running) : snapshot.error ? '구조 확인 불가' : '구조 불러오는 중'}
      </Text>
      {layout.compact ? <>
        <Button theme={theme} onPress={() => reveal(origin, true)}>현재 위치</Button>
        <Button theme={theme} active={searchOpen} label={searchOpen ? '검색 닫기' : '에이전트 검색'}
          onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(''); }}>찾기</Button>
      </> : null}
      {arranging && !tree ? <Text style={{ color: c.foregroundMuted }}>배치 정리 중</Text> : null}
      {snapshot.error || snapshot.partial ? <Button theme={theme} disabled={snapshot.loading} onPress={() => { void directory.retry(); }}>다시 읽기</Button> : null}
    </View>
    {snapshot.stale || snapshot.error || snapshot.partial || snapshot.loading && snapshot.loaded ? <Text style={{ color: c.foregroundMuted, paddingHorizontal: 10 }}>
      {snapshot.error ? snapshot.error + (snapshot.stale && snapshot.loaded ? ' · 마지막 구조' : '') : snapshot.stale ? '연결 끊김 · 마지막 구조' : snapshot.loading ? '목록 불러오는 중' : '일부만 표시'}
    </Text> : null}
    {geometry.truncated ? <Text style={{ color: c.foregroundMuted, paddingHorizontal: 10 }}>큰 구조는 목록으로 표시합니다.</Text> : null}
    <View style={{ flex: surface === 'panel' || layout.compact ? 1 : undefined, height: surface === 'modal' && !layout.compact ? 360 : undefined,
      minHeight: layout.compact ? 0 : 200,
      borderWidth: 1, borderColor: c.border, borderRadius: 10, overflow: 'hidden' }}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setViewport(old => old.width === width && old.height === height ? old : { width, height });
      }}>
      {!forest.nodes.size ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ color: c.foregroundMuted }}>{snapshot.loaded ? '이 범위에서 확인한 에이전트가 없습니다' : snapshot.error ? '구조를 읽지 못했습니다' : '구조 불러오는 중'}</Text>
      </View> : tree ? <Tree forest={forest} state={state} store={store} origin={origin} theme={theme} stale={snapshot.stale} onCopyId={copyId} />
        : viewport.width > 0 ? <Graph forest={forest} geometry={geometry} state={state} store={store} origin={origin} theme={theme} stale={snapshot.stale}
          surface={surface} viewport={viewport} onCopyId={copyId} controls={layout.compact ? zoom => viewport.height >= 64 ? zoomControls(zoom) : null : undefined} /> : null}
    </View>
    {state.message ? <Text style={{ color: c.foregroundMuted, paddingHorizontal: 12 }}>{state.message}</Text> : null}
    {layout.compact ? <View style={{ height: 76, flexShrink: 0 }} /> : null}
    <Details node={forest.nodes.get(state.selected ?? '')} forest={forest} theme={theme} stale={snapshot.stale}
      compact={layout.compact} onNavigate={props.onNavigate} onCopyId={copyId} onFocus={() => reveal(state.selected!, true)}
      onToggle={state.selected && forest.nodes.get(state.selected)?.children.length ? () => store.toggle(state.selected!) : undefined}
      collapsed={state.selected ? state.collapsed.has(state.selected) : false} />
  </View>;
}
