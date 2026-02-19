# findings.md

## 关键调研结论

1. CLI 模式适合当前目标：
   - Claude: `--output-format stream-json`
   - Codex: `exec --json`
   - Gemini: `--output-format stream-json`

2. A2A 路由采用单队列 worklist 更稳妥：
   - 可统一深度限制
   - 避免并发双重触发
   - 保证同房间共享上下文

3. 本地实测结果：
   - Claude CLI 可返回标准流式 JSON
   - Codex CLI 可返回 JSONL（包含 `item.completed` agent_message）
   - Gemini CLI 存在 API 网络失败可能，需在编排层兜底为错误消息

4. 数据存储建议：
   - 运行态消息用 SQLite（查询/持久化/可回放）
   - 项目管理用 planning-with-files 三文件
   - 变更交付用 OpenSpec change artifact
