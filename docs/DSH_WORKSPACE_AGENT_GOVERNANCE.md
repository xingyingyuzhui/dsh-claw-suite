# DSH 工作区 Agent 治理框架

> 状态：架构提案；第 15 节产品决策已锁定（2026-08-17）  
> 目标运行面：DeepSeek Harness 的 web profile，兼容后续 headless profile  
> 交付形态：一组可独立安装、独立迭代的治理插件，而不是一个大包  
> 范围：工作区、Agent 身份、人设/记忆、工具/MCP/Skill 权限、审批、委派与审计

## 1. 目标

把“打开一个项目目录”升级为“进入一个受治理的项目专属 Agent”。

用户创建或打开一个工作区后，系统为它绑定一个稳定的 Workspace Agent。这个 Agent 不只是一个会话，而是一组不可混淆的运行时事实：

- 工作区的规范化根目录；
- Agent 身份、角色、人设和项目规则；
- 私有长期记忆与会话历史；
- 可调用的工具、MCP、Skill、凭据引用；
- 文件效果边界、审批策略和委派上限；
- 可追溯的权限决策与操作审计。

Main Agent 是控制面：创建、编排、审计和升级授权。它可以默认读取各 Workspace Agent 的**脱敏记忆摘要**，但不因“权限最大”而自动读取原文、凭据、原始 tool 结果，或无条件修改其文件。

## 2. 设计目标与非目标

### 目标

1. 每个工作区有稳定的专属 Agent 身份，并可跨会话恢复。
2. 每个 Agent 的读、写、工具、MCP、Skill、审批和委派策略可以独立配置。
3. 权限以 DSH 的不可变 Session cwd、不可变工具调用身份和每次调用的 sandbox policy 为事实来源。
4. 子 Agent 只能得到父 Agent 能力的子集，不能借委派提权。
5. 任何高风险动作都能说明：谁、在哪个工作区、以哪个角色、调用了什么、为何允许或拒绝。
6. 不改 DSH 官方源码；优先通过 bundle/plugin、Agent preset、工具执行管道和 sandbox seam 扩展。

### 非目标

- 不把工作区目录本身误当成操作系统安全边界。
- 不把 SOUL.md、系统提示词或“隐藏工具”误当成强制访问控制。
- 第一阶段不承诺隔离不受信任的同进程第三方插件；这需要独立进程、容器或远程 sandbox。
- 不将私有记忆、OAuth 刷新令牌或原始工具结果默认在 Agent 间共享。

## 3. DSH 中已有的基础能力

本框架建立在 DSH 已有契约之上，而非重新发明执行运行时：

| DSH 能力 | 在本框架中的职责 |
| --- | --- |
| Workspace registry | 记录规范化路径、稳定 workspace id 与会话归属；用于组织与索引，不单独承担安全隔离。 |
| Session Header | 固化 session 的 cwd、Agent preset、父会话和委派深度，是恢复与重放时的身份锚点。 |
| sandboxPolicy / sandbox | 每次调用解析文件效果策略；read-only、workspace-write、danger-full-access 由执行器实际实施或 fail-closed。 |
| tools 执行管道 | 在 tools/pre-execute 做可扩展策略，在 tools.guard 做最终单调拒绝。 |
| approval | 对具体 action 做一次性许可；没有合法答复时拒绝，并将决定写入审计事件。 |
| Agent preset / scoped context | 为每个 Agent 或 session 组装不同的工具、提示词与能力域。 |
| subagents | 承接受限委派；由本框架管理谁能委派、委派给谁、深度与预算。 |

参考：[DSH Architecture](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/architecture.md)、[Workspaces](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/workspace.md)、[Process Sandbox](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/sandbox.md)、[User Approval](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/approval.md)。

## 4. 总体模型

~~~mermaid
flowchart TB
  Operator["用户 / 操作员"] --> Main["Main Agent：控制面"]
  Main --> Registry["Workspace-Agent Registry"]
  Registry --> WA["Workspace A Agent"]
  Registry --> WB["Workspace B Agent"]

  WA --> ASession["Session：immutable cwd = A"]
  ASession --> APolicy["能力快照 / policy version"]
  APolicy --> Gate["工具策略与最终 guard"]
  Gate --> Approval["一次性审批（如需要）"]
  Approval --> Sandbox["fs / shell / sandbox provider"]
  Sandbox --> Audit["会话审计 + 治理日志"]

  WA --> Delegate["委派 Broker"]
  Delegate --> Child["Child Agent：能力只能衰减"]
