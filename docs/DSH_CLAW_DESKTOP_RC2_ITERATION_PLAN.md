# Claw 套件适配 DSH Desktop 0.2.0-rc.1 / 契约 0.2.0-rc.2：代码级迭代修复计划

> **2026-09-29 修订提示：** 本文 §1.1 第 2 项的“Workspace 与 Claw 双入口并存”决定已经被
> [`DSH_CLAW_SIDEBAR_SESSION_ISOLATION_REPAIR_PLAN.md`](./DSH_CLAW_SIDEBAR_SESSION_ISOLATION_REPAIR_PLAN.md)
> 取代。入口位置、Session 唯一分区、Registry v2 binding 以及所需的官方 Browser Mode seam，均以新计划为准；不得继续按“双入口”实现或验收。

> 状态：部分过期（V3；侧栏分区、Session binding、迁移与兼容地板以顶部链接的新计划为准）  
> 基线日期：2026-09-28；修订日期：2026-09-29  
> 目标版本：Desktop 产品 `0.2.0-rc.1` / 契约 tag `0.2.0-rc.2`（`dsh-v0.2.0-rc.2`）  
> 官方基线提交：`639ed015397290b3745d163aafe02ffee4aa3f84`  
> 适用目录：`plugins/dsh-claw-suite/`  
> 交付目标：Web 与 Desktop 同能力、同一套安全不变量（peer `^0.2.0-rc.1` 覆盖 rc.1 + rc.2）

## 1. 结论与修复优先级

当前 Claw 套件**不能认定为适配 DSH Desktop 0.2.0-rc.1**（契约基线 `0.2.0-rc.2`）。

现有 8 个组件中，7 个组件的本地单元测试通过，`dsh-agent-registry` 因生成的 `client.js` 过期直接失败；但这些测试大量使用旧版 mock，无法证明 `0.2.0-rc.2` 真实契约兼容。代码审计已经确认 4 类发布阻断问题：

| 优先级 | 阻断项 | 直接影响 |
|---|---|---|
| P0 | Registry 使用已删除的 Client API | 会话创建、打开、分叉、当前会话识别不可靠或直接无效 |
| P0 | 组件通过 `../dsh-*` 跨包导入 | Desktop/npm 独立安装后模块解析失败 |
| P0 | Session Permissions 使用不存在的 `agents.values()` | 插件热启用时，已打开会话不会重新收紧权限 |
| P0 | Delegate 包装不存在的 `subagents.reportFrom()` | 过期任务拒绝和输出预算控制没有真正生效 |
| P1 | Registry 写入旧 settings namespace/字段 | 默认 preset 修复无效，并可能误导迁移逻辑 |
| P1 | 大量业务 HTTP 仍走手工 `webServer` 路由 | Desktop 虽可转发，但认证、信任与销毁逻辑没有统一到 rc.2 推荐通道 |
| P1 | Registry 依赖 DOM 扫描、Monkey Patch | 官方 UI 结构变化后容易静默失效，且破坏服务只读边界 |
| P1 | npm 包名冲突与缺失 | 无法形成可维护的 Desktop 公共安装链路 |

修复顺序必须是：

```text
冻结 rc.2 契约、Loader 行为与包过渡规则
  -> 建立独立 dsh-claw-core
  -> 修安全 P0（permissions / delegate）
  -> 恢复 Registry 的 preset/model 创建语义并重构 UI
  -> 迁移 HTTP 与 Client UI
  -> 完成组件更名与 meta bundle
  -> Web/桌面双面验收
  -> 发布 0.3.0
```

不能先发布再补兼容：当前问题中至少三项属于“安装成功、功能静默失效”，比显式报错更危险。

### 1.1 V2 已冻结决策

以下决策是后续 PR 的验收前提，不再留到实现阶段临时选择：

1. **不接受新建 Claw 会话丢失 preset/model 语义。** 每个 Claw agent 的 `wa-*` preset 必须先存在并绑定到新 session；agent 配置的默认 model 必须在打开会话前完成初始选择。model 之后仍可由用户通过官方 picker 修改，因此这里是“创建时默认选择”，不是永久锁死。
2. **Workspace 与 Claw 改为唯一分区。** `工作区 / Claw区` 在同一浏览区标题内切换；官方 Host store 仍保留全集，但官方 Workspace 视图通过通用 claim seam 排除 Claw Workspace/Session，同一个 Session 不得双入口重复显示。完整规格见顶部链接的新计划。
3. **兼容地板提升到包含 Browser Mode seam 的官方版本。** `0.2.0-rc.2` 只用于复现与前置数据层开发；正式版本记作 `<MODE_SEAM_VERSION>`，产生真实 tag 后必须替换占位符并提高 peerDependency。
4. **`dsh-claw-core` 前移到 M0。** 它从第一天就是可独立 pack/publish 的真实包，安全迭代不允许先写临时 sibling import 再返工。
5. **公共包身份在 0.3.0 完成迁移。** npm 包名、patch row id/name、Host/Client loader identity 全部改为 `dsh-claw-*`；已有数据目录、agent id、`wa-*` preset id 和审计码保持不变。
6. **公共安装链使用 npmjs.org。** 本地 tarball 只用于发布前验证；最终验收必须从 Desktop Plugins 安装 public npm 上的 exact semver。
7. **Loader 方案在 M0 决胜。** **已决：方案 A**（见 `PACKAGING_ADR.md`，Desktop `0.2.0-rc.1` 冷装/禁用/卸载/半套拒绝均通过）。B/C 仅作未来 Host 回归退路，不作为 0.3.0 产品路径。不会把“用户手动装 8+1 包”作为产品退路。
8. **Session 隔离版本必须做 Registry v1→v2 迁移。** 迁移只写 Registry binding/repairQueue 和备份，不重写 Session 日志；强证据自动绑定，弱证据进入待归属。
9. **0.3.0 不保留旧 HTTP adapter。** 新包只注册 `/api/dsh-claw/...`；安装器阻止 `dsh-agent-*` 与 `dsh-claw-*` 同时激活，并要求升级后重启 Web/Desktop。

任何 PR 若需要改变上述决策，必须先修改本计划并记录新的 ADR，不能在代码里暗中形成第二套语义。

### 1.2 评审问题闭环表

| # | 拍板结果 | 落地章节 |
|---:|---|---|
| 1 | 不接受 preset/model 降级；创建时恢复 `wa-*` + 初始 model | §8.1、§8.6 |
| 2 | Workspace/Claw 唯一分区，不重复显示 Session | 新计划 §1、§5、§8 |
| 3 | 兼容地板为包含 Browser Mode seam 的 `<MODE_SEAM_VERSION>` | 新计划 §3、§5.6、§14 |
| 4 | core 前移 M0，禁止临时 sibling 过渡形态 | §5.3、§6 M0-C |
| 5 | `dsh-agent-*` → `dsh-claw-*` 是 0.3.0 必做；数据身份不改 | §10.2 |
| 6 | 公共 npmjs.org 发布；lab tarball 不等于产品交付 | §10.5 |
| 7 | Loader fallback 为 A → B → C；不接受用户手装 8+1 | §5.3、§10.1 |
| 8 | child delivery 明确拆成 tool result / `sendMessage` / handoff 三条 seam | §4.4、§7.3 |
| 9 | core 三态 classifier；Claw 风险态 fail closed、普通 session 不误伤 | §6 M0-C、§7.2 |
| 10 | `agents.list()` 只代表 live；冷 session 在 resume 首轮 barrier pin | §4.2、§7.1 |
| 11 | Session 隔离版本执行带备份的 v1→v2 binding 迁移 | 新计划 §6、§9 |
| 12 | 新包不保留旧 HTTP 路径，安装层禁止半套升级 | §9.3 |
| 13 | 所列 slot/API 已在 rc.2 tag 点名确认，并写 contract 防漂移 | §4.6、§6 M0-A |
| 14 | 工期按单人工程日；M0 后三条流并行，最终统一集成 | §15 |

## 2. 范围与非目标

### 2.1 本轮范围

- 以官方 `dsh-v0.2.0-rc.2` 的源码契约为唯一接口基线（Desktop 产品验收面为 `0.2.0-rc.1`）。
- 修复 8 个现有组件：
  - `dsh-agent-registry`
  - `dsh-session-permissions`
  - `dsh-agent-gate`
  - `dsh-agent-delegate`
  - `dsh-agent-identity`
  - `dsh-agent-memory`
  - `dsh-agent-policy`
  - `dsh-observability`
