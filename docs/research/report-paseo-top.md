# paseo-top: source analysis report

## Where the source is
- Log: `"pluginId":"top"`, `[top v0.4.0+a50ea39]`, node v24.20.0, pid 67471. No install-source line was found in daemon.log, and `~/.paseo/plugins/sources.json` is `{}`.
- `npm view paseo-top` returns 404. The real package is **`@xpufx/paseo-top`** (versions 0.4.0 to 0.4.4; 0.4.3 published 2026-09-24).
- The 0.4.3 tarball has `shared/version.ts = "0.4.0+a50ea39"`, which is exactly the string in the log. So the installed build was npm 0.4.3, and its version stamp is stale.
- GitHub: `xpufx/paseo-top` is archived (v0.3.0, standalone). Active development is in the monorepo `xpufx/paseo` under `plugins/top` (HEAD is 0.4.4, and the CPU/RAM code there is unchanged).
- Local copies:
  - 0.4.3 (analyzed): `/tmp/macmon-research/paseo-top/v043/package/`
  - Tarball: `/tmp/macmon-research/paseo-top/xpufx-paseo-top-0.4.3.tgz`
  - Old repo: `/tmp/macmon-research/paseo-top/repo/`
  - Monorepo sparse clone: `/tmp/macmon-research/paseo-top/mono/plugins/top/`
- Leftover from the plugin: `~/.paseo/top/pills/*.jsonc.example` (3 seeded templates). It was not removed when the plugin was uninstalled. I did not touch it.

## 1. Metrics
**CPU %** (`server/vendor/paseo-plugin-helper/system.ts`)
- Method: `os.cpus()` tick-delta. `total = user+nice+sys+idle+irq` and `active = Δtotal − Δidle`, summed over all cores. It rounds to 0.1.
- There is one module-global `defaultSampler = new CpuSampler()`, and each `getSystemMetrics()` call takes a sample.
- No timer: it samples per request, and the interval is "time since the last call by anyone". Callers include:
  - the `top.system-resources.get` RPC
  - per-turn telemetry (`collectTurnTelemetry`)
- Consequences:
  - The window shrinks or grows with traffic.
  - Concurrent callers steal each other's baseline.
  - The very first sample measures from module load.
- Log values seen: cpuPercent=12 and 19.

**RAM** is confirmed as `os.totalmem() - os.freemem()` (system.ts:103-105; resources.ts:364-367).
- Only Linux gets a correction (`/proc/meminfo MemAvailable`). macOS has no correction.
- The log shows `memPercent=100` and `99`. I checked live with node: 99% of 16 GB.
- Cause: on macOS, freemem is about "Pages free" only, and inactive, purgeable and cached pages count as used.

**Swap:** not collected anywhere. I grepped for swap, vm_stat, sysctl and memory_pressure and found nothing. For reference, `sysctl vm.swapusage` here shows 24.3G used of 25.6G.

**Thresholds** use `resolveMetricStatus(v, {warning, danger})`, which checks `>=`:

| Where | CPU warn / danger | MEM warn / danger |
|---|---|---|
| `client/pill.tsx:137-138` and `client/surface.tsx:49-50` | 60 / 85 | 70 / 85 |
| Turn timeline card (`client/telemetry.tsx:115-122`) | 70 / 85 | 75 / 90 |

- So "85% red" holds for the pill, modal and dashboard, but the timeline card uses different numbers.
- On Paseo 0.8+ button pills, the label is a plain string (`"12% · 15.9G"`), so the colors only show in the modal and legacy pills.

## 2. Architecture
**Server** (`index.server.ts`) handles these RPCs:
- `top.system-resources.get`. It is wrapped in `guardRpcHandler`: 5s timeout, maxInflight 4, and it serves the last good snapshot when saturated. Warnings are rate-limited to one per minute.
- settings `get` / `update` / `reset`, via `topSettingsContract` and `PluginStorage("top","settings.json")`
- `top.custom-pills.get`, `.list`, and `runCustomPillModalCommand`

Polling is driven by client requests. The server has no metric timer and no cache except for the MCP-plugin state, which has a 30s TTL and single-flight.

Server timers and child processes:
- `CustomPillPoller` runs a `setTimeout` chain per user `.jsonc` pill (`spawn(..., {shell:true})`). It starts at plugin load whether or not a client is watching.
- `git rev-parse` fallback (1.5s timeout).
- `git diff --shortstat` on every turn start and end.
- `paseo plugin ls --json`: a full node CLI startup (about 120MB according to their comment), cached for 30s.

Events:
- `agent.turn_started`, `agent.turn_ended` and `agent.created` lead to `agents.ref(id).refresh()` (with 150ms and 250ms retries) and then `timeline.append({type:"plugin", kind: TOP_TIMELINE_KIND})`.
- Cleanup returns a function that calls `poller.stop()`, clears the maps and unsubscribes all three events.

**Client polling:**
- React Query `useAutoRefreshQuery(getSystemResourcesRpc, {directory})` with `defaultRate:"5s"` and `staleTime:2500`. The key is shared per workspace directory.
- Button-host labels use their own module-level TTL cache (2.5s) with single-flight per scope (`liveSnapshotFor`, pill.tsx ~252-300). The shared label timer runs every 3s.
- Custom pills: discovery every 15s, label TTL 3s.

