# Design: add-multi-ai-room

## Architecture

- HTTP API: 接收用户消息、查询房间历史
- WebSocket: 推送实时消息与执行状态
- Orchestrator: 单队列 A2A 调度（防循环）
- Agent Adapters: Claude/Codex/Gemini CLI 封装
- SQLite Store: `rooms/messages/agent_sessions`

## Routing

1. 用户消息入库
2. 队列初始化为 `claude`
3. Claude 首轮执行后解析 `@` 提及
4. 若无显式提及，默认追加 `codex` 与 `gemini`
5. 其他 agent 回复中的 `@` 可继续追加队列
6. 达到最大深度或队列清空即结束

## Safety Controls

- `maxA2ADepth`
- `maxTurnsPerAgent`
- agent timeout
- CLI 错误回写为房间消息
