/**
 * LLM provider 추상화.
 *
 * 견적 에이전트는 Anthropic(Claude)을 기본 추론 모델로 쓰되, OpenAI도 동일 인터페이스로
 * 교체할 수 있어야 한다(실험 자유도). 모델 슬러그는 다음 형식을 허용한다:
 *   - "anthropic:claude-sonnet-4-5", "openai:gpt-4.1" (명시적 provider)
 *   - "claude-sonnet-4-5"  -> anthropic
 *   - "gpt-4.1", "o4-mini" -> openai
 * env QUOTE_AGENT_MODEL 로 기본값을 덮어쓸 수 있다.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type ProviderId = 'anthropic' | 'openai';

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1';

export interface ResolvedModel {
  model: LanguageModel;
  provider: ProviderId;
  modelId: string;
}

function inferProvider(modelId: string): ProviderId {
  if (/^claude/i.test(modelId)) return 'anthropic';
  if (/^(gpt|o\d|chatgpt|text-)/i.test(modelId)) return 'openai';
  // 기본은 anthropic (유료 토큰 적극 사용 정책)
  return 'anthropic';
}

function hasKey(provider: ProviderId): boolean {
  return provider === 'anthropic'
    ? Boolean(process.env.ANTHROPIC_API_KEY)
    : Boolean(process.env.OPENAI_API_KEY);
}

/**
 * 모델 슬러그(또는 env 기본값)를 AI SDK LanguageModel 인스턴스로 변환한다.
 * 지정 provider의 API 키가 없으면 키가 있는 다른 provider로 자동 폴백한다.
 */
export function resolveModel(slug?: string): ResolvedModel {
  const raw = (slug || process.env.QUOTE_AGENT_MODEL || '').trim();

  let provider: ProviderId;
  let modelId: string;

  if (raw.includes(':')) {
    const [p, ...rest] = raw.split(':');
    provider = p.toLowerCase() === 'openai' ? 'openai' : 'anthropic';
    modelId = rest.join(':') || (provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL);
  } else if (raw) {
    provider = inferProvider(raw);
    modelId = raw;
  } else {
    provider = 'anthropic';
    modelId = DEFAULT_ANTHROPIC_MODEL;
  }

  // 키 없는 provider면 키가 있는 쪽으로 폴백
  if (!hasKey(provider)) {
    if (provider === 'anthropic' && hasKey('openai')) {
      provider = 'openai';
      modelId = DEFAULT_OPENAI_MODEL;
    } else if (provider === 'openai' && hasKey('anthropic')) {
      provider = 'anthropic';
      modelId = DEFAULT_ANTHROPIC_MODEL;
    }
  }

  const model = provider === 'openai' ? openai(modelId) : anthropic(modelId);
  return { model, provider, modelId };
}

/** 에이전트 공통 실행 설정. */
export const AGENT_DEFAULTS = {
  maxSteps: 10,
  temperature: 0.2,
} as const;