- 同时验证 Web profile；Desktop 是主验收面，不是唯一验收面。
- 保留已有 Claw 数据目录和用户策略；只做兼容读取，不做启动时批量重写。
- 将公共发布形态收敛为 Desktop 可从 npm 安装的完整套件。

### 2.2 非目标

- 除新增通用 Workspace Browser Mode seam 外，不修改 `deepseek-harness-desktop-official` 的业务语义或私有 store。
- 不通过 patch 核心 Loader 行替换 DSH 自带服务。
- 不为 alpha.2 或旧包保留运行时双写、双路由或双 API shim。
- 不把 agent preset 当作安全沙箱；权限仍由官方权限域与 Claw gate 共同执行。
- 不迁移 `$DSH_HOME/DSclaw`、agent id、`wa-*` id 或历史审计码；包身份迁移不得改变数据身份。

## 3. 已确认基线

### 3.1 运行环境

| 项目 | 当前值 |
|---|---|
| 官方契约 / 源码基线 tag | `dsh-v0.2.0-rc.2` @ `639ed015` |
| 本机 Desktop 应用（验收面） | `0.2.0-rc.1` |
| Web lab Host / CLI pin | `0.2.0-rc.2`（`scripts/lab/.cli-0.2.0-rc.2/`，profile `web-claw-v02`） |
| 本机全局 CLI | 常为更旧版本（如 `0.1.7-alpha.2`）— 不用于 0.3.0 验收 |
| peerDependency | `^0.2.0-rc.1` |
| Desktop 已安装 Claw 组件 | 全部缺失（生产组件本轮不改） |
| Web profile 中 Claw 组件 | 8 个均以 workspace 版本存在（生产组件 peer 尚未抬升） |

CLI 版本不能代表 Desktop Host 版本。本机旧 Web profile / `0.1.7-*` 只用于读取旧数据和回归 Claw `0.2.x`，**不得**作为 `0.3.0` 的开发或验收环境。M0 使用隔离的 `web-claw-v02`（Host `0.2.0-rc.2`）；契约、集成测试和发布声明均以 `dsh-v0.2.0-rc.2` tag 源码及 Desktop 产品 `0.2.0-rc.1` / Web lab `0.2.0-rc.2` 为准。

### 3.2 当前组件版本与测试

| 组件 | 当前版本 | 当前测试结果 | rc.2 判断 |
|---|---:|---:|---|
| `dsh-agent-delegate` | `0.2.10` | 47 通过 | 部分失效：`reportFrom` 钩子不存在 |
| `dsh-agent-gate` | `0.1.14` | 24 通过 | 核心 seam 尚在；打包、HTTP 与 live-agent 枚举需修 |
| `dsh-agent-identity` | `0.1.8` | 19 通过 | Host 事件大体可用；打包与 Desktop 未验证 |
| `dsh-agent-memory` | `0.1.10` | 21 通过 | Host 事件大体可用；打包与 Desktop 未验证 |
| `dsh-agent-policy` | `0.1.8` | 14 通过 | 简单 Host 逻辑可迁；包名已被他人占用 |
| `dsh-agent-registry` | `0.1.79` | `build:check` 失败 | 不兼容：Client API、settings、DOM/Monkey Patch 多项过时 |
| `dsh-observability` | `0.2.0` | 10 通过 | 功能简单；包名已被他人占用 |
| `dsh-session-permissions` | `0.2.30` | 43 通过、1 跳过 | 部分失效：热启用漏掉已有会话 |

### 3.3 安全不变量

任何重构不得破坏以下约束：

1. 有效策略始终是 `official ∩ agent ∩ session`，只能收紧，不能放宽。
2. 普通 Workspace 会话继续由官方能力管理，不因 Claw 插件存在而被误标为 Claw。
3. Claw 模式下未知工具默认拒绝。
4. 隔离能力只要部分安装失败，要求隔离的角色必须 fail closed。
5. 插件卸载不得恢复成比官方原配置更宽的 sandbox 或权限状态。
6. 子 agent 权限不得超过父 agent。
7. identity、memory、workspace、worktree 不得跨 agent 泄漏。
8. 同一 task 的旧 generation 结果必须被拒绝。
9. write-child 必须在独立 worktree 中执行，失败后要留下可诊断、可恢复记录。
10. gate 或 permissions 缺失时，不得继续宣称“完整 Claw 隔离已生效”。

## 4. rc.2 契约差异：旧调用到新调用

### 4.1 Client 会话与导航

rc.2 中 `ctx.sessions` 是会话目录与通用生命周期服务，导航由 `ctx.uiWorkspace` 负责。**Claw 创建会话是例外：** Client facade 的 `ctx.sessions.create()` 不接受 `agentPreset`，因此必须使用同为官方公开契约的 generated remote `ctx.remote.session.create()`，不能退回私有 `ctx.connection.api`。

| 当前代码 | rc.2 正确边界 | 改动 |
|---|---|---|
| `ctx.connection.api.sessions.create(...)` | 普通创建：`ctx.sessions.create(...)`；Claw 创建：`ctx.remote.session.create({ workspaceId, sessionId?, agentPreset })` | 删除私有 `connection.api`；Claw 不丢 preset |
| `ctx.connection.api.sessions.selectModel(...)` | `ctx.remote.session.selectModel(...)` | 创建后、打开前应用 agent 默认 model |
| `ctx.sessions.open(id)` | `ctx.uiWorkspace.openSession(id)` | 所有打开操作迁到 UI Workspace |
| `ctx.workspaces.startSession(workspaceId)` | `ctx.uiWorkspace.startSession(workspaceId)` | `workspaces` 不再负责导航 |
| `ctx.sessions.fork(...); sessions.open(child)` | `ctx.sessions.fork(...); ctx.uiWorkspace.openSession(child)` | 分叉与导航分离；`sessions.fork` 可带可选 `onCreated` |
| `ctx.workspaces.archiveSession(id)` | `ctx.uiWorkspace.archiveSession(id, options?)` | 使用 view owner 的正式 API |
| （可选）UI 分叉 | `ctx.uiWorkspace.forkSession(...)` → `Promise<SessionId>` | 0.2.0 允许；assert 中可选存在 |
| `sessions.list.getSnapshot().current` | 无此字段 | 从 slot owner props/正式导航上下文传入 `sessionId` |
| `sessions.get(id)` | `sessions.binding(id)`，或先 `retain()` | 禁止依赖已删除的 getter |

0.2.0 的 `SessionListState` 只有：

```text
ids
byId
phase
projectionsBySession
```

因此 `registry-preset-hide.mjs:216-232` 的 `snap.current` 与 `sessions.get()` 必须整体删除，不能做兼容分支保留。Claw 创建成功后要 `await ctx.sessions.refresh()`（或等待等价的 catalog reconciliation），再调用 `ctx.uiWorkspace.openSession(sessionId)`；不得靠本地伪造 row 提前显示。

### 4.2 Agent 注册表

rc.2 的 live agent 枚举方法是 `ctx.agents.list()`，不是 `values()`。

受影响位置：

- `dsh-session-permissions/host.js:132-139`
- `dsh-agent-gate/gate-mcp.mjs:62-63`

`list()` 的权威含义是“当前 Host 进程已经 hydrate 的 live agent”，不是磁盘上全部 session。目标实现：

```js
function forEachLiveAgent(ctx, visit) {
  const agents = ctx.agents
  if (!agents || typeof agents.list !== 'function') return
  for (const agent of agents.list()) visit(agent)
}
```

该 helper 应放进共享 core，而不是在 gate 与 permissions 中各复制一份。热启用时只 sweep live agents；冷 session 在 resume 时必须先串行完成 `agent/created` pin，再允许第一轮工具执行。禁止为了补 pin 而扫描并 hydrate 全部历史 session。

### 4.3 Agent preset

rc.2 的 settings namespace 是 `agent-preset-registry`：

- `default`：部署层必填，不可由用户写入；
- `selectedDefault`：可写的 volatile 用户选择；
- rc.2 已移除 `modeSelectionEnabled`。

现有错误代码：

```js
settings.mutate('agent-presets', [{ op: 'unset', path: ['default'] }])
```

目标行为分为“默认选择清理”和“Claw 动态 preset 供给”两部分：

