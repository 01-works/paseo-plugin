# Paseo 플러그인 API 조사 (로컬 daemon/CLI 0.10.2 기준)

Scratch: /tmp/macmon-research/paseo-api/ (docs 원문 `docs_*.md`, `pkg-0.10.2/`, `pkg-0.10.3/`, `pkg-0.11.0-beta.5/`, `client-0.10.2/`, `src-0.10.2/` = getpaseo/paseo@v0.10.2 shallow clone, `init-test/` = `paseo plugin init` 결과)

## 0. 가장 중요한 차이: 온라인 문서는 0.10.2와 다름
- npm `@getpaseo/plugin`: dist-tags `latest=0.10.3`, `beta=0.11.0-beta.5`. **0.10.2와 0.10.3의 dist는 바이트 단위로 동일.**
- paseo.sh/docs/plugins*.md는 **0.11 beta API**를 설명함. 0.10.2 기준 문서는 레포의 `public-docs/plugins/reference.md` @v0.10.2 (src-0.10.2/public-docs/plugins/).
- 0.10.2에 **없는** 것 (온라인 문서에만 있음): `addScreen`, `addSidebarHeaderItem`, `addSidebarFooterItem`, `PluginScreenProps.params`, `openScreen`, `PluginSidebarItemProps`(`currentScreen`, `openPopover`), `PluginPopoverProps`, `@getpaseo/plugin/client/ui`의 `SidebarRow`/`SidebarSeparator`, `client.playAudio`, `server.registerUsageSource` ("Requires Paseo 0.11"), `@getpaseo/plugin/server`의 `spawnProcess/execCommand/terminateProcess`.
- 0.10.2에서 대신 쓰는 것: `client.addSurface(id, Component)` + `client.addSidebarItem({ id, title, icon, surface })` + `openSurface(id)`. `paseo plugin init`(0.10.2) 스캐폴드도 이 방식이며 `requirements.paseo: ">=0.10.2"`, devDeps `@getpaseo/plugin 0.10.2`, `@tanstack/react-query ^5.90.11`, `react 19.1.0`, `react-native 0.81.5`, `zod ^4.4.3`, `typescript ^5.9.3`.
- 그 외(composer pill, button descriptor, Modal, useHosts/getPaseoClient, RPC, manifest/build, theme)는 0.10.2와 문서가 일치. "Discover hosts and target another host" 섹션은 0.10.2 문서와 최신 문서가 동일.

