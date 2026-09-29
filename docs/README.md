# DSH Claw 治理套件（源码）

Claw Agent 的登记、人设、权限、闸、委派、记忆、诊断。发布身份统一为 `dsh-claw-*@0.3.0-rc.1`（scheme A meta）。

开发工作区是 monorepo（npm workspaces）。每个组件仍可单独发布；**用户只装 meta bundle**。

| 包 | 职责 |
|---|---|
| `dsh-claw-core` | 共享库（classifier / path / http），不是插件行 |
| `dsh-claw-observability` | 共用诊断日志与运行诊断页 |
| `dsh-claw-registry` | 登记、侧栏、Claw 模板 |
| `dsh-claw-identity` | SOUL / IDENTITY / AGENTS / TOOLS 注入 |
| `dsh-claw-policy` | 策略 schema、新建默认 |
| `dsh-claw-permissions` | Claw 三层交集；工作区只走官方权限 |
| `dsh-claw-gate` | 只拦 Claw |
| `dsh-claw-delegate` | 委派深度、worktree |
| `dsh-claw-memory` | 记忆与 Main 脱敏摘要 |
| `dsh-claw-suite` | meta bundle（唯一安装入口） |

组件之间通过 **package exports** 互引（例如 `dsh-claw-permissions/layers`），禁止 `../dsh-*` sibling import。

## 安装（产品）

```sh
dsh plugin add dsh-claw-suite@0.3.0-rc.1
```

不要逐个安装 8+1 组件。旧 `dsh-agent-*` / `dsh-session-permissions` / `dsh-observability` 与新套件不得同时 ACTIVE。

本地开发可 `npm install` 于本工作区根，再按需 `npm pack` / Desktop lab。

## DSH 兼容

套件适配 DeepSeek Harness **`0.2.0-rc.1+`**（peer `^0.2.0-rc.1`）。会话初始化挂在串行 `agent/created`。HTTP 走 Connection Fetch（`/api/dsh-claw/...`）。

分层说明见 [DSH_WORKSPACE_AGENT_GOVERNANCE.md](./DSH_WORKSPACE_AGENT_GOVERNANCE.md)；打包 ADR 见 [PACKAGING_ADR.md](./PACKAGING_ADR.md)。
