import { describe, expect, it } from 'vitest';

import { extractMentions } from './mentions.js';

describe('extractMentions', () => {
  it('能识别多个目标 AI', () => {
    const result = extractMentions('@codex 请审查\n@gemini 请给视觉建议', 'claude');
    expect(result).toEqual(['codex', 'gemini']);
  });

  it('会忽略代码块里的 mention', () => {
    const result = extractMentions('```ts\n// @gemini 不应触发\n```\n@codex 你来', 'claude');
    expect(result).toEqual(['codex']);
  });

  it('不会返回当前 agent 自己', () => {
    const result = extractMentions('@claude 我自己处理', 'claude');
    expect(result).toEqual([]);
  });
});