- 禁止写 `default`；
- 如需清除用户选择，只 unset `selectedDefault`；
- 只有当 `selectedDefault` 确认指向 Claw preset 时才修改；
- 使用 revision-aware settings API，冲突时向 UI 返回明确错误；
- 删除对 `agentPresets.remove()`、`copy()`、preset 文件路径的假设；rc.2 registry 没有这些公共能力。
- 从可编辑 `wa-template` 读取完整 composition document，以 `js-yaml` 和官方 `entryListSchema` 解析（必须保留/支持 `!!js`），再用 `ctx.agentPresets.register({ id, name, plugins })` 注册每个 `wa-*` preset。
- `register()` 返回的 disposer 由 Registry 按 agent 保存；archive 不注销 preset，只有永久删除 agent 且确认没有 session 引用该 preset 时才 dispose。
- 重启后先重建 `wa-*` 声明，再恢复相应 session；旧 session 保存的是 preset id，没有同 id 声明时必须显式 degraded，不能退回默认 preset。

建议将 `clearClawDefault()` 重命名为 `clearSelectedClawDefault()`，避免继续表达错误语义：

```js
export async function clearSelectedClawDefault(settings, selectedDefault, expectedRevision) {
  if (!isClawPresetId(selectedDefault)) return { cleared: false }
  await settings.mutate(
    'agent-preset-registry',
    [{ op: 'unset', path: ['selectedDefault'] }],
    expectedRevision,
  )
  return { cleared: true }
}
```

### 4.4 Subagent

rc.2 `SubagentRuntime` 的正式能力包括：

- `start(name, request)`
- `startContinuable(spec)`
- `sendMessage(sender, targetId, content, options)`
- `listChildren(...)`
- `listDescendants(...)`
- `subagent/start` 与 `subagent/end` 观察事件

不存在 `reportFrom()`。因此 `dsh-agent-delegate/host.js:744-760` 当前包装永远不会安装。

目标拆分为三个可枚举、可测试的 child → parent 交付面：

- **一次性 subagent tool result：** 在 `tools/execute` waterfall 中包围 `next()`；获得结果后、后续 `tools/post-execute`/`tools/result` 观察者之前，执行 stale generation 校验与字节预算裁剪。
- **continuable child 主动回报：** 包装 `ctx.subagents.sendMessage(sender, targetId, content, options)`；只有当 sender 是已登记 Claw child 且 `targetId === record.parentSession` 时才执行 stale/预算校验。parent → child 和普通 session 消息不裁剪。
- **write-child handoff：** 在 `delegate_handoff(action='accept')` 中，于 `applyHandoffToParent()` 紧前再次校验 generation；校验失败不得触碰父 worktree。
- 在 start/startContinuable 的准入边界另行验证 generation、深度和权限衰减；
- 在 `subagent/end` 使用 `info.runId` 与 `info.id` 处理生命周期清理与审计；
- 不把 `subagent/end.lastAssistantMessage` 当作可修改返回值，它是 observe-only。

### 4.5 HTTP

Desktop rc.2 能转发 `webServer` 路由，所以现有路由并非全部“完全不可达”；但产品 UI 调用应迁到：

```js
ctx.connection.fetch.register({
  path: '/api/dsh-claw/<component>/<action>',
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: async (request) => new Response(...),
})
```

原因：Connection carrier 统一完成 Desktop/Web 信任与浏览器认证；Client 只需 same-origin `fetch('/api/...')`，不猜端口、不维护 localhost Origin 白名单。

### 4.6 rc.2 slot/API 点名核验结果

以下能力已在 `dsh-v0.2.0-rc.2` tag 上确认存在，不是从更旧 Host 推断：

| 能力 | rc.2 结论 | 实现限制 |
|---|---|---|
| `sidebar.panellist` + keyed `main` | 存在 | 两者使用同一 panel id |
| `sidebar.workspaces.session.menu.item` | 存在 | owner props 直接给 `sessionId` |
| `sidebar.workspaces.session.row.action` | 存在 | owner props 直接给 `sessionId` |
| `sidebar.session.row.leading` | 存在 | 仅 idle、non-archived row；只能做装饰 |
| `connection.fetch.register` | 存在 | 由 effect/disposer 管理生命周期 |
| `remote.session.create` | 存在 | request 支持 `agentPreset` |
| `remote.session.selectModel` | 存在 | request 必须含完整 `provider/model/reasoningEffort?` |
| session row filter | **不存在** | 不得隐藏官方 Workspace row |

因此迭代 2 是迁移到已知 seam，不把“寻找替代 slot”算作隐含工作；若 M0 contract 在相同 tag 得出不同结果，应视为审计错误并立即停线，而不是用 DOM fallback 掩盖。

## 5. 目标架构

### 5.1 分层

```text
dsh-claw-suite                 安装入口 / bundle patch / 版本锁定
  |
  +-- dsh-claw-core            纯函数、共享类型、HTTP helper、跨组件契约
  |
  +-- registry                 agent/workspace 元数据与官方 UI slot
  +-- policy                   策略 schema 与模板默认值
  +-- permissions              official ∩ agent ∩ session 解析
  +-- gate                     tools/pre-execute + tools.guard 最终拒绝
  +-- delegate                 子 agent 生命周期、衰减、worktree
  +-- identity                 prompt identity
  +-- memory                   vault / diary / brief
  +-- observability            trace / audit / diagnostic
```

### 5.2 依赖方向

依赖只能向下，禁止环：

```text
observability <- registry / memory / gate / delegate
policy        <- registry / permissions / delegate
permissions   <- gate / delegate / identity / memory
identity      <- memory
core          <- all components
```

共享代码必须通过包导出解析，禁止继续使用 `../dsh-*/file.mjs`。

### 5.3 已冻结的包过渡规则与 Loader ADR

`dsh-claw-core` 不等待迭代 4：M0 就建立 `dsh-claw-core@0.3.0-rc.1`，组件 manifest 使用正常、精确 semver：

```json
{
  "dependencies": { "dsh-claw-core": "0.3.0-rc.1" },
  "peerDependencies": { "@deepseek-ai/dsh": "^0.2.0-rc.1" }
}
```

suite 与每个 runtime component 都声明 DSH peer（core 必为 `^0.2.0-rc.1`），由官方 plugin compatibility preflight 在安装/启动时拒绝矩阵外版本；验收环境不得通过 `allow-version --accept-risk` 绕过。suite 根目录可以是 private pnpm workspace，以便开发时把匹配版本链接到本机；但 pack 后的每个发布 manifest 禁止出现 `file:`、`link:` 或 `workspace:*`。公开发布顺序固定为 core → components → meta bundle。

M0 同时做最小 Desktop Loader 实验并写 `PACKAGING_ADR.md`：

| 方案 | 描述 | 判断 |
|---|---|---|
| A | `dsh-claw-suite` meta bundle + 多个 collision-free 组件包 + `dsh-claw-core` | 首选；组件可独立开关，依赖显式 |
| B | 单包，patch 行引用 `dsh-claw-suite/registry` 等 subpath exports | A 失败时验证；保留多 row 开关 |
| C | 单包、单 Loader row，内部组合 Registry/Policy/... 模块 | B 也失败时的产品退路；牺牲逐组件 row 开关，但仍保持一键安装与整体卸载 |

不允许把“用户逐个安装 8+1 个包”作为退路。A/B/C 全部失败则 M0 阻断，`0.3.0` 不进入安全业务迭代。临时 Desktop lab 可以使用 `npm pack` 生成的 tarball 和临时 staging manifest 覆盖依赖，但这些 override 不得提交、发布或进入最终 DoD。

建议的新包名：

- `dsh-claw-suite`
- `dsh-claw-core`
- `dsh-claw-registry`
- `dsh-claw-policy`
- `dsh-claw-permissions`
- `dsh-claw-gate`
- `dsh-claw-delegate`
- `dsh-claw-identity`
- `dsh-claw-memory`
- `dsh-claw-observability`

这是因为当前 `dsh-agent-memory`、`dsh-agent-policy`、`dsh-observability` 在 npm 已被其他作者占用；继续沿用会造成供应链与安装歧义。0.3.0 必须完成这一更名，而不是只写建议。数据目录仍为 `$DSH_HOME/DSclaw`，agent id、`wa-*`、registry binding key 和 audit code 均不改名。

## 6. 迭代 0：冻结 rc.2 契约、包形态与共享 core

### 目标