## a. addComposerPill
0.10.2 타입 (`dist/client/contracts.d.ts`, `dist/client/buttons.d.ts`):
```ts
addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration;
export interface PluginHeaderButtonContribution { id: string; workspaceId: string; button: PluginButton; }
export interface PluginComposerPillContribution extends PluginHeaderButtonContribution { agentId: string; }
export interface PluginButton {
    title: string;
    icon: PluginButtonIcon;            // string(Lucide) | ComponentType<PluginButtonIconProps>
    /** Omit for an icon-only header button. Composer pills use title when omitted. */
    label?: string;
    visible?: boolean;
    disabled?: boolean;
    behavior: PluginButtonBehavior;
}
export type PluginButtonBehavior =
  | { kind: "action"; onPress(): void | Promise<void> }
  | { kind: "menu"; items: readonly PluginButtonMenuEntry[] }
  | { kind: "popover"; Content: ComponentType<PluginButtonContentProps> };
export type PluginButtonIconProps = PluginHostProps & PluginButtonContext & { size: number; color: string; };
export type PluginButtonContentProps = PluginHostProps & PluginButtonContext & { close(): void; };
export interface PluginButtonRegistration { update(patch: Partial<PluginButton>): void; remove(): void; }
// PluginHostProps = { theme: PluginTheme; host: { id; label }; layout: { compact: boolean; platform: "ios"|"android"|"web" } }
// PluginButtonContext = { context:"workspace"; workspaceId } | { context:"agent"; workspaceId; agentId }
```
- 컴포넌트 props: pill 자체는 컴포넌트가 아니라 descriptor. 커스텀 아이콘 컴포넌트는 `theme, host, layout, size, color, context/workspaceId/agentId` 수신, popover Content는 `theme, host, layout, context..., close()` 수신. 즉 theme·layout 모두 받음.
- **엄격히 per-agent**: `workspaceId`와 `agentId` 필수. 문서: "It targets one agent's composer track alongside Tasks and Subagents." 앱 매칭 코드(`app/src/plugins/buttons/model.ts` buttonMatches): `entry.installation.serverId === serverId && entry.context.workspaceId === workspaceId && entry.placement === "composer" && entry.context.agentId === agentId`. per-workspace/global pill은 없음. 전체 agent에 표시하려면 agent 목록을 구독해 agent마다 등록해야 함 — 문서: "For pills that follow the agent directory, use an explicit owned list subscription. The local plugin example replaces registrations on each snapshot and aborts the observation during entry cleanup" (`plugin-examples/local-plugin/client/main.tsx`: `client.paseo.agents.list({ subscribe: {}, signal })` → snapshot/update마다 addComposerPill/remove).
- Workspace 단위 버튼은 `addHeaderButton({ id, workspaceId, button })` (workspace header 우측).
- onPress로 할 수 있는 것: "An action runs on the client. Paseo marks the button busy until its promise settles, blocks repeated presses, and shows failures in a toast." 클라이언트 컨텍스트로 `client.openPanel(panelId, { workspaceId, agentId?, location? })`, `client.openSurface(id)`, `client.openSettings(id)`, `client.rpc(contract, input)`, `client.paseo` 사용 가능.
- **Popover API 있음 (0.10.2 포함)**: `behavior: { kind: "popover", Content }` — "Menus and popovers open anchored surfaces on wide layouts and bottom sheets on compact layouts." Content는 "Render the body only; Paseo owns anchoring, scrolling, padding, and sheet presentation. Content can use usePaseo, useRpc, useWorkspace, useAgent, and the installation's React Query cache." pill은 "never show a chevron, including for menus and popovers." menu 항목도 action/menu/popover 중첩 가능.
- Modal: 호스트 제공 `Modal` (`@getpaseo/plugin/client/react-native`, props `title, icon?, open, onOpenChange, children` + `Modal.Content{style, contentContainerStyle, scrollable}`) — "uses a bottom sheet on compact layouts and a centered dialog otherwise. The plugin owns the open state." pill 자체는 컴포넌트를 렌더하지 않으므로 Modal은 popover Content나 surface/panel 안에서 열어야 함. react-native의 `Modal`은 `react-native`가 호스트 제공 모듈이라 import는 가능하지만 문서는 언급 없음/권장 안 함(SDK `Modal`·`ScrollView`·`FlatList`·`TextInput` 사용 권장; "Do not import bottom-sheet libraries directly.").

## b. composer 주변 다른 슬롯
- `addSlashCommand({ name, description, argumentHint, context: "workspace"|"agent", onSubmit })` — 텍스트는 agent로 안 감. "It does not wait for onSubmit or show a pending state; use a composer pill or panel for that."
- `addAttachmentSource({ id, title, icon, pickerTitle, searchPlaceholder, search: PluginRpcContract })` — composer 첨부 메뉴/검색 피커. "Attachment sources remain scoped to each composer's host."
- 그 외 agent 근처: timeline transformer/renderer, `paseo.agents.ref(id).timeline.append(...)` (daemon에서 타임라인 행 추가). 0.11 beta에서 usage source(agent popover) 추가 예정. composer 입력창 자체에 대한 다른 슬롯은 없음.

## c. 서버 subprocess 라이프사이클
- daemon당 플러그인(=설치 ID)당 subprocess 1개. `index.server.ts` 없으면 subprocess 없음 ("A plugin without index.server.ts starts no subprocess."). 소스(`server/src/server/plugins/runtime.ts`): `fork(worker, [], { execArgv: ["--experimental-strip-types", ...], serialization: "advanced", stdio: ["ignore","pipe","pipe","ipc"] })`, `Map<pluginId, LoadedPlugin>`에 child 1개. 클라이언트/agent 수와 무관. 같은 소스를 `--id`로 여러 번 설치하면 각각 별도 프로세스.
- 앱 연결 여부와 무관하게 실행: "Hooks run on the daemon while the plugin is enabled, even with no app connected."
- 정리: "Cleanup can be async. Release timers, watchers, sockets... Paseo also removes registrations, unmounts surfaces, rejects pending RPCs, closes the plugin's daemon session, and stops its subprocess on reload, disable, removal, disconnect, or daemon shutdown." 소스: `shutdown` 메시지 → 2s 후 SIGTERM → 2s 후 SIGKILL (`SOFT_SHUTDOWN_TIMEOUT_MS = 2_000`).
- 크래시: pending RPC를 `Plugin process exited: <id>`로 reject, 상태 `failed`; **자동 재시작 없음**(0.10.2 소스 확인) → `paseo plugin reload`.
- RPC 타임아웃: `REQUEST_TIMEOUT_MS = 30_000` (`Plugin RPC timed out: ...`).
- **Push 없음**: 플러그인 RPC는 request/response 뿐 (`plugin.rpc.invoke.request/response`). 프로토콜의 plugin 관련 push 이벤트는 `plugin_catalog_changed`, `plugin_settings_changed`뿐. 서버→클라이언트로 임의 스트림을 보낼 API 없음. 대안: 클라이언트 폴링(useQuery refetchInterval), agent 타임라인 append(agent 단위), 일반 SDK 이벤트(`paseo.observeEvents`, agents/workspaces list subscribe — Paseo 자체 이벤트용).
- 서버 핸들러는 `{ paseo }`(서브프로세스 소유 PaseoApi) 수신, Node API/child_process 사용 가능, stdout/stderr는 `paseo plugin logs`로 (500개/256KiB tail).

