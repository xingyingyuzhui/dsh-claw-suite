# Claw 侧栏入口与 Session 隔离：代码级修复计划

> 状态：待执行，设计已收敛  
> 基线日期：2026-09-29  
> 主验收面：DeepSeek Harness Desktop `0.2.0-rc.2`  
> 官方契约基线：`dsh-v0.2.0-rc.2`  
> 当前 Claw Registry：`dsh-claw-registry@0.3.0-rc.1`  
> 适用目录：`plugins/dsh-claw-suite/dsh-claw-registry/` 与 `deepseek-harness-desktop-official/`  
> 优先级：P0（产品信息架构错误 + Session 归属错误）

本文是本问题的执行规格，不只是方向说明。它取代
`DSH_CLAW_DESKTOP_RC2_ITERATION_PLAN.md` 中“Workspace 保留 Claw session、Claw panel 作为第二入口”的决定；其余安全、打包和双端验收要求仍然有效。

---

## 1. 修复后的产品契约

本轮必须同时交付以下结果，缺一项都不能称为修复完成：

1. 展开侧栏时，`工作区` 与 `Claw区` 是同一会话浏览区域标题中的两个相邻切换按钮。
2. Claw 不再出现在“插件”下面的全局面板列表中，也不再打开一个独立主页面。
3. `工作区` 只显示普通 Workspace 和普通 Session。
4. `Claw区` 只显示 Registry 明确登记的 Claw Agent、已绑定 Session，以及需要人工处理的 Claw 工作区待归属 Session。
5. 同一个 Session 不得同时出现在两个区。
6. 两个区只隔离“列表投影”，不复制、不移动、不篡改 DSH 的 Session 日志；官方 Host store 仍是完整权威数据源。
7. 切换分区不关闭当前对话，不改变当前模型、preset 或运行状态。
8. 新建 Claw Session 必须在打开前完成：指定 `wa-*` preset、持久化 session→agent 绑定、应用默认模型；模型应用失败时必须留下可恢复的“部分创建”状态。
9. 插件卸载或热禁用后，官方 Workspace 浏览器恢复显示完整权威列表，不丢 Session。
10. Web 和 Desktop 使用同一份 Client bundle 和同一套隔离语义；Desktop 是发布阻断验收面。

### 1.1 “隔离”的精确定义

隔离分为三层，不能再用一个 workspace 路径推断同时替代三层：

| 层 | 权威依据 | 作用 |
|---|---|---|
| UI 分区 | Workspace Browser mode 的 claim 集合 | 保证列表不重复、搜索不泄漏 |
| Agent 归属 | Registry v2 的显式 `sessionBindings` | 决定 Session 属于哪个 Claw Agent |
| 安全分类 | 显式绑定 + `wa-*` header + `DSclaw` 路径的三态 classifier | 对不确定 Claw Session fail closed |

一个 Session 可以因为位于 Claw workspace 而被 UI 从“工作区”隐藏，但在没有显式绑定前，它只能进入“待归属”，不能自动获得某个 Agent 的身份、记忆或策略。

---

## 2. 当前问题的代码结论

### 2.1 入口位置错误是注册 seam 选错，不是 CSS 问题

当前 `registry-panel.mjs` 同时注册：

```js
slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, Page))
slots.inject('sidebar.panellist', () => slots.register({
  name: 'sidebar.panellist',
  id: PANEL_ID,
  order: 25,
}, Icon))
```

`sidebar.panellist` 在官方 `ui-sidebar` 中的定义就是“全局主面板图标列表”。官方 `SidebarRoot` 的渲染顺序是：品牌、新会话、全局 panel rows、`sidebar.workspaces`、设置。因此截图中 Claw 出现在“插件”下面、“工作区”上面，是当前代码的必然结果。

结论：删除 `sidebar.panellist`/`main` 注册并改样式不能单独完成目标；Claw 必须成为 Workspace Browser 内部的模式，而不是 Main Panel。

### 2.2 Session 没隔离是数据模型错误

当前绑定函数是空实现：

```js
export async function persistSessionBinding(_info) {
  // Intentionally empty: session↔agent binding is derived from workspace membership.
}
```

同时 `registry-store.mjs` 的 `projectAgent()` 把官方 workspace 下所有 Session 都投影给 Agent：

```js
sessionIds: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.slice() : []
```

这会产生两个错误：

- Claw Session 仍留在官方 Workspace 树中，形成双入口。
- 只要普通 Session 落在 Claw workspace，就会被静默认作该 Claw Agent 的 Session，即使它没有 `wa-*` preset、没有绑定记录。

结论：必须把“workspace 包含哪些 Session”和“Agent 拥有哪些 Session”拆成两个字段，前者只用于 UI claim/诊断，后者只认显式 binding。

### 2.3 现有绿测没有覆盖生产行为

当前 `npm test` 可通过，但 `test/client-bundle.test.mjs` 明确要求生产 bundle 不含旧隔离实现：

```js
assert.doesNotMatch(src, /function isolateWorkspaceSnapshot/)
assert.doesNotMatch(src, /function wrapWorkspaceList/)
assert.doesNotMatch(src, /new MutationObserver/)
```

另一方面，`test/registry-store.test.mjs` 仍在测试 `legacy/registry-sidebar.mjs`、`legacy/registry-isolate.mjs` 等不进入 `client.js` 的代码。于是“隔离测试通过”并不能证明 Desktop 实际 bundle 有隔离能力。

修复后必须建立 bundle→正式 seam→Desktop 行为的同一条证据链，禁止用 legacy 单测充当发布门禁。

### 2.4 README 与当前实现互相矛盾

README 已声明：

- 普通项目留在“工作区”；
- 左侧标题为“工作区 / Claw区”两个按钮；
- 只有在 Claw 区显式创建的 Agent 才进入 Claw 区。

当前 bundle 却实现了全局 Panel + Workspace 全集双入口。此次修复以 README 描述和本计划 §1 为产品真相，代码与测试向它对齐。

