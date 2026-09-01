# DevSpace Desktop 产品设计文档

> 面向普通用户的 ChatGPT 本地开发连接工具 · Tailscale Funnel 方案
>
> 版本：v0.1 · 2026-09-01

## 1. 项目背景

DevSpace 当前已经能够把 ChatGPT、Claude 等 MCP 客户端连接到用户本机，让模型直接访问真实项目目录，并具备读取文件、修改代码、运行终端命令、执行 Git、创建独立 Worktree、调用 Coding Agent 等能力。

当前主要使用流程偏向开发者：用户需要安装 Node.js、安装 DevSpace CLI、执行 `devspace init` / `devspace serve`、准备公网 HTTPS Tunnel、获取 MCP 地址，再进入 ChatGPT 配置自定义 MCP App。对于熟悉命令行、网络转发和 MCP 的用户问题不大，但普通用户容易在安装、Tunnel、地址配置和权限设置几个环节卡住。

本项目计划在现有 DevSpace Core 之上增加一个桌面 GUI，把复杂步骤自动化，让用户主要完成“安装软件 → 选择项目 → 连接 ChatGPT”三个动作。

## 2. 产品目标

### 2.1 用户体验目标

普通用户第一次使用时，理想流程控制在以下步骤：

1. 下载并安装 DevSpace Desktop。
2. 登录或检测 Tailscale。
3. 选择允许 ChatGPT 访问的项目文件夹。
4. 点击“连接 ChatGPT”。
5. 在 ChatGPT 中完成一次 MCP App 授权或配置。
6. 后续启动电脑后，DevSpace 与网络连接自动恢复。

用户无需理解 `localhost:7676`、反向代理、TLS、Tunnel、OAuth 元数据、MCP 路径等概念。

### 2.2 技术目标

- 最大限度复用现有 TypeScript / Node.js DevSpace Core。
- 桌面端负责安装、启动、状态检测、项目授权、Tunnel 管理和连接向导。
- 第一版优先支持 Tailscale Funnel。
- 保留 Cloudflare Tunnel、自定义 HTTPS 地址等高级方案的扩展能力。
- 不改变现有 CLI 使用方式，命令行用户仍然可以直接使用 DevSpace Core。

## 3. 当前 DevSpace 能力

DevSpace 本身已经提供以下关键能力：

- 本机运行的 MCP Server。
- 默认本地地址 `http://127.0.0.1:7676/mcp`。
- 限制 ChatGPT 只能打开用户授权的项目根目录。
- 读取、编辑、搜索本地代码。
- 执行测试、Build、Git、包管理器等终端命令。
- Git Worktree 隔离并行开发任务。
- 支持 `AGENTS.md`、`CLAUDE.md` 和 Skills。
- 支持调用 Codex、Claude、Cursor Agent、OpenCode 等本地 Coding Agent。
- 支持 `show_changes` 汇总本轮代码修改。
- Owner Password / OAuth 授权机制。

因此 Desktop 版本的主要工作不在重写 Coding Agent，而在把安装、运行、网络和权限管理做成图形化产品。

## 4. 当前用户痛点

### 4.1 安装步骤多

当前常见流程：

```text
安装 Node.js
→ npm install -g @waishnav/devspace
→ devspace init
→ devspace serve
```

普通用户容易遇到 Node 版本、npm 权限、PATH、终端操作等问题。

### 4.2 Tunnel 配置门槛高

ChatGPT 网页运行在云端，无法直接访问用户电脑的 `127.0.0.1`，所以 DevSpace 需要公网 HTTPS 地址。

目前用户需要自行选择 Cloudflare Tunnel、ngrok、Pinggy、Tailscale Funnel 或其他反向代理。这个过程会引入域名、DNS、账号、命令行和地址维护等额外概念。

### 4.3 ChatGPT MCP 配置仍需人工操作

即使 DevSpace Server 与 Tunnel 已运行，用户仍然需要把最终的 `/mcp` 地址配置到 ChatGPT 自定义 App / MCP 连接中，并完成授权。