## d. useRpc + TanStack Query, 호스트 제공 모듈
- `export declare function useRpc<I, O>(contract: PluginRpcContract<I, O>): (input: ZodInput<I>) => Promise<ZodOutput<O>>;` "useRpc() returns a typed async function. Use TanStack Query for request state, caching, and mutations."
- QueryClient 제공됨: "Paseo owns the route, header, close action, host picker, error boundary, and query client." 소스: 설치(=host×plugin)마다 `queryClient: new QueryClient()` (기본 옵션), `QueryClientProvider`로 surface/panel/modal/popover 감쌈. "The selected host supplies the bundle, Paseo API, RPC transport, and query cache." 실제 `@tanstack/react-query` 런타임(^5.90.11)을 그대로 주입하므로 `useQuery({ queryKey, queryFn: rpcFn, refetchInterval })` 사용에 제약 없음 (문서상 금지/특별 언급 없음).
- 클라이언트 번들 허용 모듈(정확히 이것뿐): `@getpaseo/plugin`, `@getpaseo/plugin/client`, `@getpaseo/plugin/client/react-native`, `@getpaseo/plugin/client/ui`, `@tanstack/react-query`, `react`, `react/jsx-runtime`, `react-native`, `zod`. 그 외: `Module "<name>" is not available in plugin client code`. "Do not import lucide-react-native, react-native-svg, or DOM libraries." 아이콘은 이름 문자열 또는 `Icon` 컴포넌트.
- 서버 번들: `@getpaseo/plugin`, `/server`, `/server/provider`, `/server/acp`, `zod` + Node 내장 + 플러그인 디렉터리에 설치된 의존성.
- `client/`·`server/`·`shared/` 디렉터리 경계 강제 (루트에 코드 파일 두면 컴파일 에러, client에서 `node:` import 금지, DOM lib 제외).