~~~

### 核心不变量

1. **一个 session 只属于一个 workspace。** Header 中规范化后的 cwd 必须与绑定工作区一致。
2. **一个 Workspace Agent 有一个稳定 id。** 重命名工作区或更换显示标题不改变 Agent id。
3. **策略在调用时求值、在调用内冻结。** 不能先审批低风险参数，再把同一 tool call 改成高风险参数。
4. **委派不放大权限。** child capabilities 是 parent effective capabilities 与 child role ceiling 的交集。
5. **deny 优先。** 任一层明确拒绝即拒绝；更低层不能补回已移除的能力。
6. **高风险成功必须有可验证的授权证据。** 无审批、审批过期、调用身份漂移、sandbox 无法保证所需边界，均拒绝。

## 5. 身份、目录与信息边界

### 5.1 Agent 私有目录

建议把 Agent 私有状态放在 DSH home 下，而不是写入用户项目仓库：

~~~
~/.dsh/workspace-agents/
  registry.json
  main/
    SOUL.md
    AGENTS.md
    USER.md
    policy.json
    memory/
  wa_<workspace-id>/
    identity.json
    SOUL.md
    AGENTS.md
    USER.md
    policy.json
    memory/
    audit/
~~~

项目仓库内原有的 AGENTS.md、.agents/、.dsh/skills/ 仍是**项目共享输入**；它们不替代上面的私有身份文件。

### 5.2 文件职责

| 文件 / 数据 | 作用域 | 用途 |
| --- | --- | --- |
| SOUL.md | Agent 私有 | 角色、语气、职责、禁止事项和交接边界。 |
| AGENTS.md | Agent 私有 + 项目共享 | 私有部分定义执行准则；项目根文件定义仓库规范。两者应标明优先级。 |
| USER.md | Agent 私有 | 该项目的用户偏好、语言、沟通与验收偏好。 |
| memory/ | Agent 私有 | 可检索长期记忆；默认不可被其他 Agent 原样读取。 |
| policy.json | Agent 私有、控制面可写 | 权限声明、角色、版本、审批与委派限制。 |
| Session log | DSH 会话私有 | 可重放的事实与工具结果；跨 Agent 只可经授权摘要移交。 |

### 5.3 记忆共享规则

- 同一 Workspace Agent 的不同 session 可使用本 Agent 的私有记忆。
- Main Agent 只接收经委派 Broker 生成的、字段受限且可脱敏的交接摘要。
- 跨 workspace 默认不共享；需要共享时创建显式 memory-share 授权，限定来源、目标、字段、过期时间和用途。
- 凭据、原始审批内容、工具原始输出、其他 Agent 的内部指令不得进入共享摘要默认字段。

## 6. 权限模型

### 6.1 权限不是一张表

有效权限由多个互相收紧的层计算：

~~~
平台基线
  ∩ Main Agent 授权上限
  ∩ Workspace Agent policy
  ∩ 当前角色 / agent preset
  ∩ 当前 session 状态
  ∩ 当前工具与参数规则
  ∩ sandbox 实际可实施边界
  ∩ 一次性审批（如果要求）
~~~

任何一层拒绝，结果即为拒绝。Skill 只影响模型可见的操作说明，不增加工具或文件系统权限。

### 6.2 可配置能力面