桌面端无法假设平台允许第三方软件自动完成全部 ChatGPT 配置，所以第一版需要做清晰的连接向导。

### 4.4 权限模型缺少普通用户界面

DevSpace 的文件目录白名单与 Shell 权限很重要，但通过配置文件管理不够直观。桌面版需要把“允许访问哪些项目”“终端可以做什么”显示出来。

## 5. 总体方案

整体架构：

```text
┌──────────────────────────────┐
│          ChatGPT Web         │
│      Custom MCP App          │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│       Tailscale Funnel       │
│   stable-name.tailnet.ts.net │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      DevSpace Desktop        │
│                              │
│  GUI / 状态 / 权限 / Tunnel   │
│  启动管理 / Agent 管理         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       DevSpace Core          │
│      127.0.0.1:7676          │
│                              │
│ Files / Git / Shell / Agents │
└──────────────┬───────────────┘
               │
               ▼
           本地项目目录
```

## 6. 为什么第一版选择 Tailscale Funnel

Tailscale Funnel 适合 DevSpace Desktop 的原因：

- 可以把本地服务直接暴露为公网 HTTPS。
- TLS 证书自动处理。
- Funnel 地址使用 Tailnet 的 `*.ts.net` 域名，域名可预测且稳定，适合长期保存为 ChatGPT MCP 地址。
- 支持 `--bg` 后台运行。
- 支持 `--yes` 降低交互步骤。
- 用户无需购买域名、配置 DNS 或维护 Cloudflare Named Tunnel。
- Tailscale 登录方式对普通用户相对友好。

典型命令：

```bash
tailscale funnel --bg --yes 7676
```

DevSpace 本地监听：

```text
http://127.0.0.1:7676
```

Funnel 对外提供类似：

```text
https://my-mac.example-tailnet.ts.net
```

最终提供给 ChatGPT 的 MCP 地址：

```text
https://my-mac.example-tailnet.ts.net/mcp
```

### 6.1 已知限制

Tailscale 官方当前仍将 Funnel 标记为 Beta，正式产品需要在界面和文档中保留这一说明。

Funnel 还有以下限制：

- 需要 Tailscale 客户端和账号。
- 需要 Tailnet 开启 MagicDNS / HTTPS 等相关能力。
- Funnel 对公网流量有不可调整的带宽限制。
- Funnel 只支持可运行 Tailscale CLI 的平台。
- macOS 需要特别检测 Tailscale 的发行版本；官方文档指出 Funnel CLI 在 macOS 上需要支持 CLI 的开源版本。

DevSpace Desktop 应在启动时完成兼容性检测，并在不满足条件时给出明确操作入口。

## 7. Desktop GUI 设计

### 7.1 首页

```text
┌─────────────────────────────────────────┐
│ DevSpace                                │
│                                         │
│ ● 本地服务正在运行                       │
│ ● 安全连接正在运行                       │
│ ● ChatGPT 已连接                         │
│                                         │
│ 我的项目                                 │
│                                         │
│ 📁 MyGame                               │
│ 📁 MyApp                                │
│                                         │
│ [+ 添加项目]                            │
│                                         │
│ [打开 ChatGPT]                          │
└─────────────────────────────────────────┘
```

首页只显示用户真正关心的三个状态：

- 本地服务是否正常。
- 公网安全连接是否正常。
- ChatGPT 是否已经连接。

端口、MCP URL、进程 ID、Tunnel 参数放到“高级信息”。

### 7.2 首次启动向导

#### 步骤 A：环境检查

```text
DevSpace Core      ● 正常
Git                ● 已安装
Tailscale          ● 已安装
Tailscale 登录      ● 已登录
Funnel             ○ 尚未开启
```

如果 Tailscale 未安装：

```text
Tailscale 用于安全连接 ChatGPT 与这台电脑。

[安装 Tailscale]
```

如果未登录：

```text
[登录 Tailscale]
```

