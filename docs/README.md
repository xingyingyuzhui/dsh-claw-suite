# DSH Claw 治理套件（源码）

Claw Agent 的登记、人设、权限、闸、委派、记忆、诊断。10 个包版本号一致、互相精确钉死（scheme A meta），用 `scripts/bump-version.mjs` 统一改。

开发工作区是 monorepo（npm workspaces）。**用户只装 meta bundle**。

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

暂不发 npm。发版走 GitHub Release：`npm run release:bundle` 生成 `dist/dsh-claw-suite-<版本>.tar.gz`（10 个 npm tarball + 安装脚本 + `SHA256SUMS`），作为 Release 附件上传。用户解压后跑 `node scripts/install-desktop-local.mjs`，见根目录 README「安装」。

GitHub 自动生成的源码压缩包不含 submodule，不能当安装包用。

不要逐个安装 8+1 组件。旧 `dsh-agent-*` / `dsh-session-permissions` / `dsh-observability` 与新套件不得同时 ACTIVE。

本地开发在本工作区根 `npm install`，改完 `npm run install:desktop` 或 `DSH_HOME=… node scripts/install-desktop-local.mjs --profile <lab>` 装进实验 profile。

## DSH 兼容

套件适配 DeepSeek Harness **`0.2.0-rc.1+`**（peer `^0.2.0-rc.1`）。会话初始化挂在串行 `agent/created`。HTTP 走 Connection Fetch（`/api/dsh-claw/...`）。

分层说明见 [DSH_WORKSPACE_AGENT_GOVERNANCE.md](./DSH_WORKSPACE_AGENT_GOVERNANCE.md)；打包 ADR 见 [PACKAGING_ADR.md](./PACKAGING_ADR.md)。
