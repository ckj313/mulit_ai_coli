# Multi AI 协作房间设计（2026-02-19）

## 1. 目标与边界

项目目标是构建一个可运行网站，让用户在一个房间内向三位 AI（Claude、Codex、Gemini）下发任务，并实时看到它们如何协作、如何互相 `@` 派发子任务。为了保证落地速度与可维护性，本版聚焦文本协作与可回放消息流，不包含复杂权限面板、跨项目隔离策略、可视化 DAG 编排器等二期能力。核心非功能目标是稳定性与可解释性：每一步路由都能追踪，所有关键消息都能持久化，任何 CLI 失败都可反馈到房间而不是静默丢失。

## 2. 架构与职责

架构分为四层：Web UI、API/WebSocket、Orchestrator、CLI Adapters。Web UI 负责房间列表、消息展示、任务发送；API 负责房间与消息读写；WebSocket 负责状态和消息实时推送；Orchestrator 负责调度策略和 A2A 队列；CLI Adapters 负责三家工具的参数固定、事件解析和错误收敛。角色分工遵循你的要求：Claude 是主架构师与主执行入口，Codex 负责 Code Review/安全/测试，Gemini 负责视觉与创意。编排器不会硬编码业务答案，只负责把任务在正确角色之间流转。

## 3. 数据流与路由策略

用户提交消息后，系统先把消息持久化到 SQLite，再触发编排队列，队列初始值为 `claude`。Claude 首轮回复后，系统解析 `@codex`、`@gemini` 等 mention；若未显式 mention，系统默认派发 Codex 与 Gemini，保证“Claude 响应后下发协作”这个主路径稳定存在。后续任何 agent 的回复都可继续 mention 其他 agent，统一追加到同一 worklist 队列中执行，天然共享上下文。为避免无限 ping-pong，系统设置 `maxA2ADepth` 和 `maxTurnsPerAgent` 双重护栏。

## 4. 错误处理与可测试性

每次 CLI 调用都设置超时，非零退出或解析异常会转为房间内可见错误消息。Gemini 等外部依赖发生网络失败时，不阻断整个房间流程。测试分三层：mention 解析单测、编排器流程单测、API 基础集成测试，覆盖你最关心的“首轮 Claude”“A2A 路由”“循环防护”。此外采用 planning-with-files（`task_plan.md`/`findings.md`/`progress.md`）作为项目总控，OpenSpec 作为本次改动交付工件，确保后续迭代也能按同一流程扩展。