#### 步骤 B：添加项目

```text
允许 ChatGPT 访问的文件夹

☑ ~/Projects/MyGame
☑ ~/Projects/MyApp

[+ 添加文件夹]
```

默认不允许用户直接选择整个 Home、系统根目录或磁盘根目录。如果用户主动选择，应给出风险提示。

#### 步骤 C：开启连接

桌面端后台依次执行：

```text
启动 DevSpace Core
→ Health Check
→ 启动 Tailscale Funnel
→ 获取 Funnel 状态
→ 计算 MCP URL
→ 检测公网 /mcp 是否可达
```

GUI 显示：

```text
连接已经准备好

https://my-mac.example.ts.net/mcp

[连接 ChatGPT]
```

普通模式可以隐藏 URL；高级模式允许复制。

#### 步骤 D：ChatGPT 配置向导

点击“连接 ChatGPT”后：

1. 自动复制 MCP URL。
2. 打开 ChatGPT 相应的应用 / MCP 设置入口。
3. 桌面端展示 2～3 步图示说明。
4. 检测到首次 MCP 请求后，将状态切换为“等待授权”。
5. Owner Password 授权成功后显示“已连接”。

## 8. Tailscale 自动化实现

### 8.1 检测 Tailscale

Desktop 后台执行：

```bash
tailscale version
tailscale status --json
```

需要判断：

- CLI 是否存在。
- Daemon 是否正常。
- 用户是否登录。
- 当前设备 DNS Name。
- Funnel 是否已经启用。

### 8.2 启动 Funnel

推荐：

```bash
tailscale funnel --bg --yes 7676
```

随后读取：

```bash
tailscale funnel status --json
```

如果具体客户端版本没有 JSON 输出，则解析稳定的 CLI 状态输出，并在代码中对版本做分支处理。

### 8.3 停止 Funnel

GUI 的“停止安全连接”按钮可以调用：

```bash
tailscale funnel 7676 off
```

或根据当前版本使用 `tailscale funnel reset` 清理 Funnel 配置。

### 8.4 开机恢复

Desktop 应支持：

```text
开机启动 DevSpace Desktop
→ 等待 Tailscale 在线
→ 启动 DevSpace Core
→ 检查 Funnel 状态
→ 必要时重新开启 Funnel
→ Health Check
```

因为 Funnel 使用稳定 `*.ts.net` 域名，正常情况下 ChatGPT 保存的 MCP 地址无需反复修改。

## 9. Tunnel 抽象层

代码层不要把 Tailscale 写死在 GUI 中，建议定义统一接口：

```ts
interface TunnelProvider {
  id: string;
  name: string;

  detect(): Promise<TunnelEnvironment>;
  start(localPort: number): Promise<TunnelInfo>;
  stop(): Promise<void>;
  status(): Promise<TunnelStatus>;
}
```

第一版实现：

```text
TailscaleTunnelProvider
```

后续可以增加：

```text
CloudflareTunnelProvider
NgrokTunnelProvider
CustomHttpsProvider
DevSpaceRelayProvider
```

这样产品不会被某一家 Tunnel 服务锁死。

## 10. DevSpace Core 集成方式

DevSpace 本身是 TypeScript / Node.js 项目。Desktop 第一版推荐 Electron，以便直接复用 Node.js Runtime 和现有 TypeScript 代码。

推荐结构：

```text
devspace/
├─ packages/
│  ├─ core/                 # 现有 DevSpace Core
│  ├─ desktop-main/         # Electron Main
│  ├─ desktop-ui/           # React / UI
│  └─ tunnel-providers/
│     ├─ tailscale.ts
│     └─ types.ts
│
├─ apps/
│  └─ desktop/
│
└─ package.json
```

Electron Main Process 负责：

- DevSpace Core 生命周期。
- Tailscale CLI 调用。
- 文件夹选择。
- 安全配置保存。
- 日志。
- 开机启动。
- 系统托盘。

Renderer 负责：