M0 不是单纯补 mock，而是后续全部工作的硬门禁：建立 rc.2 Web lab、用真实契约让旧调用稳定失败、完成 Loader 决策，并让 `dsh-claw-core` 以真实发布包形态存在。M0 未通过时，不合入 permissions/delegate/Registry 业务修复。

### M0-A：契约门禁

新增：

```text
plugins/dsh-claw-suite/contract/
  v02-client-contract.mjs
  v02-host-contract.mjs
  v02-subagent-contract.mjs
  v02-slots-contract.mjs
  package-shape.mjs
plugins/dsh-claw-suite/scripts/
  verify-rc2-contract.mjs
  verify-package-graph.mjs
  verify-version-floor.mjs
  test-all.mjs
```

实现项：

1. `v02-client-contract.mjs` 固定 `sessions.create/fork/binding/list/refresh`、`remote.session.create/selectModel`、`uiWorkspace.openSession/startSession/archiveSession/unarchiveSession`（`forkSession` 可选存在），并拒绝 `connection.api`、`sessions.open/get`、`workspaces.startSession`。
2. `v02-host-contract.mjs` 固定 `agents.list()`、`agent/created` 首轮 barrier、`tools.guard`、`tools/execute` waterfall、`tools/pre-execute` 与 `connection.fetch.register`。
3. `v02-subagent-contract.mjs` 固定 `start/startContinuable/sendMessage`、`subagent/end` 字段，并明确断言无 `reportFrom`。
4. `v02-slots-contract.mjs` 点名验证：
   - `sidebar.panellist` 与同 id `main`；
   - `sidebar.workspaces.session.menu.item`；
   - `sidebar.workspaces.session.row.action`；
   - `sidebar.session.row.leading`；
   - `settings.section`。
5. `verify-package-graph.mjs` 拒绝 `../dsh-` 跨包 import、发布 manifest 中的 `file:`/`link:`/`workspace:*`、identity 不一致和漏装运行时文件。
6. `verify-version-floor.mjs` 校验 `REQUIRED_PEER = '^0.2.0-rc.1'`：core 必须精确为该字符串；其他 runtime 接受 `^0.2.0-rc.1` 或 exact `0.2.0-rc.1`/`0.2.0-rc.2`；并用官方 plugin compatibility fixture 证明矩阵外版本默认拒绝；不另造 Claw 私有版本探测器。
7. `test-all.mjs` 运行所有组件的 unit/build/contract 测试并汇总全部失败。

### M0-B：Loader 与 meta bundle 实验

最小实验必须实际覆盖 Desktop profile，而不是只用 Node `import`：

1. meta bundle 的 dependencies 是否随 Desktop GUI 安装；
2. patch row 能否解析 dependency package；
3. patch row 能否解析同包 subpath export；
4. row disable 是否同时正确卸载 Host 与 Client；
5. suite 卸载是否清理 patch/Client bundle，且不删除用户数据；
6. exact semver 是否阻止半套版本；
7. old/new package row 同时存在时，安装器是否能在激活前拒绝。

结果写进 `PACKAGING_ADR.md`，结论只能是 A、B、C 或 blocked；不得写“先按 A 开发，发布前再看”。

### M0-C：建立真实 `dsh-claw-core`

初始 exports 至少包含：

```text
dsh-claw-core/live-agents
dsh-claw-core/session-classifier
dsh-claw-core/path-containment
dsh-claw-core/errors
dsh-claw-core/version
```

其中 session classifier 返回三态：

```ts
type ClawSessionKind = 'claw' | 'ordinary' | 'claw-uncertain'
```

判定证据按以下优先级组合，但不得依赖 Registry UI 插件处于 ACTIVE：

1. canonical cwd 位于 `$DSH_HOME/DSclaw` 下；
2. 持久化 registry binding 的 `workspaceId`/`canonicalRoot` 精确匹配；
3. session header 的 `agentPreset` 为 `wa-*`，或命中保留的 `wa-template` legacy marker。

语义：明确命中为 `claw`；明确排除为 `ordinary`；原始路径看似位于 `DSclaw` 但 canonicalize 失败、或证据互相冲突时为 `claw-uncertain`。permissions/gate 组件缺失时，`claw` 与 `claw-uncertain` 均 fail closed；普通 Workspace 不受影响。仅仅“Registry 不可用”不能把无 Claw marker 的普通 session 判为 uncertain。

开发 workspace 可链接同版本 core，但必须同时执行 `npm pack` 后的 tarball import 测试，确保发布图不依赖 workspace 魔法。

### M0-D：隔离 0.2 Web lab

- 从 `0.2.0-rc.2` 建独立 profile `web-claw-v02`，不复用本机默认 web / 旧 `web-claw-rc2` 的 Loader state。
- 旧 `0.1.7-*` 数据只以只读副本输入兼容测试。
- 每次 Web integration 输出 Host/Client/Claw 三方版本证据。
- 失败时不得回退到矩阵外 Host 继续开发并宣称通过。

### 测试与退出标准

- 每个已删除 API 都有负向 contract test，当前旧代码先红。
- 当前 25 处 sibling import 被扫描稳定捕获。
- Registry 生成物只由 `npm run build` 产生，`build:check` 转绿。
- `dsh-claw-core@0.3.0-rc.1` 能在干净目录 pack/install/import。
- `PACKAGING_ADR.md` 已确定 A/B/C，Desktop 最小安装与卸载通过。
- rc.2 Web lab 可复现，alpha.2 被官方 plugin compatibility preflight 明确拒绝且未授予 exemption。
- 后续每次提交都运行 contract、package graph、core pack 与全部组件测试。

## 7. 迭代 1：先修安全 P0

### 7.1 Session Permissions：修复已有会话漏收紧

#### 修改文件

- `dsh-session-permissions/host.js`
- `dsh-session-permissions/test/host-contract.test.mjs`
- 新增共享 `dsh-claw-core/live-agents.mjs`

#### 改动

1. `agents.values()` 替换为 `agents.list()`。
2. `pinOpenSessions()` 返回结构化结果：`{ visited, pinned, failed }`，而不是吞掉全部异常。
3. 单会话失败继续隔离，但必须写 observability 事件。
4. 保留 `agent/created` 监听，覆盖新建、恢复、clear、compact 产生的新 Agent scope；该 handler 必须被 resume/create 流程串行 await，完成 pin 前不开放首轮工具执行。
5. dispose 只撤销本插件安装的 effect，不写回宽松策略。

#### 必测场景

- 插件 apply 前已经存在 live agent，apply 后立即 pin。
- 磁盘中存在但未 hydrate 的冷 session 不被强制加载；恢复时在第一轮前完成 pin。
- `agent/created` pin 失败时第一轮工具执行 fail closed，而不是带未 pin 权限继续。
- 两个 live agent 中一个 header 损坏，另一个仍被 pin，同时有诊断记录。
- `agents.list()` 抛错时插件显式进入 degraded 状态。
- 卸载不放宽官方更严格的 sandbox。
- 非 Claw session 不被错误收紧。

### 7.2 Gate：使用同一 live-agent helper

#### 修改文件

- `dsh-agent-gate/gate-mcp.mjs`
- `dsh-agent-gate/host.js`
- 对应测试

#### 改动

- 删除 `values()` 分支，统一通过 `forEachLiveAgent()`。
- 调用 core `classifySession()`；如果 permissions 服务/文件不可用，`claw` 与 `claw-uncertain` 的工具调用 fail closed，并返回稳定错误码；`ordinary` 不受影响。
- `ctx.tools.guard()` 保持最终单调拒绝；`tools/pre-execute` 只负责可解释 receipt 与审计，不能与 guard 得出相反结论。

### 7.3 Delegate：删除死钩子，重接真实生命周期

#### 修改文件

- `dsh-agent-delegate/host.js`
- `delegate-budget.mjs`
- `delegate-handoff.mjs`
- `delegate-store.mjs`
- `test/host-contract.test.mjs`

#### 改动

1. 删除 `wrapMethod(ctx.subagents, 'reportFrom', ...)`。
2. 把 stale generation 校验前移到：
   - delegation 工具执行前；
   - `start()`/`startContinuable()` 被接受前；
   - handoff 写入父会话前。
3. 业务规则收敛为一个纯函数，但由三个官方交付 seam 调用，而不是假设存在单一运行时函数：

```js
export function prepareChildDelivery(record, latest, content) {
  if (isStaleRecord(record, latest)) {
    const error = new Error(staleDenyReason())
    error.name = 'SubagentStaleError'
    throw error
  }
  return trimContentBlocks(content, budgetOf(record.policy, record).maxOutputBytes)
}
```