### 2.5 “复制会话 ID”被重复注册

Desktop 当前同时启用了：

- `dsh-claw-registry@0.3.0-rc.1`；
- `dsh-chat-tune@0.5.1`（由它提供通用的复制 ID、导出 Markdown、删除会话）。

`registry-session-actions.mjs` 又无条件向
`sidebar.workspaces.session.menu.item` 注册 `dsh-claw-registry-copy-id`，并向
`sidebar.workspaces.session.row.action` 再注册一个 `ID` hover 按钮。这里有两个独立错误：

1. `CopySessionIdItem` 没有调用 `api.isBoundSession(sessionId)`，因此普通 Session 也会出现 Claw 的复制项；
2. 组件使用无 class 的裸 `<button role="menuitem">`，没有采用官方菜单组件/样式，所以显示成截图里的矩形边框按钮。

下方带复制图标、与“导出 Markdown / 删除会话”同组的项目来自 `dsh-chat-tune`；上方无图标的重复项目来自 Claw Registry。

这不是通过 label 去重可以解决的问题。能力所有权必须固定为：

| 能力 | 唯一 owner |
|---|---|
| 复制 Session ID | `dsh-chat-tune`（未安装时允许没有该便利功能） |
| 导出 Markdown | `dsh-chat-tune` |
| 永久删除 Session | `dsh-chat-tune` |
| Claw Session 打开/创建/修复 | `dsh-claw-registry` 的 Claw Browser mode |

Claw Registry 不得探测其他插件是否安装后再条件注册通用动作，也不得扫描菜单文字做运行时去重；它应直接删除不属于 Registry 领域的通用 Session 操作。

---

## 3. 官方 `0.2.0-rc.2` 的能力缺口

官方源码已经确认：

- `sidebar.panellist`：全局 panel 导航，不能用于 Workspace 标题旁的分区按钮；
- `sidebar.workspaces`：`single` slot，`ui-workspace` 独占整个工作区浏览区域；
- `WorkspaceBrowser.tsx` 自己持有标题、搜索、视图选项、添加 Workspace、列表和对话框；
- 可扩展的子 slot 只有目录选择、Session row leading/hover/menu/action；
- 没有 header tab、mode、filter 或 partition API；
- `ctx.workspaces` 提供官方 Host 权威列表，不提供第三方视图过滤器。

因此，在不改官方 seam 的前提下，插件只有三种选择：

| 方案 | 能否达到目标 | 风险 | 决策 |
|---|---:|---|---|
| 给 `ui-workspace` 增加通用 Browser Mode seam | 是 | 需要官方小型 PR 和新版本 | **采用** |
| Claw 抢占整个 `sidebar.workspaces` 并复制官方浏览器 | 理论上可以 | 复制大量官方逻辑，升级极易漂移 | 拒绝 |
| 恢复 DOM/React fiber monkey patch | 短期看似可以 | 结构变更即静默失效，HMR/卸载残留 | 拒绝进入正式版本 |

这意味着：`0.2.0-rc.2` 可以完成数据层和测试准备，但**完整 UI 修复的兼容地板必须提升到包含 Browser Mode seam 的下一官方版本**。在官方版本号产生前，计划中记作 `<MODE_SEAM_VERSION>`；发布时必须替换为真实 exact/minimum semver，不能保留占位符。

---

## 4. 目标架构

```text
Host authoritative stores
  workspaceRegistry ──────────────┐
  sessionController.inspect() ────┼──> dsh-claw-registry Host
                                  │       ├─ Registry v2 / revision
                                  │       ├─ sessionBindings
                                  │       ├─ repairQueue
                                  │       └─ claims snapshot
                                  │
                                  └──> official Client workspaces/sessions
                                                │
                      uiWorkspace BrowserMode seam
                          ┌─────────────────────┴────────────────────┐
                          │                                          │
                    工作区 mode                                  Claw mode
              official snapshot - claims             agents + bindings + pending
              official renderer/actions              Claw sidebar renderer/actions
```

核心原则：

- Host store 不删数据；Browser Mode 只做可逆投影。
- claim 只解决“显示在哪”，binding 才解决“属于谁”。
- Claw 插件卸载时 disposer 删除 mode 和 claims，官方全集立即恢复。
- 不再依赖 DOM 文本、类名、React fiber 或函数 monkey patch。

---

## 5. 官方 DSH 改动：Workspace Browser Mode seam

建议单独提交官方 PR：`feat(ui-workspace): add partitioned browser modes`。

### 5.1 公共类型

在 `packages/client/ui-workspace/src/client/contract/` 增加 `modes.ts`，定义：

```ts
import type { ComponentType } from 'react'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface WorkspaceBrowserClaims {
  readonly workspaceIds: readonly WorkspaceId[]
  readonly sessionIds: readonly SessionId[]
}

export interface WorkspaceBrowserModeProps {
  readonly wide: boolean
  readonly active: boolean
}

export interface WorkspaceBrowserModeDefinition {
  readonly id: string
  readonly order?: number
  readonly label: () => string
  readonly claims: HostObservable<WorkspaceBrowserClaims>
  readonly component: ComponentType<WorkspaceBrowserModeProps>
  /** Top-level “新会话” when this custom mode is active. */
  readonly startSession?: () => void | Promise<void>
}

export interface WorkspaceBrowserModeSnapshot {
  readonly activeId: 'workspace' | string
  readonly modes: readonly WorkspaceBrowserModeDefinition[]
  readonly claimedWorkspaceIds: ReadonlySet<WorkspaceId>
  readonly claimedSessionIds: ReadonlySet<SessionId>
  readonly conflicts: readonly {
    kind: 'workspace' | 'session'
    id: string
    owners: readonly string[]
  }[]
}
```

在 `UiWorkspace` 公共接口增加：

