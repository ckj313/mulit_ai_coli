# Multi AI Coli

一个可运行的网站，让 `Claude`、`Codex`、`Gemini` 在同一房间协作和互相 `@` 派活。用户可以在网页里下发任务，后端通过 `Claude CLI`、`Codex CLI` 与 `OpenRouter Gemini API` 执行并实时回显。

## 你要求的协作逻辑（已实现）

1. 用户消息里 `@` 到谁，系统就优先调度谁。
2. 若用户未 `@` 任意 agent，默认由 `Claude`（主架构师/核心开发）先响应。
3. Claude/Codex/Gemini 在回复中可继续 `@` 其他 agent 形成 A2A 链路。
4. 所有消息写入 SQLite 并在网页实时显示，三方共享同一上下文历史。

## 技术栈

- Backend: Node.js + TypeScript + Express + WebSocket
- Storage: SQLite (`better-sqlite3`)
- Frontend: 原生 HTML/CSS/JS（移动端自适应）
- Testing: Vitest + Supertest

## 模型调用参数

- Claude:
  - `claude -p <prompt> --output-format stream-json --verbose --setting-sources local --disable-slash-commands --permission-mode default --tools "" --model claude-sonnet-4-5-20250929 --no-session-persistence`
- Codex:
  - `codex exec <prompt> --model gpt-5.2 --json --sandbox workspace-write --skip-git-repo-check --ephemeral`
- Gemini（OpenRouter）:
  - `POST https://openrouter.ai/api/v1/chat/completions`
  - `model: google/gemini-2.5-flash`

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
- `CLAUDE_MODEL`：Claude 模型（默认 `claude-sonnet-4-5-20250929`）
- `CODEX_MODEL`：Codex 模型（默认 `gpt-5.2`）
- `OPENROUTER_API_KEY`：OpenRouter API Key（必填）
- `OPENROUTER_GEMINI_MODEL`：Gemini 模型（默认 `google/gemini-2.5-flash`）
- `OPENROUTER_HTTP_REFERER`：OpenRouter 请求来源（默认 `http://localhost:3466`）
- `OPENROUTER_APP_NAME`：OpenRouter 应用名（默认 `Multi AI Coli`）

## 注意

- 需要你本机提前登录 `claude` / `codex` CLI。
- Gemini 由 OpenRouter API 提供；若 API key 或网络异常，系统会把错误信息写入房间消息，不会中断其他 agent。