| 能力面 | 策略示例 | 强制点 |
| --- | --- | --- |
| 文件读取 | none / workspace-read / 指定只读根 | fs provider 与路径策略。 |
| 文件写入 | none / workspace-write / task worktree | sandbox policy 与 fs sandbox。 |
| Shell / 进程 | 禁止 / 命令 allowlist / 审批后一次性 | tool gate、approval、sandbox executor。 |
| 内置工具 | 显式 tool id allowlist | Agent preset + pre-execute + final guard。 |
| MCP | 每 Agent 可见 server/tool allowlist | MCP 注册、凭据路由、工具 gate。 |
| Skill | 基线 + allowlist | Agent-scoped candidate filter。 |
| 网络 | 禁止 / 指定 provider / 指定域名 | 独立 egress/provider 策略；不能假设文件 sandbox 会限制网络。 |
| 凭据 | 仅引用名、按 Agent 映射 | credential provider；Agent 不应得到全局 secret 枚举。 |
| 委派 | 禁止 / 指定角色 / 最大深度 | subagents 外的治理 Broker。 |
| 审批 | never / ask / 条件 ask | approval 与治理规则。 |

### 6.3 预设基类与空白初始化

每个 Agent 的能力面（文件读/写、shell、内置工具、MCP、Skill、网络、凭据、委派、审批）都是**可单独拆开配置**的，语义接近 OpenClaw 的 per-agent sandbox + tools allow/deny，而不是绑死在一个枚举上。

**新 Agent 的出厂状态是只读**：文件写 = none，shell = 禁止，MCP/Skill 仅继承控制面「初始化默认」开关里勾上的只读项，委派禁止。这是空白基线，不是一个不可改的角色。

预设基类是**协助选择的模板**，套用后仍可逐项改：

| 预设 | 文件 | 工具 / MCP | 委派 | 审批 |
| --- | --- | --- | --- | --- |
| main | 由操作员明确授权；默认可读各 Agent 的脱敏记忆摘要，不可读原文 | 控制面、审计、创建 Agent | 可创建受限 child | 高风险动作询问 |
| research | 只读 workspace | read、搜索、受信任检索 MCP | 禁止 | 不可用即拒绝 |
| developer | 工作区可写（主会话直接写项目根） | read/edit/test；发布与凭据 MCP 默认禁用 | 仅 research / reviewer | 写入通常自动；外部动作询问 |
| reviewer | 只读 workspace | read、diff、测试、质量工具 | 禁止 | 永不写入 |
| release | 工作区只读，部署产物按专用目标写 | 发布 MCP、部署工具显式列出 | 禁止 | 每次外部变更均询问 |
| public | 无宿主读写或独立 sandbox | 少量无状态工具 | 禁止 | 默认拒绝 |

预设是上限起点，不是捷径。套用 developer 并不自动获得 shell、发布 MCP 或凭据。把某一面从 deny 改成 allow，不影响其它面。

## 7. 不可变性如何参与授权

“不可变模式”在本框架中不是一个抽象口号，而是四层绑定：

1. **不可变 workspace 身份**：WorkspaceId 对应 canonical path；路径显示名变化不改变身份。
2. **不可变 session 根**：创建 session 时记录 cwd；该 cwd 是 normal tool call 的 sandbox workspace root 来源。
3. **不可变工具调用身份**：在策略开始前冻结 tool name、arguments、agent、call id 和执行 token。
4. **不可变授权关联**：审批和策略决策引用这次 tool call 的身份；授权不能挪用到另一调用。

建议的决策记录：

~~~json
{
  "decisionId": "policy_...",
  "time": "2026-08-17T00:00:00.000Z",
  "workspaceId": "ws_...",
  "agentId": "wa_...",
  "sessionId": "session_...",
  "policyVersion": 12,
  "tool": "edit",
  "callId": "call_...",
  "argumentDigest": "sha256:...",
  "sandbox": { "mode": "workspace-write", "root": "/canonical/path", "enforcement": "full" },
  "decision": "allow",
  "reason": "developer write scope"
}
~~~

argumentDigest 只用于关联与防漂移；审计 UI 依据既有 tool call 展示参数，避免在多个位置复制并产生不一致。

## 8. 生命周期流程

### 8.1 新建 / 打开工作区

~~~mermaid
sequenceDiagram
  participant U as 用户
  participant W as Workspace Registry
  participant G as Governance Registry
  participant A as Workspace Agent
  participant S as Session

  U->>W: 选择目录
  W->>W: canonicalize(realpath)
  W->>G: ensureBinding(workspaceId, canonicalPath)
  alt 第一次打开
    G->>A: 创建 identity + 默认角色
    G->>A: 初始化 SOUL/AGENTS/USER/policy/memory
  end
  G->>S: 创建 session(cwd=canonicalPath, agentPreset=...)
  S-->>U: 进入该 workspace agent
