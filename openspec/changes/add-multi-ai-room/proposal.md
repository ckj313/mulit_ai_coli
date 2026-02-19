# Proposal: add-multi-ai-room

## Why

当前项目目标是把三个已安装 CLI（Claude/Codex/Gemini）整合成可视化协作系统，支持用户下发任务并实时查看 AI 协作过程。

## What Changes

1. 新增 Web 应用：房间、消息流、任务输入。
2. 新增 CLI 编排层：Claude 主导，Codex/Gemini 协作。
3. 新增 A2A 路由：基于 `@agent` 的队列式调度。
4. 新增持久化：SQLite 保存房间和消息。
5. 新增测试：路由规则、循环保护、基础 API。

## Impact

- 提升协作透明度：用户可看到完整协作过程
- 降低手工调度成本：AI 可自动 `@` 下游角色
- 增强工程可靠性：有持久化与自动测试兜底