## e. 멀티 호스트 (핵심)
문서 원문:
- "Plugins are installed per daemon. When the same contribution exists on several connected hosts, Paseo shows one sidebar item and adds a host picker. The selected host supplies the bundle, Paseo API, RPC transport, and query cache. Calls never fall through to another host when the selected host is offline."
- "Workspace panels and Command Center items stay scoped to the active host and exact cached context." / "Attachment sources remain scoped to each composer's host."
- Command Center: "`paseo` — Selected host's existing PaseoApi." / "`rpc(contract, input)` — Typed call to this installation's daemon-side plugin handler." / "Global items appear on the installation's selected host."
- Surface props: "`host` — Selected host `id` and display `label`." "`navigation` ... `openAgent({ agentId, serverId? })` and `openWorkspace({ workspaceId, serverId? })` open targets on `serverId`, or on the selected host when omitted."
- 다른 호스트: "Use `useHosts()` to display configured hosts and `getPaseoClient(serverId)` in an action callback to run SDK operations on one of them" / "`getPaseoClient(serverId: string): PaseoApi` borrows the host's authenticated app connection. Call it in client entry code or callbacks; it opens no socket and **does not require the plugin on the target daemon**." / "`useHosts(): readonly PluginHostSummary[]` includes offline hosts and updates when hosts, labels, or statuses change." / "Surface host selection changes — `usePaseo()` follows the selected host. An explicitly acquired API keeps its original target." / "Plugins are trusted app code; cross-host access is intentional."
- 0.10.2 타입:
```ts
export interface PluginHostSummary { readonly serverId: string; readonly label: string;
  readonly status: "idle" | "connecting" | "online" | "offline" | "error"; }
export declare function useHosts(): readonly PluginHostSummary[];
export declare function getPaseoClient(serverId: string): import("@getpaseo/client").PaseoApi;
```
결론:
1. 클라이언트 기여물의 대상 host = 그 기여물을 등록한 **설치(installation)의 host**. 앱은 플러그인이 설치된 host마다 클라이언트 번들을 따로 평가(`createPluginClientRuntime(installation, daemonClient)`)하고, `rpc`는 `client.invokePluginRpc(plugin.id, ...)`로 그 daemon에만 감.
2. **다른 host의 플러그인 RPC를 호출하는 공개 API는 없음.** `useRpc`/`client.rpc`에 host 인자 없음. `getPaseoClient(serverId)`가 주는 `PaseoApi`는 `{ dispose, observeEvents, terminals, workspaces, projects, agents, providers, config }`만 노출 — `invokePluginRpc`는 내부 `DaemonClient`에만 있고 PaseoApi에 없음. per-host query/useHosts+rpc 조합 API 없음.
3. 사이드바 host picker(0.10.2 `sidebar-items.tsx`/`surface-screen.tsx`): 같은 pluginId/sidebar id를 가진 설치들을 하나의 항목으로 묶음. 클릭 시 현재 경로의 host → 마지막으로 고른 host → 첫 host 순으로 대상 선택, 라우트 `/h/<serverId>/...`. picker는 해당 기여물이 2개 이상 host에 있을 때만 표시, 바꾸면 그 host의 번들/RPC/QueryClient로 surface 재마운트. 즉 **한 번에 한 host만** 보여줌.
4. Composer pill: 설치의 `serverId`로 필터링되므로 host A 설치가 등록한 pill은 host A agent에만 뜨고, 그 `client.rpc`/popover의 `useRpc`는 host A로 감 → **agent의 host로 RPC 호출됨** (각 host에 플러그인 설치 필요).
5. 단일 대시보드에서 여러 Mac을 집계하는 선택지:
   - (문서화됨, 제약 있음) host picker로 host별 화면 전환.
   - (문서화됨) `useHosts()` + `getPaseoClient(id)`로 다른 host의 표준 SDK 작업만 가능 (agents/workspaces 목록 등). 메트릭 수집용 표준 API는 없음; terminals.create + capture로 명령을 돌리는 건 가능하나 해킹성.
   - (비공식/취약) 앱은 각 설치 번들을 `globalThis.eval`로 같은 JS realm에서 실행 → 각 설치의 client entry가 `globalThis`에 자기 `client.rpc`를 등록하면 한 UI에서 모든 host RPC 호출 가능. 단 0.10.2 client context에는 자기 serverId가 없음(서버 RPC로 머신 ID를 받아 키로 쓰는 식 필요). 문서에 없는 동작이라 업데이트 시 깨질 수 있음.
   - (플러그인 밖) 뷰어 Mac의 플러그인 서버가 다른 Mac에서 직접(HTTP/SSH/Tailscale 등) 수집.

## f. Theme / layout / 아이콘
- `PluginTheme.colors` (readonly string): `surface0, surface1, surface2, border, foreground, foregroundMuted, accent, accentForeground, statusSuccess, statusWarning, statusDanger`. (`addTheme` 기여용 `PluginThemeColors`는 별개: `background, foreground, raised, control, border, accent?, mutedForeground, ring`.)
- `layout: { compact: boolean; platform: "ios" | "android" | "web" }` — "`layout.compact` ... `true` on mobile and narrow windows". 데스크톱 Electron도 `web`.
- 아이콘: Lucide 이름(PascalCase, lucide-react-native ^0.546.0 export 이름). 기여물 `icon`의 미지정 이름은 `Unknown Lucide icon` 에러로 등록 실패; `<Icon name>`은 미지정 시 아무것도 렌더 안 함. 예: `Cpu`, `MemoryStick`, `Gauge`, `Thermometer`, `Server`, `Activity`.

## g. Manifest / build / 설치·업데이트
- `paseo-plugin.json` 스키마(소스 `manifest.ts`, `.strict()`):
```ts
{ id: PluginIdSchema, description?: string(trim, min1), requirements?: { paseo: semver range }.strict(),
  build?: Array<Array<non-empty string>.min(1)>.min(1) }
```
  ID: `^[a-z][a-z0-9-]*`. `requirements.paseo` 생략 시 `<0.8.0`으로 간주되어 0.8+에서 거부. "Prerelease Paseo versions also satisfy a range their stable core satisfies". daemon은 install/build/load/startup/enable/reload 때 검사, 앱도 클라이언트 코드 평가 전에 자체 버전 검사("A compatible daemon does not make an older app compatible").