~~~

规则：同一 canonical path 永远复用同一 Workspace Agent；换目录会进入另一个 Agent，而不是在原 Agent 内改 cwd。

### 8.2 一次工具调用

~~~mermaid
sequenceDiagram
  participant A as Agent
  participant T as Tool registry
  participant P as Governance policy
  participant U as Approval
  participant X as FS/Shell/Sandbox

  A->>T: call(tool, immutable args)
  T->>P: pre-execute(agent/session/tool/args)
  P->>P: 解析 role、workspace、policy version
  alt 规则拒绝
    P-->>T: deny（记录审计）
  else 需审批
    P->>U: request(call identity)
    alt allowed-once
      U-->>P: allow
      P->>X: 按本次 sandbox policy 执行
    else 其他 outcome
      U-->>T: deny
    end
  else 自动允许
    P->>X: 按本次 sandbox policy 执行
  end
~~~

对于需要强文件边界的动作，若 sandbox 报告 partial，策略不得把它当作满足 full 隔离的允许条件。

### 8.3 委派

1. Parent 提交任务目标、目标角色、期望 workspace 和最小能力集合。
2. Broker 验证 Parent 的有效权限、delegationDepth、预算、目标角色上限与 workspace 映射。
3. Broker 计算子能力交集，建立 child session；写入型 child 分配独立 Git worktree 作为 immutable cwd。
4. Child 只能通过其自身 policy 调用工具；不得直接拿 Parent 的 token、session 或私有 memory。
5. Child 完成后返回结构化、大小受限的 result/handoff；Parent 按 task id 与版本接收，陈旧结果丢弃。
6. Broker 写入创建、开始、结束、取消和失败的审计记录。

## 9. MCP 与 Skill 的特别处理

### MCP

MCP 的权限必须分三层：

1. Agent 是否看得到该 server；
2. Agent 是否可调用其中某个具体 tool；
3. 调用所需凭据是否可为该 Agent 解析。

只隐藏 MCP 菜单或从 prompt 删除 schema 都不够。MCP 工具仍必须经过同一工具 gate；敏感 server 的凭据映射应由控制面按 Agent 管理，而不是让模型读取统一环境变量。

### Skill

Skill 是操作知识与工作流说明，应做到：

- 每 Agent 通过 allowlist 看到相应 Skill 候选；
- workspace 内 Skill 与 Agent 私有 Skill 的优先级明确、可审计；
- 禁用一个 Skill 不应破坏已在运行的工具权限；
- 启用一个危险 Skill 不会自动授予 shell、MCP、网络或文件写权限。

## 10. 策略声明草案

以下仅为控制面存储格式草案，实际实现可采用 Schemastery 配置或持久化服务。

~~~yaml
version: 1
agentId: wa_01H...
workspace:
  id: ws_01H...
  canonicalRoot: /Users/qin/Projects/example
role: developer
policyVersion: 12
files:
  read: workspace
  write: task-worktree
sandbox:
  mode: workspace-write
  requireEnforcement: full
tools:
  allow: [read, write, edit, apply_patch, bash, tests]
  deny: [gateway_admin, credential_list, deploy]
shell:
  commands: [git, npm, pnpm, node, rg]
  approvalOn: [network, install, publish]
mcp:
  servers:
    github: [issues_read, pull_request_read]
skills:
  allow: [dsh-plugin, frontend-testing-debugging]
delegation:
  maxDepth: 1
  roles: [research, reviewer]
memory:
  sharing: summary-on-approval
approval:
  default: ask
~~~

## 11. Main Agent 的边界

Main Agent 应有最高的**治理能力**，但其数据访问遵循以下约束：