- 首页状态。
- 项目列表。
- 首次启动向导。
- Agent 管理。
- 设置。

Renderer 不直接执行 Shell，所有系统操作都通过严格 IPC API 进入 Main Process。

## 11. Node.js 与运行环境打包

普通用户不应自行安装 Node.js。

Electron 自带 Node Runtime，因此 Desktop 版本可以直接把 DevSpace Core 打包进去。用户只需要安装：

```text
DevSpace.dmg / DevSpace.exe
```

安装过程中检测：

- Git
- Bash 环境
- Tailscale

其中 Git / Bash 可以先采用“检测 + 安装引导”；后续版本再考虑进一步打包或提供自动安装。

## 12. 项目权限设计

### 12.1 文件夹白名单

GUI：

```text
允许 ChatGPT 访问

☑ ~/Projects/Game
☑ ~/Projects/Website
☐ ~/Documents

[+ 添加文件夹]
```

### 12.2 新目录访问请求

如果模型尝试打开未授权目录：

```text
ChatGPT 请求访问：
~/Projects/NewGame

[允许一次]
[始终允许]
[拒绝]
```

### 12.3 Shell 权限等级

建议提供三档：

**安全模式**

- 文件读取与修改。
- 允许有限的测试 / Build 命令。
- 危险命令需要确认。

**标准模式（默认）**

- npm / pnpm / yarn。
- Git。
- Python / Node 等项目命令。
- 删除大量文件、系统目录操作等需要确认。

**完全访问**

- Shell 继承当前系统用户权限。
- 界面显示明显风险提示。

DevSpace 原有安全边界仍然保留，GUI 只是增加更容易理解的授权体验。

## 13. Coding Agent 管理

Desktop 可以自动检测用户电脑已经安装的 Coding Agent：

```text
Coding Agents

Codex          ● 已安装   [启用]
Claude Code    ● 已安装   [启用]
OpenCode       ○ 未安装   [安装]
Cursor Agent   ● 已安装   [启用]
```

用户不需要执行：

```bash
devspace agents run
devspace agents show
devspace agents continue
```

ChatGPT 仍可以通过 DevSpace 的 Subagents 能力调用这些工具。

## 14. 系统托盘

DevSpace Desktop 适合作为常驻后台工具。

托盘菜单：

```text
DevSpace

● ChatGPT 已连接
● 2 个项目已授权

打开 DevSpace
打开 ChatGPT
暂停连接
退出
```

关闭主窗口时默认最小化到托盘，不立即终止 MCP Server。

## 15. 错误处理

所有错误都转化成普通用户能够理解的状态。

例如 Tailscale 未登录：

```text
无法建立安全连接

Tailscale 尚未登录。

[登录 Tailscale]
```

端口占用：

```text
DevSpace 无法启动

7676 端口正在被其他程序使用。

[自动选择其他端口]
[查看详情]
```

Funnel 启动失败：

```text
安全连接启动失败

[重新尝试]
[查看解决方法]
```

详细 CLI 输出只显示在“诊断信息”中。

## 16. MVP 范围

第一版建议只做以下功能：

1. Electron Desktop App。
2. 内置 DevSpace Core，不要求用户安装 Node.js。
3. Start / Stop DevSpace Server。
4. 文件夹授权管理。
5. 自动检测 Tailscale。
6. 自动启动 / 停止 Tailscale Funnel。
7. 自动获取稳定 MCP URL。
8. ChatGPT 连接向导。
9. Owner Password 状态展示。
10. 服务 / Funnel / ChatGPT 三项健康状态。
11. 开机启动。
12. 系统托盘。
13. 基础日志与“复制诊断信息”。

第一版暂缓：

- 自建 DevSpace Relay。
- Cloudflare 自动登录。
- 内置 Git / Bash 安装。
- 完整 Agent Marketplace。
- 自动替用户操作 ChatGPT 网页设置。
- 多设备云同步。

## 17. MVP 验收标准

### 安装