4. 一次性 tool result 的 `tools/execute` wrapper 必须在 `await next()` 返回后调用 `prepareChildDelivery()`，再把结果交给后续 observer。
5. `sendMessage` wrapper 只拦 child → its recorded parent；目标不匹配、parent → child、普通 session 消息保持原样。
6. `delegate_handoff(action='accept')` 在修改父 worktree 紧前重新读取 latest generation，再调用 `prepareChildDelivery()`/handoff validator。
7. `subagent/end` 只做：
   - 以 `runId` 配对 start/end；
   - 以 `id` 找 child record；
   - 记录 `stopReason`；
   - 清理临时状态；
   - 不尝试修改 event payload。
8. 所有对 `subagents.start`、`startContinuable`、`sendMessage`、`agents.create` 的 wrapper 必须满足：
   - 可重复 apply 不形成双包装；
   - disposer 恢复原函数；
   - 原函数 throw/reject 原样传播；
   - 包装中途失败不留下 child record/worktree。

#### 必测场景

- 同 task 新 generation 启动后，旧 generation 交付被拒绝。
- 一次性 tool result、continuable `sendMessage`、write-child handoff 三条路径分别验证 stale 拒绝，不能用一个 mock 代表三条路径。
- parent → child 和普通 Workspace `sendMessage` 内容不被裁剪。
- 输出按 UTF-8 字节裁剪，不截断 JSON/ContentBlock 结构。
- `subagent/end` 无 `lastAssistantMessage` 也能完成清理。
- provider 创建失败时 worktree 回收成功/失败都有审计结果。
- unload 后所有 wrapper 恢复引用恒等性。

### 迭代 1 退出标准

- P0 安全测试全部通过。
- 不再出现 `agents.values` 和 `subagents.reportFrom`。
- gate、permissions、delegate 在缺依赖场景下行为明确且可观测。

## 8. 迭代 2：重构 Registry 的 rc.2 Client 边界

Registry 是最大风险点，应独立成一个迭代，不与样式调整混在同一 PR。

### 8.1 使用官方 Remote 创建 Claw session，并保留 preset/model 语义

#### 修改文件

- `dsh-agent-registry/registry-runtime.mjs`
- `dsh-agent-registry/test/client-bundle.test.mjs`
- `dsh-agent-registry/test/registry-runtime.test.mjs`（新增）

#### 改动

删除整个 `connectionApi()`。通用导航 adapter 只依赖 `ctx.sessions` 与 `ctx.uiWorkspace`：

```js
export function createNavigation(ctx) {
  return {
    startSession(workspaceId) {
      ctx.uiWorkspace.startSession(workspaceId)
    },
    openSession(sessionId) {
      ctx.uiWorkspace.openSession(sessionId)
    },
    async forkSession(sessionId) {
      const childId = await ctx.sessions.fork({ sessionId, increaseTitle: true })
      ctx.uiWorkspace.openSession(childId)
    },
    archiveSession(sessionId) {
      return ctx.uiWorkspace.archiveSession(sessionId)
    },
  }
}
```

Claw 的“新会话”不能调用上述 `startSession()` 跟随全局 default。它必须进入独立、可恢复的 transaction：

```js
export async function createClawSession(ctx, agent, workspaceId) {
  // Host apply 已注册 wa-*；这里读取 health，broken/missing 直接阻断。
  await requireAgentPresetReady(agent)

  const created = await ctx.remote.session.create({
    workspaceId,
    agentPreset: agent.presetId, // wa-*
  })
  const value = unwrapRemote(created)
  const { sessionId } = value
  if (value.agentPreset !== agent.presetId) {
    throw partialCreateError({ sessionId, stage: 'verify-preset' })
  }

  let stage = 'select-model'
  try {
    if (agent.defaultModel) {
      unwrapRemote(await ctx.remote.session.selectModel({
        sessionId,
        provider: agent.defaultModel.provider,
        model: agent.defaultModel.model,
        ...(agent.defaultModel.reasoningEffort
          ? { reasoningEffort: agent.defaultModel.reasoningEffort }
          : {}),
      }))
    }
    stage = 'persist-binding'
    await persistSessionBinding({ sessionId, agentId: agent.id, presetId: agent.presetId })
  } catch (error) {
    throw partialCreateError({ sessionId, stage, cause: error })
  }

  await ctx.sessions.refresh()
  ctx.uiWorkspace.openSession(sessionId)
  return sessionId
}
```

实现要求：

1. Registry Client 的 loader contract 显式注入 `remote`、`sessions`、`uiWorkspace`；`unwrapRemote()` 只接受 `RemoteResult.ok === true`，失败保留官方 error code/details 并映射为稳定 UI 状态。
2. Host 在 apply/agent 恢复阶段注册 `wa-*` 并发布 health；Client 只有看到该 preset ready 才允许 create。Client 不直接调用 Host-only `agentPresets.register()`。
3. remote create 必须携带 `agentPreset`；返回的 `agentPreset` 与预期不一致时 fail closed。create 失败不写“已创建” binding。
4. create 成功但 model 选择或 binding 持久化失败时，返回稳定的 partial-completion 错误，包含 `sessionId`、失败阶段与“重试/打开会话”动作；不得静默换成全局模型，也不得删除已创建 session。session header 中已有 `wa-*`，因此失败态仍能被 classifier 识别为 Claw。
5. model 是初始选择，创建后允许用户用官方 model picker 修改；Registry 展示“agent 默认值”和“session 当前值”的差异。
6. binding 持久化和 refresh/catalog reconciliation 完成后才 open，防止 UI 打开尚未进入目录或未归属 agent 的 session。

### 8.2 删除“当前会话”猜测

#### 修改文件

- `registry-preset-hide.mjs`
- `registry-sidebar.mjs`
- `registry-view.mjs`
- 相关测试

#### 改动

- 删除 `currentSessionOf()`。
- 行级操作直接使用 rc.2 slot owner 提供的 `sessionId`。
- 会话菜单扩展注册到：
  - `sidebar.workspaces.session.menu.item`
  - `sidebar.workspaces.session.row.action`
- 需要 session scope 的 UI 使用官方 slot scope/props；不得从 DOM、URL 或 CSS class 反推。

### 8.3 用官方 Slots 替换 DOM 权威

#### 当前应删除的行为

- 扫描 `[role="tree"]`、`[role="treeitem"]`、`[role="menuitem"]` 决定业务状态；
- 通过 `MutationObserver` 隐藏 preset、改写侧边栏树；
- 点击拦截阻止官方 preset 卡片；
- 根据 class 名包含 `title/search/nav` 推断组件语义。

#### 目标实现

- Claw 通过新计划定义的 `uiWorkspace.registerBrowserMode()` 进入工作区标题旁，不再注册 `sidebar.panellist` + `main`；
- 设置页继续使用 `settings.section`；
- 行操作使用 ui-workspace 提供的两个 session action slot；
- Claw 标记可使用 `sidebar.session.row.leading`；
- 纯装饰性 fallback 才允许 DOM，并且不得参与授权、绑定、过滤或当前会话判断。

产品语义固定为：

- 官方 Host store 继续保存完整 session 全集，但 Workspace browser 只显示未被 custom mode claim 的投影。
- Claw mode 以 Registry v2 bindings 生成按 agent 组织的唯一管理视图。
- 同一个 `sessionId` 不得在两个 mode 重复显示，也不复制 session 数据。
- rc.2 没有正式 mode/filter seam，因此完整修复必须等待包含该 seam 的官方版本，不得通过 CSS、DOM observer 或 store patch 模拟。
- `sidebar.session.row.leading` 只在 idle、non-archived row 可用，只作为辅助标记；它不能承担分类、权限或唯一入口职责。

建议拆分：

```text
registry-client-apply.mjs       只做 slot 注册与 effect
registry-navigation.mjs         sessions/uiWorkspace adapter
registry-panel.mjs              Claw 主面板
registry-session-actions.mjs    行菜单与 hover action
registry-session-mark.mjs       leading decoration
registry-settings.mjs           现有 settings.section
registry-runtime.mjs            仅协调数据加载、locale、dispose
```

### 8.4 删除服务 Monkey Patch

#### 修改文件

- `registry-isolate.mjs`
- `registry-preset-hide.mjs`
- `registry-runtime.mjs`

#### 删除