```ts
interface UiWorkspace {
  readonly browserModes: HostObservable<WorkspaceBrowserModeSnapshot>
  registerBrowserMode(definition: WorkspaceBrowserModeDefinition): () => void
  selectBrowserMode(id: 'workspace' | string): void
  startSession(workspaceId?: WorkspaceId): void
}
```

### 5.2 Mode store

新增 `packages/client/ui-workspace/src/client/browser-modes.ts`，职责限定为：

1. 注册、排序、卸载 mode；
2. 订阅每个 mode 的 `claims`；
3. 聚合 claimed workspace/session ID；
4. 持久化 `activeId`，建议 key `dsh.workspace.browser-mode.v1`；
5. mode 卸载时若它正在激活，原子回退到 `workspace`；
6. locale 变化时重新读取 `label()`；
7. 发现重复 claim 时产生冲突诊断。

冲突规则必须确定，不得依赖注册时序：

- owner 按 `order` 升序、再按 `id` 字典序决定；
- 官方 `workspace` mode 隐藏所有被 claim 的项目，避免重新出现双入口；
- 自定义 mode 只获得自己有效拥有的 claim；
- 重复 claim 写 `console.warn` 并暴露在 `conflicts`，供 E2E 和诊断页读取。

### 5.3 WorkspaceBrowser 改造

修改：

- `packages/client/ui-workspace/src/client/index.ts`
- `packages/client/ui-workspace/src/client/navigation.ts`
- `packages/client/ui-workspace/src/client/stores.ts`
- `packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx`
- `packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.module.css`
- `packages/client/ui-workspace/src/client/contract/slots.ts`（导出新 props/type）

具体行为：

1. `sectionLabel` 改成语义正确的 tablist：

```tsx
<div role="tablist" aria-label={t('browser.mode')} className={css.modeTabs}>
  <button role="tab" aria-selected={activeId === 'workspace'}>
    {groupBy === 'flat' ? t('section.sessions') : t('section.workspaces')}
  </button>
  {modes.map(mode => (
    <button key={mode.id} role="tab" aria-selected={activeId === mode.id}>
      {mode.label()}
    </button>
  ))}
</div>
```

2. `activeId === 'workspace'` 时继续渲染官方浏览器，但输入先经过纯函数过滤：

```ts
export function projectOfficialWorkspaceSnapshot(
  snapshot: WorkspaceSnapshot,
  claims: WorkspaceBrowserClaims,
): WorkspaceSnapshot
```

过滤必须覆盖：

- workspace/tree 分组；
- flat Session 模式；
- archived filter；
- search results；
- 手工排序 account；
- 计数、空态和拖拽目标。

3. 自定义 mode 激活时不挂载官方列表、搜索、视图选项和“添加 Workspace”按钮，只渲染对应 `component`。这样官方 renderer 不会在后台保留可交互的重复 Session row。
4. 切回 `workspace` 时官方 store、展开状态和排序状态原样保留。
5. 折叠侧栏不显示文字 tab；mode 选择保持不变，展开后恢复。首版不在 48px rail 上塞第二套图标，避免误触和布局抖动。

### 5.4 顶部“新会话”的模式语义

`ui-sidebar` 的顶部“新会话”调用 `uiWorkspace.startSession()`。`UiWorkspaceService.startSession()` 必须调整：

```ts
startSession(workspaceId?: WorkspaceId): void {
  if (workspaceId === undefined) {
    const mode = this.browserModes.activeMode()
    if (mode?.startSession !== undefined) {
      void mode.startSession()
      return
    }
  }
  this.startOfficialSession(workspaceId)
}
```

否则用户在 Claw Session 中点击顶部“新会话”时，官方“继承当前 Workspace”逻辑会创建一个没有 `wa-*` preset 的 Session，再次污染归属。Claw mode 的 `startSession` 首版行为为：

- 只有一个 Agent：直接走该 Agent 的 Claw 创建流程；
- 多个 Agent：聚焦 Claw 区的 Agent 选择/创建控件，不偷偷选最近 Agent；
- 没有 Agent：聚焦“新建 Claw Agent”。

显式调用 `startSession(workspaceId)` 仍走官方逻辑，不被 mode override。

### 5.5 官方单元测试

新增/修改测试至少覆盖：

- mode 注册、排序、卸载和 active fallback；
- locale 切换后 tab label 更新；
- claims 动态更新后 Workspace/flat/search 同步过滤；
- 自定义 mode 激活时官方 browser 不挂载；
- 卸载 mode 后完整列表恢复；
- 重复 claim 的确定性 owner 和诊断；
- 顶部“新会话”在 custom mode 走 override，显式 workspaceId 不走 override；
- `role=tablist/tab`、键盘左右切换、focus ring；
- collapsed→expanded 后 active mode 不丢失。

### 5.6 官方 seam 验收门禁

只有以下条件全部成立，Claw UI PR 才能合并：

- 官方 tag/commit 已包含该 seam；
- Desktop 包含同一 commit 或更高版本；
- Client bundle 的公共类型与运行时方法同版本；
- Claw 的 peerDependency 已提高到 `<MODE_SEAM_VERSION>`；
- 在旧版 Host 上缺少 `registerBrowserMode` 时，Client 明确显示“不兼容”，不得静默回退到全局 panel。

---

## 6. Registry v2：显式 Session 绑定

### 6.1 新 schema

修改 `registry-store.mjs`，将固定写死的 `version: 1` 升为 schema v2，并引入单调递增 revision：

```json
{
  "version": 2,
  "revision": 17,
  "main": { "agentId": "main", "createdAt": "..." },
  "settings": { "leaveBehind": "archive" },
  "agents": {
    "wa_a": {
      "agentId": "wa_a",
      "workspaceId": "workspace-a",
      "dshPreset": "wa-a",
      "canonicalRoot": "/.../.dsh/DSclaw/a",
      "status": "active"
    }
  },
  "sessionBindings": {
    "session-123": {
      "sessionId": "session-123",
      "agentId": "wa_a",
      "workspaceId": "workspace-a",
      "presetId": "wa-a",
      "state": "ready",
      "source": "create",
      "createdAt": "...",
      "updatedAt": "..."
    }
  },
  "repairQueue": {
    "session-legacy": {
      "sessionId": "session-legacy",
      "workspaceId": "workspace-a",
      "suggestedAgentId": "wa_a",
      "reason": "missing-preset-evidence",
      "evidence": ["workspace-membership", "cwd-match"],
      "createdAt": "..."
    }
  }
}
```