- 用户无需预装 Node.js。
- macOS / Windows 可以通过安装包启动 Desktop。

### 项目

- GUI 可以添加 / 删除允许访问的项目目录。
- 未授权目录不能被 DevSpace 打开。

### DevSpace

- GUI 可以启动和停止 DevSpace Core。
- Server 崩溃后能够检测并提供自动重启。

### Tailscale

- 能检测客户端是否安装、登录和在线。
- 可以从 GUI 开启 Funnel。
- 能获取公网 HTTPS 地址。
- 重启 App 后仍能恢复相同 Funnel 地址。

### ChatGPT

- GUI 可以给出最终 `/mcp` URL。
- 一键复制地址并打开 ChatGPT。
- ChatGPT 成功请求 MCP 后，Desktop 能显示连接状态。

### 安全

- 默认只开放用户明确选择的目录。
- Owner Password 不明文显示在普通界面。
- Renderer 无直接 Shell 权限。

## 18. 后续版本方向

### v0.2

- Coding Agent 检测与管理。
- Worktree Session GUI。
- Diff / `show_changes` 本地查看。
- DevSpace 日志可视化。
- Cloudflare Tunnel Provider。

### v0.3

- DevSpace Relay。
- 用户无需 Tailscale 账号。
- 每台设备拥有固定 `*.devspace.app` 地址。
- 账号、多设备管理和远程在线状态。

Relay 结构可以是：

```text
ChatGPT
   ↓
https://device-id.devspace.app/mcp
   ↓
DevSpace Relay
   ↓ 加密长连接
DevSpace Desktop
   ↓
DevSpace Core
```

这个阶段可以进一步消除 Tailscale 依赖，形成真正面向普通用户的安装即用体验。

## 19. 推荐开发顺序

### 阶段 1：桌面壳

- 创建 Electron 项目。
- 能启动 / 停止现有 DevSpace Core。
- 首页显示 Server 状态。

### 阶段 2：项目管理

- 文件夹选择器。
- DevSpace Roots 配置。
- 配置持久化。

### 阶段 3：Tailscale

- CLI Detection。
- `tailscale status`。
- Funnel Start / Stop / Status。
- MCP URL 计算。

### 阶段 4：ChatGPT 向导

- 复制 MCP URL。
- 打开 ChatGPT。
- 显示授权状态。
- Owner Password 流程优化。

### 阶段 5：系统体验

- Tray。
- Auto Start。
- 日志。
- Crash Recovery。
- 打包与签名。

## 20. 给 Codex 的实现原则

开发时遵循：

- 优先复用现有 DevSpace TypeScript 代码。
- Core 与 Desktop UI 保持分层。
- Tunnel 通过 Provider 接口实现。
- 第一版只实现 Tailscale Provider。
- 所有 Shell 调用集中在 Electron Main Process。
- Renderer 只能通过白名单 IPC 调用系统能力。
- 配置文件中避免保存不必要的敏感信息。
- UI 默认隐藏端口、CLI 参数、MCP 细节，只在高级模式显示。
- 每一个错误状态都必须提供用户可执行的下一步操作。
- 保留 DevSpace CLI 的完整兼容性。

## 21. 资料依据

- DevSpace README：项目定位为本机自托管 MCP Server，通过用户控制的 HTTPS Tunnel 连接 ChatGPT，并提供本地文件、Shell、Git、Worktree、Skills 等能力。
- Tailscale Funnel 官方文档：Funnel 可把本地服务发布到公网 HTTPS，使用稳定的 Tailnet `*.ts.net` 域名，支持后台运行；目前仍处于 Beta。
- Tailscale Funnel CLI 文档：支持 `--bg`、`--yes`、`status`、`reset` 等操作，适合由 Desktop 应用自动管理。

参考：
- https://github.com/Waishnav/devspace
- https://tailscale.com/docs/features/tailscale-funnel
- https://tailscale.com/docs/reference/tailscale-cli/funnel
- https://tailscale.com/docs/reference/examples/funnel