- 覆写 `workspaces.list.set/update`；
- 覆写 `agentPresets.list`；
- 修改官方 observable/store 的内部方法；
- 用过滤后的假 roster 替换官方 roster。

隔离视图应由 Claw 自己的数据 selector 产生：

```js
export function selectClawSessions(snapshot, bindings) {
  return snapshot.ids
    .map((id) => snapshot.byId[id])
    .filter((row) => row && bindings.has(row.id))
}
```

官方 store 永远保持完整，Claw 只控制自己面板显示什么。

### 8.5 修正 preset 注册与兼容读取

#### 修改文件

- `registry-presets.mjs`
- `registry-migrate.mjs`
- `host.js`
- 对应测试

#### 改动

- `clearClawDefault` 改为只处理 `agent-preset-registry.selectedDefault`。
- 删除依赖 preset `path` 的常态运行逻辑。
- `.agent-presets/<id>/` 在 0.3.0 只做诊断输入：可生成迁移报告，但不复制、不改写、不删除。若未来提供显式迁移器，必须另立里程碑。
- 删除 `agentPresets.remove/copy/authorable` 旧 mock 与旧分支。
- `agentPresets.list()` 只用于 roster metadata；需要 composition 内容时使用 rc.2 正式 `readDocument()`/`compositionInventory()`。
- `ensureAgentPresetRegistered()` 读取 `wa-template` 的可编辑完整 composition，解析后注册同 id `wa-*`；不得从 `list()` metadata 反推 plugin rows。
- 每个注册成功的 `wa-*` 保存 disposer；永久删除前先查 session header/binding 引用数，引用非零只删除 agent 的“可新建”状态，保留 preset 声明供旧 session 恢复。

### 8.6 Registry 测试矩阵

- 普通新建会话可调用 `uiWorkspace.startSession`；Claw 新建必须调用 `remote.session.create(agentPreset)` 与 `remote.session.selectModel`，且不触碰 `connection.api`。
- 创建两个 Claw agent 后，新 session 分别绑定正确的 `wa-*`，默认 model 初选正确；创建后手工改 model 不会被后台强行改回。
- model 选择失败产生带 `sessionId` 的 partial-completion，不静默 fallback。
- open/fork/archive 分别调用正确 owner。
- `SessionListState` 无 `current` 时 UI 正常。
- 官方 roster/store 引用在 apply/dispose 前后保持不变。
- 同一 Claw session 只出现在 Claw mode；普通 session 只出现在 Workspace mode；两个 mode 仍打开官方同一份 session 数据。
- slot 晚注册、重声明、卸载后，Claw contribution 自动重装/卸载。
- locale 在首次渲染后由 `en-US` 切到 `zh`，文案更新。
- `npm run build:check` 必须通过。

### 迭代 2 退出标准

- Registry 源码中无 `connection.api`、`sessions.open/get`、`workspaces.startSession`。
- Claw create 的 preset/model 语义与 0.2.x 产品能力等价，不以“跟随官方 default”降级。
- 无业务性 `MutationObserver` 和官方 service monkey patch。
- Registry 单测、client bundle check、rc.2 contract test 全绿。

## 9. 迭代 3：统一 HTTP 到 Connection Fetch

### 9.1 新增共享 helper

新增 `dsh-claw-core/http.mjs`：

```js
export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function readJson(request, maxBytes = 64 * 1024) {
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > maxBytes) throw new RangeError('request body too large')
  if (bytes.byteLength === 0) return {}
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function registerJsonRoute(ctx, spec) {
  const dispose = ctx.connection.fetch.register({
    path: spec.path,
    methods: spec.methods || ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const input = await readJson(request, spec.maxBytes)
        return jsonResponse(200, { ok: true, ...(await spec.handle(input)) })
      } catch (error) {
        const status = error instanceof RangeError ? 413 : 400
        const message = error instanceof Error ? error.message : String(error)
        return jsonResponse(status, { ok: false, error: message })
      }
    },
  })
  ctx.effect(() => () => dispose())
}
```

实际实现还要把内部错误映射成稳定 code，不能向 Client 泄漏堆栈或绝对路径。

### 9.2 路由映射

| 组件 | 旧路径 | 新路径前缀 |
|---|---|---|
| registry | `/dsh-agent-registry/*` | `/api/dsh-claw/registry/*` |
| policy | `/dsh-agent-policy/*` | `/api/dsh-claw/policy/*` |
| permissions | `/dsh-session-permissions/*` | `/api/dsh-claw/permissions/*` |
| gate | `/dsh-agent-gate/*` | `/api/dsh-claw/gate/*` |
| identity | `/dsh-agent-identity/*` | `/api/dsh-claw/identity/*` |
| memory | `/dsh-agent-memory/*` | `/api/dsh-claw/memory/*` |
| observability | `/dsh-observability/query` | `/api/dsh-claw/observability/query` |
| delegate | `/dsh-agent-delegate/handoff` | `/api/dsh-claw/delegate/handoff` |

Registry 需逐一迁移：`list`、`explain`、`archive`、`rename`、`create`、`diag`、`policy`、`skills`、`models`、`model`、`leave-behind`、`template`、`restore`。

### 9.3 迁移策略

- `dsh-claw-*@0.3.0` 只注册新 `/api/dsh-claw/...` 路径，不保留 `/dsh-*` adapter。
- 旧路径继续只属于 `dsh-agent-*@0.2.x`；安装/启用前检查 old/new row 冲突，命中即拒绝并给出整套升级指引。
- Web/Desktop 完成整套升级后必须重启，禁止旧 Client bundle 与新 Host 的半升级组合。
- lab 安装脚本采用 transaction：先验证 exact version 与 tarball integrity，再停用旧 row、安装全套新包；任一组件失败时恢复旧 row 集合。
- mutating route 仅允许 POST。
- 所有 fetch disposer 由 `ctx.effect` 管理。
- Client 只使用相对 `/api/...`，不区分 Web 与 `dsh-app://`。
- 测试必须覆盖 Desktop 风格 Request，无 localhost Origin 假设。

### 退出标准

- 产品 Client 不再调用 `/dsh-*`。
- 新包运行时不注册任何 `/dsh-*` adapter，old/new 套件无法同时 ACTIVE。
- 每个路由都有 method、body 上限、错误码、dispose 测试。
- Web 与 Desktop 对同一 handler contract 测试一致。

## 10. 迭代 4：完成包更名、meta bundle 与 npm/Desktop 发布链

### 10.1 消费 M0 的 Loader ADR

本迭代不得重新讨论包形态，只实施 M0 已验证的 A/B/C 结论：

- A：发布 `core → components → suite`，suite 锁定 exact dependency versions。
- B：发布单 suite 包，多 patch rows 引用已验证的 subpath exports。
- C：发布单 suite 包、单 Loader row；内部模块仍保持明确边界和独立单测，但 UI 只提供整体 enable/disable。

如果实现暴露出 M0 实验未覆盖的 Loader 差异，应回到 ADR 补实验；不得临时要求用户逐个装包。

### 10.2 manifest 与身份迁移规则

- meta bundle `dsh-claw-suite` 是用户唯一安装入口。
- 组件以正常 dependencies 被带入；官方 `@deepseek-ai/*` 只放 peerDependencies。
- 每个组件：
  - package name；
  - `cordis.patch.yml` 的 `id`；
  - patch `name`；
  - Client loader id；
  必须一致。
- 发布 manifest 禁止 `file:`、`link:`、绝对路径。
- 每个包 `files` 必须包含全部运行时模块、生成物、patch、README、LICENSE。
- Client 仍声明 `dsh.client.platform: "web"`；Desktop 使用同一 Client 平台。

身份迁移表：

| 旧身份 | 0.3.0 身份 | 数据身份 |
|---|---|---|
| `dsh-agent-registry` | `dsh-claw-registry` | `$DSH_HOME/DSclaw`、registry records 不变 |
| `dsh-agent-policy` | `dsh-claw-policy` | policy 文件名/字段不变 |
| `dsh-session-permissions` | `dsh-claw-permissions` | session/agent policy binding 不变 |
| `dsh-agent-gate` | `dsh-claw-gate` | receipt/error code 不变 |
| `dsh-agent-delegate` | `dsh-claw-delegate` | task/generation/worktree record 不变 |
| `dsh-agent-identity` | `dsh-claw-identity` | identity 文件与 agent id 不变 |
| `dsh-agent-memory` | `dsh-claw-memory` | vault/diary/brief 路径不变 |
| `dsh-observability` | `dsh-claw-observability` | audit schema/code 不变 |

