import { createServerClient } from '@/libs/supabase-client';
import { PRICING_RULES_DESC } from '@/domains/quote/knowledge/pricingRules';
import { SERVICE_INFO_DESC } from '@/domains/quote/knowledge/serviceInfo';

type RagChunk = {
  id: string;
  source: string;
  text: string;
  score: number;
};

export type SimilarQueryCandidate = {
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
  similarityScore: number;
};

export type FeedbackGuidance = {
  snippets: string[];
  sources: string[];
  positiveCount: number;
  negativeCount: number;
  policyHints: {
    addressNormalizationBoost: boolean;
    duplicateGuardBoost: boolean;
  };
};

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}'"`~\-_/\\|]+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2);
}

function similarityScore(queryText: string, candidateText: string): number {
  const qTokens = tokenize(queryText);
  const cTokens = tokenize(candidateText);
  if (!qTokens.length || !cTokens.length) return 0;
  const qSet = new Set(qTokens);
  const cSet = new Set(cTokens);
  let intersection = 0;
  for (const token of qSet) {
    if (cSet.has(token)) intersection += 1;
  }
  const union = new Set([...qSet, ...cSet]).size;
  if (!union) return 0;
  return intersection / union;
}

function scoreChunk(queryTokens: string[], chunkText: string): number {
  const haystack = tokenize(chunkText);
  if (!haystack.length) return 0;
  const set = new Set(haystack);
  let score = 0;
  for (const token of queryTokens) {
    if (set.has(token)) score += 1;
  }
  return score;
}

async function loadAttachmentChunks(sessionId?: string | null): Promise<Array<{ id: string; source: string; text: string }>> {
  if (!sessionId) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('quote_chat_attachments')
      .select('id, file_name')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (!data?.length) return [];
    const ids = data.map((d) => d.id);
    const { data: parseRows } = await supabase
      .from('quote_chat_attachment_parses')
      .select('attachment_id, summary, parsed_text')
      .in('attachment_id', ids)
      .order('created_at', { ascending: false });

    const byAttachment = new Map<string, { summary?: string; parsed_text?: string }>();
    for (const row of parseRows || []) {
      if (!byAttachment.has(row.attachment_id)) {
        byAttachment.set(row.attachment_id, row);
      }
    }
    return data.map((attachment) => {
      const parse = byAttachment.get(attachment.id);
      return {
        id: attachment.id,
        source: `attachment:${attachment.file_name}`,
        text: parse?.summary || parse?.parsed_text || '',
      };
    }).filter((chunk) => Boolean(chunk.text));
  } catch {
    return [];
  }
}

export async function retrieveRagContext(params: {
  query: string;
  sessionId?: string | null;
  limit?: number;
}): Promise<{ snippets: string[]; sources: string[] }> {
  const limit = Math.max(1, Math.min(params.limit || 5, 12));
  const queryTokens = tokenize(params.query);
  const baseChunks: Array<{ id: string; source: string; text: string }> = [
    { id: 'pricing-rules', source: 'knowledge:pricingRules', text: PRICING_RULES_DESC },
    { id: 'service-info', source: 'knowledge:serviceInfo', text: SERVICE_INFO_DESC },
  ];
  const attachmentChunks = await loadAttachmentChunks(params.sessionId);
  const chunks = [...baseChunks, ...attachmentChunks];
  const scored: RagChunk[] = chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(queryTokens, chunk.text),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((chunk) => chunk.score > 0 || chunk.source.startsWith('knowledge:'));

  return {
    snippets: scored.map((chunk) => chunk.text.slice(0, 1200)),
    sources: scored.map((chunk) => chunk.source),
  };
}

export async function retrieveSimilarQueryCandidate(params: {
  sessionId?: string | null;
  query: string;
  threshold?: number;
  limit?: number;
}): Promise<SimilarQueryCandidate | null> {
  const threshold = Math.max(0.1, Math.min(params.threshold ?? 0.75, 0.95));
  const limit = Math.max(10, Math.min(params.limit ?? 80, 200));
  if (!params.sessionId) return null;
  if (!params.query?.trim()) return null;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_messages')
      .select('id, role, content, metadata, created_at')
      .eq('session_id', params.sessionId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error || !data?.length) return null;

    let best: SimilarQueryCandidate | null = null;
    for (let i = 0; i < data.length; i += 1) {
      const row = data[i] as any;
      if (row.role !== 'user') continue;
      const assistant = data[i + 1] as any;
      if (!assistant || assistant.role !== 'assistant') continue;
      const userText = String(row.content || '').trim();
      const assistantText = String(assistant.content || '').trim();
      if (!userText || !assistantText) continue;

      const isFailure = Boolean(
        assistant?.metadata?.error ||
        assistant?.metadata?.isFailure ||
        assistantText.includes('오류가 발생')
      );
      if (isFailure) continue;

      const score = similarityScore(params.query, userText);
      if (score < threshold) continue;
      if (!best || score > best.similarityScore) {
        best = {
          userMessageId: String(row.id),
          assistantMessageId: String(assistant.id),
          userText,
          assistantText,
          similarityScore: score,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

export async function retrieveFeedbackGuidance(params: {
  sessionId?: string | null;
  query: string;
  limit?: number;
}): Promise<FeedbackGuidance> {
  const empty: FeedbackGuidance = {
    snippets: [],
    sources: [],
    positiveCount: 0,
    negativeCount: 0,
    policyHints: {
      addressNormalizationBoost: false,
      duplicateGuardBoost: false,
    },
  };
  if (!params.sessionId || !params.query?.trim()) return empty;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_chat_failure_cases')
      .select('user_input, assistant_output, error_code, reason, metadata, created_at')
      .eq('session_id', params.sessionId)
      .order('created_at', { ascending: false })
      .limit(120);
    if (error || !data?.length) return empty;

    const guidanceRows = data
      .map((row: any) => {
        const score = similarityScore(params.query, String(row.user_input || ''));
        return { row, score };
      })
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(params.limit ?? 6, 12)));

    if (!guidanceRows.length) return empty;

    const snippets: string[] = [];
    const sources: string[] = [];
    let positiveCount = 0;
    let negativeCount = 0;
    let addressNormalizationBoost = false;
    let duplicateGuardBoost = false;

    for (const { row, score } of guidanceRows) {
      const code = String(row.error_code || '');
      const reason = String(row.reason || '').trim();
      const userInput = String(row.user_input || '').trim();
      const isPositive = code === 'USER_FEEDBACK_POSITIVE';
      if (isPositive) {
        positiveCount += 1;
      } else {
        negativeCount += 1;
      }

      const reasonLower = reason.toLowerCase();
      if (/주소|지오코드|geocode|좌표/.test(reasonLower) || /주소|지오코드|geocode|좌표/.test(userInput.toLowerCase())) {
        addressNormalizationBoost = true;
      }
      if (/중복|duplicate|순서|경유지/.test(reasonLower) || /중복|duplicate|순서|경유지/.test(userInput.toLowerCase())) {
        duplicateGuardBoost = true;
      }

      const signalLabel = isPositive ? '긍정' : '개선';
      const detail = reason || (isPositive ? '사용자가 결과에 만족함' : '사용자 불만 피드백');
      snippets.push(`[${signalLabel}피드백] 유사 요청(score=${score.toFixed(2)}): ${detail}`);
      sources.push(`feedback:${code || 'UNKNOWN'}`);
    }

    return {
      snippets,
      sources,
      positiveCount,
      negativeCount,
      policyHints: {
        addressNormalizationBoost,
        duplicateGuardBoost,
      },
    };
  } catch {
    return empty;
  }
}