约束：

- 一个 `sessionId` 最多一个 binding；
- binding 指向的 Agent 必须存在；
- binding 的 `workspaceId` 必须等于 Agent 的 `workspaceId`；
- `presetId` 必须等于 Agent 当前 `dshPreset`；
- `state` 只允许 `provisioning | needs_model | ready`；
- `repairQueue` 不是 Agent 归属，不得被 identity/memory/policy 当成 binding；
- 每次成功写入 `revision + 1`；
- `saveRegistry()` 继续临时文件 + rename 原子写，不能原地覆盖。

### 6.2 Store API

在 `registry-store.mjs` 增加纯函数：

```js
normalizeSessionBinding(raw, sessionId)
bindSession(registry, input, now)
markBindingState(registry, sessionId, state, now)
unbindSession(registry, sessionId, now)
queueSessionRepair(registry, candidate, now)
resolveSessionRepair(registry, sessionId, agentId, now)
bindingsForAgent(registry, agentId)
bindingForSession(registry, sessionId)
```

所有 mutator 返回 `{ registry, ...result }`，由 Host 统一做 revision compare-and-swap 与落盘。纯函数不直接读文件，便于穷举测试。

### 6.3 修正投影

将：

```js
projectAgent(agent, workspace)
```

改为：

```js
projectAgent(agent, workspace, sessionBindings)
```

其中：

```js
const bindings = bindingsForAgent(sessionBindings, agent.agentId)
sessionIds = bindings.map(row => row.sessionId)
sessionCount = bindings.length
```

禁止再次从 `workspace.sessionIds` 生成 Agent 归属。

`agentForSession(projected, sessionId, session)` 也必须改成：

1. 首选显式 binding map；
2. 不再用 `cwd === canonicalRoot` 返回 Agent；
3. 路径只能返回 `claw-uncertain` 分类，不能返回 Agent 身份。

### 6.4 Claims 快照

`/api/dsh-claw/registry/list` 返回：

```ts
interface RegistryListResponse {
  revision: number
  agents: ProjectedAgent[]
  bindings: SessionBinding[]
  pending: RepairCandidate[]
  claims: {
    workspaceIds: string[]
    sessionIds: string[]
  }
}
```

claim 计算规则：

- `workspaceIds`：所有 active、workspacePresent 的 Claw Agent workspace；
- `sessionIds`：显式 binding session + 上述 workspace 当前包含的全部 session；
- archived Agent 是否 claim 由 leave-behind 结果决定，不允许仅凭 registry status 猜测；
- 数组排序稳定，避免每次 poll 都触发 React 重渲染。

把 Claw workspace 内的未绑定 Session 放入 claim 是为了避免它从官方搜索/flat list 泄漏；它在 Claw 区显示为“待归属”，不是自动成为 Agent Session。

---

## 7. Host API 与创建事务

### 7.1 Host 依赖

`host.js` 的 `inject` 增加 `sessionController`：

```js
export const inject = [
  'connection',
  'workspaceRegistry',
  'agentPresets',
  'settings',
  'sessionController',
]
```

使用 `sessionController.inspect(sessionId)` 读取持久化 header，不激活 Agent。禁止为了验证绑定而 resume Session。

### 7.2 绑定路由

新增 POST 路由：

```text
/api/dsh-claw/registry/session/bind
/api/dsh-claw/registry/session/state
/api/dsh-claw/registry/session/adopt
```

`bind` 请求：

```json
{
  "sessionId": "session-...",
  "agentId": "wa_a",
  "workspaceId": "workspace-a",
  "presetId": "wa-a",
  "expectedRevision": 16,
  "source": "create"
}
```

Host 写入前依次验证：

1. revision 相等，否则 409；
2. Agent 存在且 active；
3. workspace 与 Agent 一致且仍存在；
4. `sessionController.inspect()` 得到的 `meta.cwd` 与 `canonicalRoot` 规范化后相等；
5. `meta.agentPreset === dshPreset`；
6. 官方 workspace membership 已包含该 Session；
7. 若已有 binding，只有 payload 完全相同才幂等成功，否则 409。

成功响应返回最新 `{ revision, binding }`。

`adopt` 只用于 repairQueue；即使用户点击确认，Host 仍要求 preset/cwd 证据满足。缺 `wa-*` preset 的旧 Session 不允许伪造绑定，应提示“以普通会话保留/重新创建 Claw 会话”。

### 7.3 新建 Claw Session 的顺序

当前顺序是 create→selectModel→空绑定→open。目标顺序改为：

```js
const sessionId = `session-${crypto.randomUUID()}`

// 1. caller-owned id 使网络重试保持幂等
const created = unwrapRemote(await ctx.remote.session.create({
  workspaceId: agent.workspaceId,
  sessionId,
  agentPreset: agent.dshPreset,
}))

// 2. 验证官方实际采用了目标 preset
if (created.agentPreset !== agent.dshPreset) {
  throw partialCreateError({ sessionId, stage: 'verify-preset' })
}

// 3. 先持久化归属；模型失败时 Session 仍可被找回
let result = await post('/api/dsh-claw/registry/session/bind', {
  sessionId,
  agentId: agent.agentId,
  workspaceId: agent.workspaceId,
  presetId: agent.dshPreset,
  expectedRevision,
  source: 'create',
})

// 4. 应用创建时默认模型
try {
  if (agent.model) {
    unwrapRemote(await ctx.remote.session.selectModel({ sessionId, ...agent.model }))
  }
  result = await post('/api/dsh-claw/registry/session/state', {
    sessionId,
    state: 'ready',
    expectedRevision: result.revision,
  })
} catch (cause) {
  await post('/api/dsh-claw/registry/session/state', {
    sessionId,
    state: 'needs_model',
    expectedRevision: result.revision,
  })
  throw partialCreateError({ sessionId, stage: 'select-model', cause })
}

// 5. list reconciliation 后再打开
await ctx.sessions.refresh()
await loadProjected()
ctx.uiWorkspace.openSession(sessionId)
```