- 可以列出 workspace 与 Agent 元数据、策略状态、健康度和审计摘要；
- 可以默认读取各 Agent 的脱敏记忆摘要（不含原文、凭据、原始 tool 结果、内部指令）；
- 可以创建、归档、停用 Workspace Agent，变更策略需要记录原因和版本；
- 不默认读取任意 Agent 的 SOUL.md、USER.md、私有 memory 原文或原始 session log；
- 跨 workspace 读取、写入、凭据使用和外部发送必须显式指定目标、最小权限与审批路径；
- 给子 Agent 提权必须是新会话/新调用，不能修改正在执行调用的身份。

这使 Main Agent 类似控制平面管理员，而不是绕过所有项目隔离的“超级执行 Agent”。

## 12. 威胁模型与诚实边界

| 风险 | 本框架的应对 | 仍需注意 |
| --- | --- | --- |
| Prompt injection | 最小工具集、危害性操作审批、读取者与执行者拆分 | Prompt 规则本身不是安全边界。 |
| 同项目误写 | immutable cwd + workspace-write + task worktree | sandbox backend 若是 partial，必须降级或拒绝。 |
| 跨项目误操作 | workspace/Agent 显式绑定；跨域默认拒绝 | 直接运行不受治理的宿主程序仍可能越界。 |
| 子 Agent 提权 | capability attenuation、最大深度、Broker | Parent 自身若有过宽权限，风险仍高。 |
| MCP 凭据泄露 | Agent-scoped credential reference、server/tool allowlist | 同进程插件直接读环境变量仍是信任边界外问题。 |
| 审批漂移 | call identity 绑定、一次性授权、审计 | 不能把允许一次缓存为全局允许。 |
| 恶意同进程插件 | 仅信任经过审查的插件 | 真正的租户隔离需要进程/容器/远程 sandbox。 |

尤其要明确：DSH 的文件 sandbox 约束的是**文件效果**；网络和进程可见性必须由独立 provider/egress 策略治理。

## 13. 推荐实施阶段

### Phase 0：观察与建模

- 建立 workspace ↔ agent registry，但不改变现有工具权限。
- 展示有效策略解释：某工具为何可用、被哪条规则拒绝、sandbox 是否 full。
- 完成策略 schema、审计事件、角色模板和迁移方案。

**验收：** 对任意 session 能确定 workspace、Agent、role、policy version 和当前有效能力。

### Phase 1：身份与资料隔离

- 创建 Workspace Agent 时初始化 SOUL.md、AGENTS.md、USER.md、private memory。
- workspace 新 session 自动绑定 Agent preset。
- 引入 Skill 与 MCP 的 Agent 可见性清单。

**验收：** 两个 workspace 的人设、记忆与 Skill 清单互不混淆；恢复 session 后仍加载相同 preset。

### Phase 2：工具治理与审批

- 在 tools/pre-execute 实施规则解释与条件 ask。
- 用 tools.guard 实施不可被后续插件取消的最终 deny。
- 绑定 DSH 一次性 approval；记录完整审计链。

**验收：** 被拒绝的工具无法通过 Code Mode、UI 或子 Agent 路径调用；批准一个调用不能放行参数不同的后续调用。

### Phase 3：真实文件边界与委派

- 主会话（含套用 developer 预设后的 Agent）直接写项目根，受 workspace-write 沙箱约束。
- **仅**并行任务与写入型 child 分配独立 Git worktree；将其 immutable cwd 映射为该 worktree 的 workspace-write root。
- 接入委派 Broker、深度、预算、能力衰减和陈旧结果丢弃。
- 强隔离角色（research / reviewer / public，或 `requireEnforcement: full`）在 sandbox 报告 `partial` 时**拒绝**该次文件动作，不得降级放行。

**验收：** 主 Agent 可写本工作区；child 无法写 Parent workspace；超出深度/预算的委派失败；并行 task worktree 不互相污染；partial 沙箱上的只读角色无法完成写/越界读。

### Phase 4：强隔离与运营

- 对 public/untrusted Agent 使用独立进程、容器或远程 sandbox。
- 增加凭据 broker、网络 egress policy、策略变更审批和审计导出。
- 做策略回放、回归用例和升级兼容性检查。

**验收：** 不可信 Agent 即便发生 prompt injection，也无法读取宿主凭据、跨 workspace 写入或调用未授权外部 MCP。

## 14. 验收用例清单