更名覆盖 npm name、patch row `id/name`、Host namespace、Client loader id 与 GitHub 安装说明。GitHub 仓库建议同一发布窗口更名并依靠 redirect；仓库更名失败不阻断运行时，但文档不得继续生成旧的 `dsh plugin add github:...` 示例。源码目录可在同一版本重命名，用户数据目录不随源码目录迁移。

### 10.3 消除 sibling import

现有跨包 import 全部改成 package export，例如：

```js
import { resolveLayersSync } from 'dsh-claw-permissions/layers'
import { CODES, operation } from 'dsh-claw-observability/observe'
import { normalizePolicy } from 'dsh-claw-policy/schema'
```

目标包需在 `exports` 明确导出这些 subpath；未导出的内部文件不得被其他组件引用。

### 10.4 版本策略

这是运行时契约与发布身份的 breaking change，建议统一：

- 验证版：`0.3.0-rc.1`
- Desktop 验收修订：`0.3.0-rc.2`
- 稳定版：`0.3.0`

meta bundle 锁定同批组件的精确版本，避免半套升级。

### 10.5 公共发布链

唯一可宣称“Desktop 可安装”的链路是：

```text
workspace 全测
  -> clean temp npm pack/install
  -> 发布 core/components 0.3.0-rc.N 到 npmjs.org dist-tag next
  -> 发布 suite 0.3.0-rc.N 到 next
  -> Desktop Plugins GUI 安装 exact 0.3.0-rc.N
  -> 冷启动/热启停/卸载验收
  -> 同批 promote/publish 0.3.0 latest
```

GitHub Packages 不作为默认用户安装源；本机 tarball 只证明候选包结构，不代替公共 registry 安装验收。

### 退出标准

- package graph 扫描无 `../dsh-`。
- 干净临时目录中可 `npm pack`、安装、import 所有 exports。
- Desktop 只安装 meta bundle 即可激活全部行。
- Desktop Plugins GUI 能从 npmjs.org 安装 exact RC，最终 stable 使用 `latest`。
- A/B 下单组件 disable 不破坏无依赖组件，缺关键安全组件时整体状态显示 degraded；C 下只允许整体 disable，但内部 8 个模块必须分别暴露 health/degraded 诊断。

## 11. 迭代 5：逐组件补齐 rc.2 行为

### 11.1 Identity

- 保持 `agent/created` 作为 prompt 注入时机。
- 所有路径必须先验证属于对应 Claw agent home。
- 从 core 引入 path containment helper，删除 sibling import。
- read/write 路由迁到 Connection Fetch。
- 测试 resume/clear/compact、软链接逃逸、跨 agent 读取、卸载。

### 11.2 Memory

- 通过公开 identity/core API 判断 Claw 路径，不导入 sibling 源文件。
- Vault、diary、Main brief 的写入使用原子 replace/rename；失败保留旧文件。
- prompt 组装限定字节预算并标注来源。
- 测试两个 agent 同名文件不串读、重启恢复、损坏 entry 跳过并诊断。

### 11.3 Policy

- policy schema 成为稳定公共 export。
- template default 的新写入带 `schemaVersion`。
- 缺少 `schemaVersion` 的旧策略按 v1 兼容读取；读取不落盘，只有用户正常保存时才写入当前 version。
- 未知字段原样保留或进入显式 validation error，不做启动时向上迁移或静默丢弃。
- 包名迁到 `dsh-claw-policy`，避免 npm 冲突。

### 11.4 Observability

- trace id 在 HTTP、tool、delegate 三个入口一致传播。
- 默认 sanitize 绝对路径、token、prompt secret、credential 字段。
- query 路由支持上限与游标，禁止一次加载完整审计文件。
- 包名迁到 `dsh-claw-observability`。

### 11.5 UI 生成链

涉及 Client 的组件：Registry、Gate、Observability、Permissions。

- 只编辑 `*.mjs` 源文件。
- `npm run build` 生成 `client.js`。
- `npm test` 首步执行 `build:check`。
- 每个 Client 增加：
  - loader factory 返回 `module.exports`；
  - locale 延迟切换；
  - slot late declaration；
  - dispose 后 DOM/style/body attribute 无残留；
  - Desktop `dsh.client.platform = web` 契约测试。

## 12. 迭代 6：真实 Web/Desktop 集成验收

### 12.1 自动化层级

| 层级 | 目的 | 门禁 |
|---|---|---|
| Unit | 纯策略、路径、预算、迁移 | 每个组件 `npm test` |
| Contract | rc.2 服务形状与事件字段 | `verify-rc2-contract.mjs` |
| Package | tarball/exports/patch/依赖图 | `verify-package-graph.mjs` |
| Web integration | 完整 profile 挂载与业务流 | `web-claw-v02` + lab CLI `0.2.0-rc.2` |
| Desktop integration | Electron Host + `dsh-app://` + 冷启动 | Desktop 产品 `0.2.0-rc.1` |

Web integration 的 Host/Client 必须是 `0.2.0-rc.2` lab pin；矩阵外版本只运行“被 version floor 拒绝”的负向用例。

### 12.2 Desktop 实机用例

1. 用户完全退出 Desktop（Cmd+Q）。
2. 通过 Desktop Plugins GUI 从 npmjs.org 安装 exact `dsh-claw-suite@0.3.0-rc.N`，记录 resolved version 与 integrity。
3. 打开应用：A/B 确认 8 个组件 row 均 ACTIVE；C 确认 suite 单 row ACTIVE 且 8 个内部模块 health 全绿。两种形态都不得有 PENDING/FAILED。
4. 创建一个普通 Workspace 会话，确认不被误纳入 Claw。
5. 创建两个 Claw agent A/B。
6. 分别验证：
   - 新 session header 分别绑定 A/B 对应 `wa-*` preset；
   - 初始 model 为各自 agent 默认值，之后用官方 picker 修改不会被强制复原；
   - Claw session 只在 Claw mode 可见，Workspace 的 group/flat/search/archived 投影均不重复显示；
   - identity 文件只注入自己的 agent；
   - memory 互不读取；
   - policy、skills、MCP、model 视图正确；
   - session permission UI 读写后立即生效。
7. A 委派 research child 与 write child：
   - research child 无越权写；
   - write child 有独立 worktree；
   - child policy 不超过 A；
   - 旧 generation 结果被拒绝。
   - 一次性 tool result、continuable child message、write-child handoff 三条交付路径分别命中预算/stale 规则。
8. 运行中关闭/重新启用 permissions、gate：
   - 已有会话立即重新 pin；
   - 缺关键组件时状态显示 degraded；
   - 不出现权限短暂放宽窗口。
   - 冷 session 不被批量 hydrate；单独 resume 后在第一轮 tool call 前完成 pin。
9. 关闭窗口再打开，确认 navigation、memory、agent binding 恢复。
10. 完全重启应用，重复关键读取与一次委派。
11. A/B 禁用单组件、C 禁用 suite，确认相应 disposer 无残留且安全状态不被误报为完整。
12. 卸载 suite，确认官方 Workspace、preset、Session UI 恢复，用户数据仍可恢复。
13. 尝试安装旧 `dsh-agent-*` 与新 `dsh-claw-*` 混合版本，确认在激活前被拒绝；不出现双 row ACTIVE。
14. 在未授予 exact-version exemption 的 alpha.2 Web profile 尝试启用 0.3.0，确认官方 compatibility preflight 显示明确的不兼容版本，而不是降级运行。

### 12.3 版本一致性门禁

发布声明前必须生成：

| Surface | 要求 |
|---|---|
| Workspace | 8 个组件/新包均为同批版本 |
| Web profile | Host `0.2.0-rc.2`（`web-claw-v02`），Claw 与 workspace 完全一致 |
| Desktop profile | Desktop 产品 `0.2.0-rc.1`，Claw 与 workspace 完全一致，不允许 missing |

只要 Desktop 仍缺包，就不能写“已适配 Desktop”。

## 13. 数据兼容、包身份切换与回滚

### 13.1 0.3.0 数据规则：兼容读取，不做 eager migration