关键变化：binding 在模型选择之前落盘。模型失败不是“丢失的 Session”，而是 Claw 区内可见、可重试的 `needs_model` Session。

### 7.4 错误码

新增稳定错误码，UI 不解析 message：

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `REGISTRY_BIND_INVALID` | 字段或状态非法 |
| 404 | `REGISTRY_AGENT_NOT_FOUND` | Agent 不存在 |
| 404 | `REGISTRY_SESSION_NOT_FOUND` | Session 无法 inspect |
| 409 | `REGISTRY_REVISION_CONFLICT` | 客户端快照过期 |
| 409 | `REGISTRY_BIND_CONFLICT` | Session 已绑定另一 Agent |
| 409 | `REGISTRY_WORKSPACE_MISMATCH` | cwd/membership/workspace 不一致 |
| 409 | `REGISTRY_PRESET_MISMATCH` | header preset 不是目标 `wa-*` |
| 500 | `REGISTRY_BIND_SAVE_FAILED` | 原子落盘失败 |

revision 冲突时 Client 自动 reload 一次；涉及用户选择的 adopt 不自动重放，重新展示确认。

---

## 8. Claw Client 改造

### 8.1 文件拆分

删除生产路径中的 `registry-panel.mjs`，替换为：

```text
registry-browser-mode.mjs   # mode 注册、claims observable、dispose
registry-claw-browser.mjs   # Claw 侧栏 React 组件
registry-bindings.mjs       # binding/pending 的纯 Client 投影
registry-navigation.mjs     # create/open/fork/archive；调用真实 bind API
```

保留设置页和必要的 Claw 标记；删除 Registry 的通用 Session menu/row action。Session 打开、修复和创建都由 Claw Browser mode 自己的 row/action 承担。

`scripts/build-client.mjs` 的 active source 顺序同步更新；生成的 `client.js` 只能由 `npm run build` 产生，禁止手改。

### 8.2 注册代码

`registry-client-apply.mjs` 不再调用 `registerClawPanel()`，而是：

```js
const claimsStore = createClaimsStore(() => projected && projected.claims)
const ClawBrowser = createClawBrowser(React, shared)

if (!ctx.uiWorkspace
  || typeof ctx.uiWorkspace.registerBrowserMode !== 'function') {
  registerIncompatibleNotice(ctx, React, t)
  return
}

const stopMode = ctx.uiWorkspace.registerBrowserMode({
  id: 'dsh-claw',
  order: 100,
  label: () => t('zoneClaw'),
  claims: claimsStore,
  component: ClawBrowser,
  startSession: () => shared.requestClawSession(),
})
```

dispose 时必须：

1. `stopMode()`；
2. 停止 locale/session/list 订阅；
3. 清理 timer；
4. 移除 style/body attr；
5. 不改官方 workspace/session store。

### 8.3 Claw 侧栏结构

Claw mode 是 sidebar browser，不再使用 `.dar-page`、`<h1>` 或 Main Panel 布局。结构建议：

```text
[ + 新建 Agent ] [刷新]
Agent A                         [+]
  ● Session title                         2分
  ● Session title                         昨天
  ! 待归属 Session                        修复
Agent B                         [+]
  空
```

行为要求：

- Agent row 展开状态单独持久化；
- Session 标题、运行态、归档态和时间来自官方 `ctx.sessions.list` snapshot；
- Registry 只提供归属，不复制 Session 元数据；
- Session row 点击仍调用 `ctx.uiWorkspace.openSession(sessionId)`；
- 每个 Agent 的 `+` 走 §7.3；
- `needs_model` 显示明确警告与“重试模型”动作；
- repairQueue 显示证据和可执行动作，不静默自动绑定；
- locale 在 render 时读取，不能在 apply 时冻结；
- 搜索若本轮实现，必须只过滤当前 Claw 投影；不得调用未过滤的官方 search 后直接展示结果。

### 8.4 工作区 tab 的显示规则

官方 mode 使用 claims 后：

- 整个 active Claw workspace 从 workspace/tree 分组消失；
- 它的所有 Session 从 flat/search/archived 结果消失；
- 显式绑定到 Claw、但 workspace 尚未同步的 Session 也按 sessionId 消失；
- 普通 workspace 即使标题、slug 与 Claw Agent 同名，也不能被隐藏；
- 禁止再用标题文本、目录 basename 或 DOM label 作为 UI claim 主键。

### 8.5 删除重复的通用 Session actions

`dsh-claw-registry` 不负责通用 Session 工具。本轮执行以下删除：

1. 删除 `registry-session-actions.mjs`，不再注册：
   - `dsh-claw-registry-copy-id` menu item；
   - `dsh-claw-registry-copy-id` row action；
   - `dsh-claw-registry-open-claw` menu item。
2. 从 `registry-client-apply.mjs` 删除：
   - `registerSessionActions` import；
   - `copySessionId()`；
   - `shared.copySessionId`；
   - `stopActions` 注册和 dispose。
3. 从 `registry-i18n.mjs` 删除只被这些旧 action/legacy UI 使用的生产文案：
   - `copySessionId`、`copiedSessionId`；
   - `exportMd`；
   - `deleteSession`、`deleteTitle`、`deleteBody`。
4. 从 `scripts/build-client.mjs`、`package.json#files` 和 `ACTIVE_SOURCES` 删除
   `registry-session-actions.mjs`。
5. 重新生成 `client.js`；不得直接修改生成文件。

