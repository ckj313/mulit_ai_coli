# Multi AI Coli

一个可运行的网站，让 `Claude`、`Codex`、`Gemini` 在同一房间协作和互相 `@` 派活。用户可以在网页里下发任务，后端通过三家 CLI 执行对话并实时回显。

## 你要求的协作逻辑（已实现）

1. 用户发送消息后，优先由 `Claude`（主架构师/核心开发）首轮响应。
2. Claude 在回复中可直接 `@codex`、`@gemini` 派发子任务。
3. 若 Claude 没有显式 `@`，系统会默认依次调度 `Codex`（安全/测试）和 `Gemini`（视觉/创意）。
4. Codex/Gemini 也能在回复里继续 `@claude` 或互相 `@`，形成 A2A 链路。
5. 所有消息写入 SQLite 并在网页实时显示，三方共享同一上下文历史。

## 技术栈

- Backend: Node.js + TypeScript + Express + WebSocket
- Storage: SQLite (`better-sqlite3`)
- Frontend: 原生 HTML/CSS/JS（移动端自适应）
- Testing: Vitest + Supertest

## CLI 参数（对齐 SDK-to-CLI 思路）

- Claude:
  - `claude -p <prompt> --output-format stream-json --verbose --permission-mode default --tools "" --model sonnet --no-session-persistence`
- Codex:
  - `codex exec <prompt> --json --sandbox workspace-write --skip-git-repo-check --ephemeral`
- Gemini:
  - `gemini <prompt> --output-format stream-json --approval-mode default --sandbox true`

## 快速开始

```bash
npm install
npm run dev
```

打开：`http://localhost:3466`

## 测试

```bash
npm test
```

## 关键目录

- `src/server/orchestration/orchestrator.ts`：A2A 工作队列、深度限制、Claude 首轮调度
- `src/server/orchestration/mentions.ts`：`@agent` 提取与路由目标识别
- `src/server/cli/adapters/*.ts`：三家 CLI 适配器与参数
- `public/`：协作房间前端页面
- `task_plan.md` / `findings.md` / `progress.md`：planning-with-files 总控文件
- `openspec/changes/add-multi-ai-room/`：本次改动的 OpenSpec 交付工件

## 环境变量

- `PORT`：服务端口（默认 `3466`）
- `AI_ROOM_DB_PATH`：SQLite 路径（默认 `data/room.db`）
- `AI_ROOM_MAX_A2A_DEPTH`：最大 A2A 轮次（默认 `9`）
- `AI_ROOM_MAX_AGENT_TURNS`：单 agent 最大轮次（默认 `3`）
- `AI_ROOM_AGENT_TIMEOUT_MS`：单次 agent 调用超时（默认 `180000`）
- `CLAUDE_MODEL`：Claude 模型别名（默认 `sonnet`）

## 注意

- 需要你本机提前登录 `claude` / `codex` / `gemini` CLI。
- 如果 Gemini 账号或网络异常，系统会把错误信息写入房间消息，不会中断其他 agent。