## 3. UI
- Registration goes through vendored `registerComposerPill` (`client/vendor/paseo-plugin-helper/pill.tsx:246-862`):
  - `client.paseo.agents.subscribe(update => remove→removePill / agent→addPill(id, workspaceId))`
  - plus an initial `agents.list()`.
  - That means one `client.addComposerPill({id, workspaceId, agentId, button:{...}})` per agent.
- Host shape detection: it registers a throwaway probe pill with a `button` field. If that throws, it falls back to legacy `{Component, onPress}`.
- **Visibility gating:** `button.icon` is a React component (`PillVisibilityIcon`) whose mount and unmount count visible pills. One shared `setInterval` (`refreshIntervalMs`) calls `resolveLabel` only for visible agents and pushes `registration.update({label})` only when the label changed.
- On press, `presentation:"centered"` toggles a per-agent `centeredOpenAgents` set. The host `<Modal>` is rendered inside the icon component, kept outside React state so it survives remounts, and stops event bubbling. The alternative is `kind:"popover"`.
- The modal is `ResourceModal` with tabs: system, context (branch/worktree/agent ID), settings and about.
- Other contributions:
  - Sidebar surface "Top Dashboard"
  - Timeline renderer (turn telemetry card)
  - Agent workspace panel "Turn Counter" plus a command-center item
- Pill modes:
  - cycle: one pill that rotates through segments
  - all: one combined label
  - multiple: one pill per metric
  - custom shell pills
- **Multi-host:**
  - `client.rpc` goes to the plugin's own daemon only.
  - The "fleet" view (`useHosts()` + `getPaseoClient(serverId)`, 15s cadence, 4s timeout, one probe in flight per host) shows only agent and workspace counts. Their comment says: "SDK exposes no host-metrics RPC on a borrowed host client (0.9.0/0.9.2)".
  - `rpcInvoker` is a module global, and `liveContributionCleanup` makes the last mount win.

## 4. Manifest and config
- `paseo-plugin.json`: `{"id":"top","requirements":{"paseo":">=0.9.0"}}`
- `package.json`:
  - name `@xpufx/paseo-top`, version 0.4.3, no runtime dependencies (the helper is vendored into `client/`, `server/` and `shared/vendor`)
  - devDependencies: `@getpaseo/plugin ^0.9.0`, react 19.1.0, react-native 0.81.5, zod ^4.4.3, @tanstack/react-query ^5.90.11
  - `files` lists `index.client.tsx`, `index.server.ts`, `client`, `server`, `shared`, `examples`
- tsconfig is not in the tarball. The monorepo version: target ES2020, module ESNext, moduleResolution Bundler, jsx react-jsx, strict, noEmit, plus `paths` to the monorepo helper.
- Entry points: `index.server.ts` (`contribute(server: PluginServerContext)`) and `index.client.tsx` (`contribute(client: PluginClientContext)`, which calls `initClientHelpers({Icon, Modal, useRpc, ...})` from `@getpaseo/plugin/client/react-native`).

## 5. Per-process top lists
**None.** There is no ps, top or libproc, and no per-process CPU/RAM. "top" is only the name.
- The only extensible path is user custom pills: a shell `command` per `intervalMs` plus a modal `command` that runs when the modal opens (for example `docker ps`, `df -h`).
- Cost: one `/bin/sh` spawn per pill per interval, and the timers run even with no viewer.

## 6. Reuse vs avoid
**Reuse:**
- Visibility-gated shared label timer: poll only agents whose pill icon is mounted (pill.tsx:346-378).
- Single-flight plus TTL cache keyed by host or scope, not by agent (`liveSnapshotFor`; `getMcpPluginState` in resources.ts:195-216).
- `guardRpcHandler` with maxInflight, timeout, serve-stale and rate-limited warnings (index.server.ts:40-66).
- Push `registration.update({label})` only on change. Keep the entry static while a popover is open, because rewriting it remounts the popover.
- Selective `fields` input on the RPC so callers fetch only what they need.
- Last-mount-wins guard for duplicate client mounts.

**Avoid / pitfalls:**
- **RAM = totalmem − freemem on macOS** always reads about 99%. Use vm_stat as `(active + wired + compressed) * pagesize`, or `memory_pressure` / `host_statistics64`. Also add `sysctl vm.swapusage`.
- **Global CPU sampler sampled per call:** the window is not fixed, and different callers interfere. Better: one server timer (for example 2s) that samples ticks into a cached snapshot, with RPCs reading the cache.
- Custom-pill poller starts at load regardless of viewers (`void customPillPoller.start()`).
- Shelling out to the `paseo` CLI from inside a plugin is a heavy node startup.
- Stale version stamp: the package is 0.4.3 but the stamp says 0.4.0, which confuses diagnosis.
- Thresholds are inconsistent between pill (85/85) and timeline card (85/90).
- Plain-string button labels lose the color tone.
- Seeds `~/.paseo/top/pills` and never cleans it up.
- Remote-host metrics are not possible through the borrowed client. Each daemon must run the plugin itself.
- `fs.F_OK` DeprecationWarning shows in the log.