删除 `openInClaw` 是刻意行为：完成唯一分区后，Claw Session 不再出现在官方 Workspace row 菜单中；在 Claw mode 点击对应 row 就是唯一打开入口。保留该菜单项反而意味着分区仍然泄漏。

Registry 与 `dsh-chat-tune` 不建立硬依赖。`dsh-chat-tune` 未安装时，用户只是缺少“复制/导出/删除”便利操作，不影响 Claw 的绑定、安全和导航。

---

## 9. v1→v2 迁移与历史数据

此次修复不能继续“只兼容读取、不迁移”，因为没有显式 binding 就无法保证唯一归属。迁移必须随 Registry v2 上线。

### 9.1 迁移步骤

首次读取 v1 时：

1. 获取进程内 registry file 写锁；
2. 读取并规范化 v1；
3. 枚举每个 active Agent 的官方 workspace sessionIds；
4. 对每个候选调用 `sessionController.inspect()`；
5. 按 §9.2 分类；
6. 写备份 `registry.json.bak-v1-<UTC timestamp>`；
7. 原子写 v2；
8. 重新读回并验证 schema/revision；
9. 发布迁移计数，不记录 prompt、消息正文或 secret。

迁移不得改 Session JSONL、workspace 目录、agent id 或 preset id。

### 9.2 自动绑定证据

只有同时满足以下条件才自动写 binding：

- Session 在该 Agent 的官方 workspace membership 中；
- header `cwd` 与 Agent `canonicalRoot` 规范化后完全相等；
- header `agentPreset` 与 Agent `dshPreset` 完全相等。

只有 workspace membership/cwd、缺 preset 的候选进入 repairQueue，reason=`missing-preset-evidence`。

冲突情况全部进入 repairQueue：

- 同一 Session 被两个 Claw workspace 声称；
- preset 指向另一 Agent；
- cwd 不一致；
- inspect 失败或格式不支持。

不得使用“路径在 `DSclaw` 下”作为自动绑定的充分条件。

### 9.3 回滚兼容

- v2 写入前保留 v1 备份；
- v2 reader 容忍缺失 `repairQueue`，但不能容忍重复/悬空 binding；
- 回滚旧 Registry 插件时，不允许让旧 `normalizeRegistry()` 覆盖 v2 文件；安装器必须在降级前恢复备份或阻止降级；
- 新版卸载不删除 v2 Registry 和 Session 日志；leave-behind 按已有设置执行。

---

## 10. 安全分类与其他 Claw 组件

Registry UI 绑定和安全判定不能完全等价。共享 `dsh-claw-core` 的 classifier 应输出：

```ts
type ClawClassification =
  | { kind: 'ordinary' }
  | { kind: 'claw'; agentId: string; source: 'binding' }
  | { kind: 'claw-uncertain'; evidence: string[] }
```

规则：

- 有有效 binding：`claw`；
- 无 binding，但 header 为 `wa-*` 或 cwd 在受管 `DSclaw` 根下：`claw-uncertain`；
- 其他：`ordinary`。

消费规则：

- identity/memory：只有 `claw` 才加载 Agent 专属数据；`claw-uncertain` 不猜 Agent；
- gate/permissions：`claw` 和 `claw-uncertain` 都 fail closed；
- UI：`claw` 放 Agent 下，`claw-uncertain` 放待归属；
- observability：记录分类与 evidence code，不记录完整绝对路径。

这样既不会把普通 Workspace 误伤为某个 Agent，也不会因 binding 暂时缺失而让疑似 Claw Session 逃过安全门禁。

---

## 11. 测试计划

### 11.1 Registry 纯逻辑测试

新增：

- v2 normalize 保留合法 binding 并拒绝悬空 binding；
- revision 每次成功写只加 1；
- 相同 bind 幂等，不同 Agent 冲突；
- `projectAgent` 只使用 binding，不读取 workspace.sessionIds；
- 同 workspace 的普通 Session 不自动归属；
- claims 包含 Claw workspace 的全部 Session，但 Agent `sessionIds` 只含 binding；
- stable sorting；
- repairQueue 不被 `agentForSession()` 当成 binding；
- v1 强证据迁移、弱证据待归属、冲突待归属；
- v2 原子写失败保留旧文件和备份。

### 11.2 Host route 测试

为 `sessionController.inspect`、workspaceRegistry 和文件写入建真实契约 mock，覆盖：

- 正常 bind；
- preset/cwd/workspace mismatch；
- revision conflict；
- 重复请求幂等；
- Session 已绑另一 Agent；
- inspect 不激活 Agent；
- state `provisioning→ready`、`provisioning→needs_model`；
- dispose 后 route 不再响应。

### 11.3 Client 单元测试

- `registerBrowserMode` 缺失时显示版本不兼容，且不注册全局 panel；
- projected claims 更新时 observable 发一次稳定通知；
- Claw mode 列表只显示 binding；
- pending 单独显示；
- create 调用顺序严格为 create→bind→model→state→refresh→open；
- bind 失败不得 open；
- model 失败留下 `needs_model` 并提供 retry/open；
- 多 Agent 时顶部“新会话”不擅自选择 Agent；
- locale 首屏英文后切中文时 label 更新；
- unload 调用所有 disposer。
- Registry 不注册任何通用“复制会话 ID”menu/row action；Claw Browser row 仍能正常打开绑定 Session。

### 11.4 Bundle 契约测试

`test/client-bundle.test.mjs` 改为要求：

```js
assert.match(src, /registerBrowserMode/)
assert.match(src, /session\/bind/)
assert.doesNotMatch(src, /sidebar\.panellist/)
assert.doesNotMatch(src, /name: 'main'/)
assert.doesNotMatch(src, /MutationObserver/)
assert.doesNotMatch(src, /wrapWorkspaceList/)
assert.doesNotMatch(src, /dsh-claw-registry-copy-id/)
assert.doesNotMatch(src, /registerSessionActions/)
assert.doesNotMatch(src, /copySessionId/)
```

