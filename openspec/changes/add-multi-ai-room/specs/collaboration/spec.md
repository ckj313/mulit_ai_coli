# Spec: collaboration

## Requirement: User Task Dispatch
系统 MUST 在用户发送消息后先触发 Claude 响应。

### Scenario: user sends a new task
- **Given** 用户在某房间发送一条任务消息
- **When** 系统开始编排
- **Then** 第一位响应的 agent 必须是 Claude

## Requirement: A2A Mention Routing
系统 MUST 支持 agent 在房间中通过 `@` 触发其他 agent。

### Scenario: claude mentions codex and gemini
- **Given** Claude 回复里包含 `@codex` 与 `@gemini`
- **When** 路由解析后续动作
- **Then** Codex 与 Gemini 都会在同房间继续响应

## Requirement: Shared Context
系统 MUST 让每个 agent 能读取房间历史。

### Scenario: codex receives delegated task
- **Given** Claude 已在房间中发出实现方案
- **When** Codex 被 @ 调度
- **Then** Codex 的 prompt 包含前序房间消息

## Requirement: Loop Guard
系统 MUST 防止无限互相 @。

### Scenario: claude and codex ping-pong mentions
- **Given** Claude 与 Codex 持续互相 @
- **When** 达到最大 A2A 深度
- **Then** 编排流程终止并回到空闲状态