- `$DSH_HOME/DSclaw` 下现有数据路径与文件名保持不变。
- 缺少 `schemaVersion` 的记录按 v1 解释；只读/启动不得因为“补版本号”改写文件。
- 用户执行正常编辑时可以把该条记录写成当前 schema；写入必须原子化并保留未知字段。
- 不创建全局 migration marker，不在启动时扫描/重写全部 agent、memory、policy 或 delegate record。
- `.agent-presets` 只进入诊断报告，不复制、不删除、不改写。
- 包身份切换只替换 Loader/package identity，绝不更改 agent id、`wa-*`、binding、worktree receipt 或 audit code。

只有未来版本确实引入 v1 无法表达的 schema 时，才单独设计 `from -> to` migration、备份、幂等 marker 与降级策略；该工作不计入 0.3.0 DoD。

### 13.2 整套回滚

- 升级前导出 old row/version 清单与 package integrity；不复制用户数据。
- 安装失败时恢复旧 row 集合和旧 package versions，并要求重启 Host/Client。
- 已成功运行 0.3.0 后可整套回退到最后一个兼容的 0.2.x；不能只降 permissions/gate/delegate 任一安全组件。
- 因 0.3.0 不 eager migrate 数据，旧版仍能读取原字段；若用户在 0.3.0 正常保存过带 `schemaVersion` 的记录，0.2.x 忽略该可选字段的行为必须有回归测试。
- 回滚通过重新安装旧 Client/Host 完成，不依赖新包注册旧 HTTP adapter。
- worktree 清理失败时保留 recovery receipt，不自动强删。

## 14. PR/提交拆分

建议按以下顺序，每个 PR 可独立验证：

1. `test(rc2): add contract, slot, version-floor and package graph gates`
2. `spike(loader): decide meta, subpath or single-row Desktop packaging`
3. `feat(core): publishable claw core, classifier and shared invariants`
4. `fix(permissions-gate): pin live/resumed agents and fail closed by classifier`
5. `fix(delegate): enforce three child-delivery seams without reportFrom`
6. `feat(registry-create): provision wa presets and create with preset/model`
7. `refactor(registry-ui): adopt uiWorkspace slots and dual-view semantics`
8. `refactor(http): move Claw APIs to connection.fetch without legacy adapters`
9. `refactor(packages): rename dsh-claw components and remove sibling imports`
10. `feat(bundle): publish exact-version dsh-claw-suite candidate to npm next`
11. `test(integration): pass rc.2 Web and Desktop acceptance matrix`
12. `docs: publish install, package-identity switch, rollback and compatibility statement`

每个 PR 都要包含：实现、测试、生成物、README/迁移说明；不得把文档推迟到最终发布 PR。

## 15. 工作量与里程碑

| 里程碑 | 预计工程日 | 主要风险 |
|---|---:|---|
| M0 契约/Loader/core/Web lab | 3–5 | Loader dependency/subpath 行为、rc.2 lab 隔离 |
| M1 安全 P0 | 2–3 | delegate 真实交付边界需要梳理 |
| M2 Registry rc.2 重构 | 5–7 | 动态 preset 生命周期、model partial completion、UI slots |
| M3 HTTP 迁移 | 2–3 | 路由错误码统一、禁止半升级安装 |
| M4 更名/meta/公开 RC | 2–4 | npm 发布顺序、old/new identity 冲突 |
| M5 双面验收与修订 | 3–5 | Electron 冷启动与 profile 安装链 |

总量约 **17–27 单人工程日**，不是自然日承诺。M0 完成并冻结契约后可分三条工作流并行：

- A：permissions / gate / delegate；
- B：Registry preset/create/navigation/UI；
- C：HTTP helper / Identity / Memory / Policy / Observability。

三条流最后在 package rename/meta bundle/Desktop 验收汇合。并行可以压缩日历时间，但不减少上述工程量，并应预留约 10–15% 的接口协调与合并成本；任何工作流都不能绕过 core、classifier、package graph 与 rc.2 contract 门禁。

## 16. Definition of Done

只有同时满足以下条件，才可以把状态改成“适配 DSH Desktop 0.2.0-rc.1 / 契约 0.2.0-rc.2”：

- [ ] 源码中不存在已删除 API：`connection.api`、`sessions.open/get`、`workspaces.startSession`、`agents.values`、`subagents.reportFrom`。
- [ ] Registry 不再 monkey patch 官方 store/service，不再用 DOM 作为业务权威。
- [ ] 新建 Claw session 在打开前已绑定正确 `wa-*` preset，并完成 agent 默认 model 的初始选择；失败时有可恢复的 partial-completion。
- [ ] `工作区 / Claw区` 使用官方 Browser Mode seam 唯一分区；同一 `sessionId` 不重复，卸载后官方全集可恢复。
- [ ] `claw | ordinary | claw-uncertain` classifier 有路径、binding、header 与 Registry 缺失测试；对 `claw`、`claw-uncertain` fail closed，不误伤 `ordinary` Workspace。
- [ ] live-agent 热启用 sweep 与 cold-session resume 首轮 barrier 均通过；未 hydrate 历史 session 不被批量加载。
- [ ] 一次性 tool result、continuable child → parent message、write-child handoff 三条路径都有 stale/预算自动化证据。
- [ ] 25 处跨 sibling import 清零。
- [ ] 所有产品 HTTP 使用 `/api/dsh-claw/...` Connection Fetch。
- [ ] 新包未注册旧 `/dsh-*` adapter，old/new package rows 不可同时 ACTIVE。
- [ ] 8 个组件 unit + build check 全绿。
- [ ] rc.2 contract 与 package graph gate 全绿。
- [ ] `dsh-claw-core` 从 M0 起是独立可 pack 的 exact-version dependency；发布 manifest 无 `file:`、`link:`、`workspace:*`。
- [ ] A/B/C 中一个 Loader 方案在 Desktop 实测通过，用户只安装一个 suite 包。
- [ ] 干净 tarball 安装测试通过；npmjs.org `next` 的 exact RC 可由 Desktop Plugins GUI 安装。
- [ ] suite/所有 runtime component 的 DSH peer 为 `^0.2.0-rc.1`（或验收允许的 exact `0.2.0-rc.1`/`0.2.0-rc.2`；core 必须 `^0.2.0-rc.1`）；Web `0.2.0-rc.2` 完整业务流通过，矩阵外版本在无 exemption 时明确拒绝。
- [ ] Desktop 产品 `0.2.0-rc.1` 冷安装、冷启动、热启停、重启、卸载通过。
- [ ] Workspace/Web/Desktop 版本表一致。
- [ ] 旧数据按 v1 兼容读取，启动不批量改写；整套 0.2.x ↔ 0.3.0 回滚测试通过。
- [ ] 安全不变量 10 条全部有自动化或实机证据。
- [ ] 发布说明写明：`Verified with DSH Desktop 0.2.0-rc.1`（契约 `0.2.0-rc.2`）。
- [ ] 文档不再宣称笼统的 `DSH 0.1.6-alpha.1+` 兼容。

## 17. 实施时必须对照的官方 rc.2 源码

所有接口判断从官方 tag 读取，不跟随本地 dirty worktree：

```text
packages/api/session-controller/src/client/contract/sessions.ts
packages/api/session-controller/src/client/sessions/service.ts
packages/api/session-controller/src/types.ts
packages/api/session-controller/src/index.ts
packages/api/session-controller/src/commands.ts
packages/api/gateway/src/client/index.ts
packages/client/ui-workspace/src/client/navigation.ts
packages/client/ui-workspace/src/client/contract/slots.ts
packages/client/ui-sidebar/src/client/contract/slots.ts
packages/client/connection/src/rpc.ts
packages/core/agent/src/index.ts
packages/core/tools/src/index.ts
packages/subagent/subagent/src/index.ts
packages/subagent/subagent/src/types.ts
packages/preset/agent-preset-registry/src/index.ts
packages/preset/agent-preset-registry/src/definition.ts
packages/client/ui-settings-plugins/src/client/index.ts
apps/desktop/src/main.ts
apps/desktop-host/src/index.ts
```

读取命令统一使用：

```sh
git -C /Users/qin/DSH/deepseek-harness-desktop-official \
  show dsh-v0.2.0-rc.2:<path>
```

不得以当前 checkout 文件替代 tag 内容，因为该 checkout 已落后且包含未提交改动。

---

本计划的第一条实施任务是完整 M0：**rc.2 契约门禁 + Loader ADR + 独立 core + rc.2 Web lab**，而不是直接修改 Registry UI 或安全组件。M0 既要让旧 API 在 CI 中稳定失败，也要提前证明发布形态可行，避免安全逻辑和 Registry 在错误包边界上二次返工。