同时：

- 从生产测试入口删除 legacy 模块导入；
- legacy 只可留作迁移参考，不能计入覆盖率和发布通过数；
- `npm test` 必须先执行 `build:check`；
- `npm pack --dry-run` 必须包含全部新 source、migration 与生成 bundle。

### 11.5 Web/Desktop E2E

在干净 profile 上执行同一组场景：

1. 安装 exact suite version 并重启；
2. 展开侧栏，确认“工作区 / Claw区”相邻；
3. 普通 Workspace 新建 Session：只在工作区出现；
4. 新建两个 Claw Agent，各建两个 Session：只在对应 Agent 下出现；
5. 切换 flat、search、archived：工作区均不可搜到 Claw Session；
6. 任意普通/Claw Session 的菜单中“复制会话 ID”最多一项；启用/禁用 Registry 不改变 `dsh-chat-tune` 的复制/导出/删除组；
7. Session row hover 不再出现 Claw 额外注入的 `ID` 按钮；
8. Claw 区可打开、分叉、归档绑定 Session；
9. 顶部“新会话”在 Claw mode 不创建无 preset Session；
10. 强制一次 model 失败，验证 `needs_model` 可恢复；
11. 重启 Web/Desktop，分区与 binding 保持；
12. 热禁用 Registry，完整官方列表恢复；重新启用后再次隔离；
13. 注入一个弱证据旧 Session，验证进入待归属而非静默绑定；
14. 折叠/展开侧栏、浅色/深色、中文/英文、reduced motion；
15. Cmd+Q 后冷启动 Desktop 再验一次，排除只在 HMR 成立的假象。

E2E 必须保存：版本表、关键截图、route/console 无错误摘要、registry schema/revision 脱敏快照。

---

## 12. 分阶段实施与 PR 拆分

### M0：冻结契约与失败测试（1 天）

- 将本文加入 suite；
- 把旧计划的“双入口”决定标为被取代；
- 在 Registry 先写失败测试，证明当前 panel 位置和 workspace 推导不符合新契约；
- 记录 Desktop/Web/Workspace 三份版本表与 bundle hash。

退出条件：失败原因来自产品契约，不是测试 fixture。

### M1：官方 Browser Mode seam（2–4 天）

- 实现 §5 的 mode registry、claims projection、header tabs 和 new-session override；
- 完成官方 unit/component 测试；
- 生成可供 Desktop 验收的官方 build/tag。

退出条件：一个最小 fixture mode 能在不改 DOM 的情况下占用 Claw tab、过滤 claimed rows、卸载恢复全集。

### M2：Registry v2 与 Host API（2–3 天）

- schema/revision/binding/repairQueue；
- v1→v2 migration + backup；
- bind/state/adopt route；
- `sessionController.inspect` 校验；
- 修正 `projectAgent`/`agentForSession`。

退出条件：同 workspace 未绑定 Session 不再拥有 Agent 身份，迁移测试全绿。

### M3：Claw sidebar mode（2–3 天）

- 删除全局 panel/main 注册；
- 删除 Registry 重复注册的复制 ID menu/row action 与 `openInClaw` Workspace menu item；
- 实现 Claw browser mode、claims store、Agent/Session/pending rows；
- 改造创建事务与顶部新会话；
- 更新样式、i18n、bundle pipeline。

退出条件：源码与生成 bundle 都不含 `sidebar.panellist`、`registerSessionActions` 或
`dsh-claw-registry-copy-id`；截图布局达到 §1，Session 菜单只保留唯一的通用复制入口。

### M4：套件安全联动（1–2 天）

- core classifier 接入 binding/uncertain；
- identity/memory/gate/permissions 改用三态语义；
- 验证缺 binding 时 fail closed，不加载错误 Agent 数据。

退出条件：普通 Session 不误伤，疑似 Claw Session 不漏拦。

### M5：双端集成、迁移演练、发布（2–3 天）

- Web clean profile；
- Desktop exact semver 冷装；
- v1 数据副本迁移/回滚演练；
- `npm pack` 内容、peer floor、README、changelog；
- 完成证据包。

总工程量：**10–16 个单人工程日**，不含官方 PR 等待时间。M1 与 M2 的纯数据实现可以部分并行，但 M3 合并必须等待 M1 契约冻结。

建议 PR：

1. DSH：`feat(ui-workspace): add partitioned browser modes`
2. Registry：`feat(registry): persist session-agent bindings v2`
3. Registry：`fix(client): render Claw as workspace browser mode`
4. Core/Suite：`fix(claw): classify unbound managed sessions fail-closed`
5. Tests/Docs：`test(claw): gate desktop workspace partition release`

---

## 13. 文件级改动清单

### 官方 DSH

| 文件 | 改动 |
|---|---|
| `packages/client/ui-workspace/src/client/contract/modes.ts` | 新公共 mode/claims 类型 |
| `packages/client/ui-workspace/src/client/browser-modes.ts` | mode 注册、active、claims 聚合、冲突诊断 |
| `packages/client/ui-workspace/src/client/navigation.ts` | 注册 API + 顶部新会话 override |
| `packages/client/ui-workspace/src/client/index.ts` | 创建 service/store 并暴露公共能力 |
| `packages/client/ui-workspace/src/client/stores.ts` | 持久化 active mode 或关联 store action |
| `packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx` | tablist、mode render、官方投影过滤 |
| `packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.module.css` | tabs/active/focus/collapsed 样式 |
| `packages/client/ui-workspace/src/client/contract/slots.ts` | 导出组合 props/type |
| `packages/client/ui-workspace/tests/*` | mode、claims、new session、a11y 测试 |

### Claw Registry

