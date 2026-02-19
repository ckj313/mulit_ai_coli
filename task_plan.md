# task_plan.md

## 任务目标

在 `mulit_ai_coli` 中构建一个可运行网站，让 Claude / Codex / Gemini 在同一房间协作、互相 `@`，并把过程实时展示给用户。

## 阶段拆解

- [x] Phase 1: 初始化项目与基础后端（Express + WebSocket + SQLite）
- [x] Phase 2: 实现三家 CLI 适配器与统一事件解析
- [x] Phase 3: 实现 A2A 路由策略（Claude 主导，Codex/Gemini 协作）
- [x] Phase 4: 完成前端房间 UI 和实时消息展示
- [x] Phase 5: 引入 planning-with-files 和 OpenSpec 工件
- [x] Phase 6: 编写并执行测试，准备推送 GitHub

## 验收标准

- [x] 用户发送消息后，Claude 先响应
- [x] Claude 可在消息中直接 `@codex` / `@gemini`
- [x] Codex/Gemini 可继续 `@` 触发协作
- [x] 所有消息写入 SQLite 并可回放
- [x] 前端可实时看到消息与状态
- [x] `npm test` 通过