- `build`: "a list of non-empty argv arrays. Paseo runs each executable directly, without a shell, from the staged plugin directory... Install and update both run build before validation, compilation, activation, or replacement. A failing command reports its output, discards the candidate, and leaves the installed/running version intact." 실행파일 제한 없음 → `["swiftc", ...]`, `["/bin/sh","-c","..."]` 가능 (daemon 환경/PATH 상속, 출력 64KiB까지 로그).
- **로컬 디렉터리 설치는 build를 실행하지 않음** (소스 `index.ts installDirectory`: manifest 읽기→호환 검사→config 등록→start; `runPluginBuild`는 `installSource`(git/npm managed)와 update 경로에서만 호출). 디렉터리 플러그인은 제자리에서 로드(스테이징/복사 없음), `update`는 "Directory plugins are skipped; edit the directory and use reload". reload = 정지→cleanup→현재 소스 재컴파일→시작, build 미실행.
  - 로컬에서 swiftc를 돌리려면: (1) 수동 빌드 후 reload, (2) 로컬 git repo를 `file:///abs/repo` Git 소스로 설치 → build 실행됨(커밋된 HEAD 기준, 작업트리 아님; 문서: "`file://` selects Git acquisition, not directory installation."), (3) 서버 엔트리가 시작 시 child_process로 직접 컴파일/캐시.
- 소스 형식: 디렉터리(절대경로 권장, 앱은 `~` 미확장), `github:owner/repo`/`owner/repo`, `git:<url|scp>`, `npm:<name>[@sel]`, `:sub/path` 접미사. Git `--ref`는 최초 설치에만 적용.
- 업데이트: `paseo plugin update <id> [--check|--yes|--all|--version|--ref]` — npm은 `latest`의 더 새 버전만, Git은 원격 default HEAD(설치 selector 무시), 승인된 정확한 commit/artifact만 획득; 실패 시 이전 설치 유지. npm lifecycle script는 실행 안 함. 런타임 npm 의존성이 있는 Git 플러그인은 `"build": [["npm","ci","--omit=dev"]]` + lockfile 커밋.
- 전역 스위치 `pluginsEnabled`(config.json) + 플러그인별 enabled 둘 다 켜져야 running.

## h. 대시보드용 surface / panel API (0.10.2)
- `addSurface(id, Component: ComponentType<PluginSurfaceProps>)` + `addSidebarItem({ id, title, icon, surface })`: 전체 페이지 화면, 사이드바 항목, host picker 자동. 멀티호스트 대시보드에 가장 적합한 진입점 (워크스페이스 불필요).
- `addWorkspacePanel({ id, title, icon, context: "workspace"|"agent", locations?: ("workspace"|"explorer")[], Component })` — 워크스페이스 탭/Explorer; workspace/agent 컨텍스트 필수, 활성 host로 범위 제한.
- `addCommandCenterItem({ id, title, icon, keywords?, context: "global"|"workspace"|"agent", onSelect })` — global 항목에서 `openSurface` 가능.
- `addHeaderButton` (workspace 단위), `addSettingsScreen({ id, title, icon, Component })`, 설정 영속화 `defineSettings` + `server.registerSettings`/`useSettings` (폴링 주기·대상 host 설정 등에 활용 가능).
- 데이터 hook: `useWorkspace(id, selector)`, `useAgent(id, selector)` (캐시 기반, 선택 host), `usePaseo()`, `useHosts()`, `getPaseoClient()`, `openExternalUrl()`.

## 4. plugin-examples (getpaseo/paseo main = v0.10.2와 동일 목록)
agent-configuration, buttons, catppuccin, hosts, inline-thinking, lifecycle-actions, lifecycle-logger, linear, local-plugin, modal-ui, provider-acp-transformer, provider-direct, settings, timeline-items.
- 멀티호스트: `hosts` (id `host-agents`) — `useHosts()` 목록 + 클릭 시 `getPaseoClient(serverId).agents.list()`로 agent 수 표시. 플러그인 RPC 교차 호출은 없음.
- per-agent pill: `local-plugin` (agent 목록 구독 → 각 agent에 pill), `buttons` (header/pill의 action/menu/popover/update 데모).
- 폴링(`refetchInterval`/`setInterval`) 예제: 없음 (examples 전체 grep 결과 0건).