| 文件 | 改动 |
|---|---|
| `registry-store.mjs` | v2 schema、revision、binding、repairQueue |
| `registry-logic.mjs` | binding 投影与 claims 生成 |
| `registry-migrate.mjs` | v1→v2 证据迁移、备份和报告 |
| `host.js` | inject sessionController；bind/state/adopt routes |
| `registry-navigation.mjs` | 幂等 create→bind→model→open 事务 |
| `registry-client-apply.mjs` | 注册 browser mode；移除 panel、通用复制函数和 session action 生命周期 |
| `registry-browser-mode.mjs` | 新：mode/claims/dispose |
| `registry-claw-browser.mjs` | 新：侧栏 Agent/Session/pending UI |
| `registry-bindings.mjs` | 新：Client 纯投影与状态 |
| `registry-panel.mjs` | 删除；不得再进入 bundle |
| `registry-session-actions.mjs` | 删除；复制/导出/删除不属于 Registry，`openInClaw` 由 Claw mode row 取代 |
| `registry-view.mjs` | `agentForSession` 只认 binding |
| `registry-styles.mjs` | sidebar 布局、tab 内容适配 |
| `registry-i18n.mjs` | Claw区、待归属、修复、部分创建文案；删除旧通用 Session action 文案 |
| `scripts/build-client.mjs` | 新 source 顺序，移除 panel 与 `registry-session-actions.mjs` |
| `test/*` | v2、route、mode、bundle、migration 测试 |
| `README.md` | 真实 UI、兼容地板、迁移和卸载语义 |
| `package.json` | 版本 bump、peer floor、files 清单 |

### 其他 Claw 包

| 包 | 改动 |
|---|---|
| `dsh-claw-core` | 三态 classifier 与 binding 类型 |
| `dsh-claw-gate` | uncertain fail closed |
| `dsh-claw-permissions` | uncertain 使用最小权限 |
| `dsh-claw-identity` | 只对有效 binding 注入身份 |
| `dsh-claw-memory` | 只对有效 binding 读取 Agent memory |
| `dsh-claw-observability` | 新分类/迁移/冲突码与脱敏字段 |

---

## 14. 兼容、发布与回滚

### 14.1 兼容矩阵

| DSH | Registry | 结果 |
|---|---|---|
| `0.2.0-rc.2` | `0.3.0-rc.1` | 当前错误行为，仅用于复现 |
| `0.2.0-rc.2` | 新版 Registry | 明确不兼容提示，不注册旧 panel |
| `<MODE_SEAM_VERSION>` | 新版 Registry | 正式支持 |
| 更高版本 | 新版 Registry | 只有契约测试通过后才能扩 peer range |

发布前必须把 `<MODE_SEAM_VERSION>` 替换为真实版本，并同时更新：

- Registry `peerDependencies`；
- suite meta bundle exact dependencies；
- README 安装要求；
- Web/Desktop E2E matrix。

### 14.2 回滚

- Client mode disposer 是 UI 回滚开关：卸载后官方全集出现；
- Host v2 不触碰 Session 日志，因此 UI 回滚不丢会话；
- v1 备份提供 schema 回滚，但降级安装器必须显式执行，不能让旧 reader 覆盖 v2；
- 若官方 seam 在预发布阶段出现回归，停止发布 Registry 新版，不启用 DOM fallback；
- 若 binding route 故障，停止创建新的 Claw Session，已有 binding 继续只读展示。

---

## 15. Definition of Done

以下清单全部打勾后才能发布：

- [ ] Claw 不再注册 `sidebar.panellist` 和 `main`。
- [ ] Claw 不再注册“复制会话 ID”menu item、`ID` row action 或 `openInClaw` Workspace menu item。
- [ ] 安装 `dsh-chat-tune` 时每个 Session 菜单只有一项“复制会话 ID”，其复制/导出/删除组不受 Registry 启停影响。
- [ ] 展开侧栏中“工作区 / Claw区”相邻，键盘和屏幕阅读器可操作。
- [ ] 官方工作区、flat、search、archived 均不会显示 claimed Claw Session。
- [ ] Claw 区不显示普通 Session；同一 Session 不在两区重复。
- [ ] `projectAgent` 不再从 workspace.sessionIds 推导归属。
- [ ] `persistSessionBinding` 不再是 no-op；绑定有 Host 校验和 revision。
- [ ] Claw 创建顺序为 preset create→binding→model→refresh/open。
- [ ] model 失败留下 `needs_model`，重启后仍可修复。
- [ ] v1 强证据自动迁移、弱证据进入待归属，且存在可恢复备份。
- [ ] 顶部“新会话”在 Claw mode 不会创建无 preset 的继承 Session。
- [ ] identity/memory 只信显式 binding；gate/permissions 对 uncertain fail closed。
- [ ] legacy 隔离测试不再冒充生产覆盖。
- [ ] `npm test`、`build:check`、`npm pack --dry-run` 全绿。
- [ ] Web clean profile 全场景通过。
- [ ] Desktop exact semver 冷装、冷启动、禁用/启用、卸载场景通过。
- [ ] Workspace/Web/Desktop 版本与 bundle hash 记录一致。
- [ ] README、兼容矩阵和旧计划的冲突决定已经更新。

---

## 16. 明确禁止的捷径

- 不通过 CSS 把现有全局 Claw row “挪到”工作区标题旁；视觉移动不会改变语义和键盘顺序。
- 不恢复 `MutationObserver`、DOM 文本扫描、React fiber 访问或 `ctx.workspaces.list` monkey patch。
- 不通过 workspace 标题、slug 或目录 basename 认定 Session 归属。
- 不在 Client 本地维护第二份永久 binding；Host Registry 是唯一写入权威。
- 不在模型选择成功后才绑定；否则部分失败会继续产生孤儿 Session。
- 不在旧 DSH 上静默退回“双入口”；缺 seam 必须明确报不兼容。
- 不以 source 单测全绿替代生成 bundle 和 Desktop 实机验收。

执行顺序固定为：**官方 seam → Registry v2 → Claw mode → 安全联动 → 双端发布**。这条顺序是避免再次出现“UI 看起来修了，但归属和安全仍然靠猜”的核心门禁。