- 创建两个 canonical path 不同的 workspace，得到不同 Agent、不同私有目录与不同 policy。
- 用 symlink 打开同一目录，仍绑定到同一个 workspace/Agent。
- research Agent 尝试 edit、shell 写入、调用发布 MCP，均被拒绝且有可解释审计。
- 主 developer 会话对本工作区写入成功，对另一 workspace 写入失败；写入型 child 对本工作区写入失败、对其 task worktree 写入成功。
- 允许一次 shell/发布请求后，改变参数、cwd 或 tool id 的第二个调用仍需重新授权。
- Child 的 capability 清单严格小于等于 Parent；子 Agent 无法再次创建未授权角色。
- 关闭/卸载治理插件后，其注册的 UI、监听器、provider 和临时状态正常 dispose；不留下静默放宽的策略。
- 恢复历史 session 后，仍以 Header 的 Agent preset 与 immutable cwd 重放，而非使用当前工作区的偶然设置。

## 15. 已锁定的产品决策

2026-08-17 确认：

1. **权限可拆，出厂只读，预设只是模板。** 每个 Agent 的各能力面单独配置（类 OpenClaw per-agent policy）。新 Agent 初始化只有读权限。research / developer / reviewer / release / public 是协助选择的基类，套用后仍可逐项改。
2. **Main 默认可看脱敏记忆摘要。** 不必每次授权。原文、凭据、原始 tool 结果、内部指令仍不默认给。
3. **删除 = 归档。** 解绑会话、停用 Agent，私有目录进入可恢复归档，不立刻物理删除。
4. **Worktree 只用于并行 / 委派写入。** 主会话直接写项目根。只有派出的 child 或并行任务才进独立 Git worktree。
5. **MCP 初始化默认可调。** 控制面提供开关，决定新 Agent 默认能看见/调用哪些 MCP；每个 Agent 仍可再收紧。不是写死一份全局白名单。
6. **Sandbox `partial` = 停手。** `requireEnforcement: full` 的角色或动作，后端报 partial 时拒绝该次调用，并说明本机保证不了承诺的文件边界。不降级放行。

## 16. 插件集切分

治理能力拆成可独立安装、独立发版的 bundle，避免一个大包锁死迭代。建议按阶段和强制点切开，后一层依赖前一层的 registry/schema，但不把实现揉进同一个 `host.js`：

| 插件 | 对应阶段 | 职责 | 不负责 |
| --- | --- | --- | --- |
| `dsh-agent-registry` | 0 | workspace ↔ Agent 绑定、稳定 id、有效策略只读解释 | 不改工具权限 |
| `dsh-agent-identity` | 1 | 私有目录、SOUL/AGENTS/USER、记忆、preset 绑定、Skill 可见性 | 不拦工具 |
| `dsh-agent-policy` | 1–2 | policy schema、预设基类、MCP 初始化默认开关、策略版本 | 不执行 deny |
| `dsh-agent-gate` | 2 | `tools/pre-execute` 解释 + `tools.guard` 最终 deny + 一次性 approval 绑定 | 不建 worktree |
| `dsh-agent-delegate` | 3 | 委派 Broker、深度/预算、child worktree、能力衰减 | 不做控制面 UI 的全部 |
| `dsh-agent-audit` | 0 起可先做只读 | 决策记录、归档、导出 | 不改策略 |

规则：

- 每个插件可单独 `dsh plugin add/remove`；卸掉 gate 不得留下静默放宽（缺 gate = 回落到 DSH 原有 permission-presets，而不是「全开」）。
- 共享契约（Agent id、policy JSON、审计事件）放在 registry/policy 的文档与 schema 里，其它插件只消费，不复制一份方言。
- UI 跟官方设置行，不自创皮肤；控制面入口可以后挂，先保证 Host 强制点正确。

## 17. 结论

这套框架的关键不是“多开几个 Agent”，而是把 **workspace 归属、Agent 人格与记忆、不可变调用身份、可实施的文件边界、一次性审批和能力衰减委派** 串成同一条链。

这样每个项目都有自己的 Agent 工作台；Main Agent 负责治理与编排；而真正执行的每一个动作，都能被限制、解释、审计和重放。

