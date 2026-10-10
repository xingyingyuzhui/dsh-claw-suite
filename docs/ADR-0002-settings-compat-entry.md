# ADR-0002 — 没有侧栏分区接口时的 Claw 入口，以及 `wa-*` 预设的运行时供给

**状态：已采纳（0.3.0-rc.2 起）**

| 项 | 内容 |
|---|---|
| 日期 | 2026-10-10 |
| 取代 | 修复计划 §3「seam 是硬前提」、§16「禁止双入口」中关于**入口位置**的冻结结论（只改入口，不放宽隔离与安全要求） |
| 落实 | 迭代计划 §4.3「Claw 动态 preset 供给」（此前未实现） |
| 验证环境 | DSH `0.2.0-rc.2` Web lab（`web-claw-v02`）；Desktop `0.2.0-rc.2` 待用户验收 |

## 背景

1. **侧栏分区接口不存在。** Claw 区原计划挂在官方侧栏的分区接口 `ctx.uiWorkspace.registerBrowserMode` 上（修复计划 §5）。截至 `dsh-v0.2.1-alpha.2`，官方任何发布版都没有这个接口；它只在我们本地分支 `feat/workspace-browser-modes` 上。DeepSeek 的 CONTRIBUTING 不收外部 PR，只能走 GitHub Discussions 提需求，排期不由我们决定。
2. **按原冻结结论，没有接口就没有入口。** 修复计划 §16 禁止 DOM 补丁和“静默双入口”。结果是在当前官方 DSH 上，用户根本没地方新建 Claw Agent、开 Claw 会话。
3. **`wa-*` 预设在 0.2 上从未被创建。** 0.1 时代靠 `agentPresets.copy()` 复制预设文件；0.2 的预设注册表没有 `copy` / `remove` / 文件路径，预设改为“组合声明”：`agentPresets.register({ id, name, plugins })`。迭代计划 §4.3 写了要改成运行时注册，但 rc.1 没实现，所以新建 Claw 会话报 `Unknown agent preset: wa-<名字>`。

## 决定

### A. 入口：有接口用侧栏，没有接口用「设置 → Claw Agent」

- Client 启动时检测 `ctx.uiWorkspace.registerBrowserMode` 是否为函数（`hasBrowserModeSeam`）。
  - **有：** 照原计划注册侧栏 Claw 区，设置页保持原样。
  - **没有：** 在官方 `settings.section` 槽里的「Claw Agent」页顶部加一块 Claw 区面板，可以新建 Agent、展开会话、在 Agent 下开新会话。开会话成功后调用槽位提供的 `close()` 关掉设置，直接进入新会话。
- 面板顶部有一句说明：当前 DSH 没有侧栏分区接口，Claw 区暂时放在这里；Claw 会话也会出现在左侧普通工作区列表里；权限、闸、人设、记忆照常生效。这是**明示的**兼容入口，不是静默双入口。
- 仍然**不做**任何 DOM 补丁、monkey patch、私有 API 调用。合同扫描（`verify-rc2-contract`）继续把这些挡在门外。
- 官方合入分区接口后不用改配置：同一个包检测到接口就自动切回侧栏。

### B. `wa-*` 预设：Registry Host 在运行时注册

- 新模块 `dsh-claw-registry/registry-preset-supply.mjs`：
  - **底稿：** 按顺序取第一个可用的预设：用户自己声明的 `wa-template` → 官方 `standard` → 当前默认预设（如果它不是 Claw 预设）。用公开的 `agentPresets.readDocument(id)` 读组合 YAML，再按官方 `!!js` 方言解析成 `{ __jsExpr }`（与 `@deepseek-ai/cordis-plugin-include` 的 `entryListSchema` 同形；那个包装在 DSH 应用里，插件 import 不到，所以用 `js-yaml` 复刻同一方言）。
  - **注册：** 每个 Agent 调一次 `agentPresets.register({ id: 'wa-<slug>', name: 'Claw · <名字>', order: 1000, plugins })`，保存返回的注销函数；插件卸载时全部注销。并发调用只注册一次；“已注册”视为就绪；失败不缓存，下次重试。
  - **时机：** Host 启动后在后台为登记表里的全部 Agent 注册；新建 Agent 后立刻注册；开会话前 Client 调 `/api/dsh-claw/registry/preset/ensure` 等待就绪。
- **不回退：** 预设注册失败时不建会话，提示“预设没有装载成功”，诊断里记 `REGISTRY_PRESET_UNAVAILABLE`。绝不改用 `standard` 冒充 Claw 会话（迭代计划冻结决定 1）。为此删除了 0.1 时代的 `fallbackMissingPreset` / `aliasClawPresetId` / `ensureGeneratedPreset` 等基于复制和文件路径的辅助函数。
- 归档 Agent 不注销预设（旧会话恢复时还要用）。

## 代价与取舍

- **Claw 会话出现在普通工作区列表里。** 没有分区接口，就无法在不打补丁的前提下把它们从官方列表里拿走。面板说明文字明确告诉用户这一点；隔离靠显式绑定（Registry v2 `sessionBindings`）和权限/闸，而不是靠“看不见”。
- **`Claw · <名字>` 出现在官方模式选择器里。** 官方选择器列出所有已注册预设，隐藏它们同样需要补丁。这些行用 `order: 1000` 排在官方预设之后，名字带 `Claw ·` 前缀。普通会话误选它们时，权限层按 `wa-*` 识别为 Claw 上下文，只会更紧，不会更松。
- **底稿跟着官方 `standard` 走。** 官方更新 `standard` 后，Claw 预设下次启动时自动跟上。用户想固定底稿，可以在 profile 里声明 `wa-template`。
- **新增运行时依赖 `js-yaml`。** 只在 Host 端使用，不进 Client 包。

## 验证

- 单元测试：`test/registry-preset-supply.test.mjs`（解析方言、底稿顺序、并发、重复、失败重试、注销），`test/registry-host.test.mjs`（新建即注册、`preset/ensure` 成功与 409），`test/registry-compat-panel.test.mjs`（兼容面板、`close` 传递、订阅清理）。
- 合同门禁新增 Client inject 检查：Client 用到的 `ctx.X` / `ctx.remote.Y` 必须在 `inject` 里声明（rc.1 就是漏了 `remote.session`，单测用假 ctx 看不出来）。
- Web lab `0.2.0-rc.2`：设置 → Claw Agent 新建 `lab-a` → 官方模式选择器出现 `Claw · lab-a` → 点 `+` → 设置关闭、进入新会话、模式为 `Claw · lab-a` → 登记表 `sessionBindings` 写入 `presetId: wa-lab-a`、`state: ready`。

## 退出条件

官方发布带 `registerBrowserMode` 的版本后：

1. 在 README「DSH 兼容」表里把该版本标成“侧栏 Claw 区”；
2. 兼容面板保留给旧版 DSH，直到 peer 下限越过最后一个没有接口的版本，再删掉 `registry-compat-panel.mjs`。
