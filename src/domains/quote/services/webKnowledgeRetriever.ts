type WebSource = {
  title: string;
  url: string;
  snippet: string;
  source: 'duckduckgo';
};

type WebKnowledgeResult = {
  snippets: string[];
  sources: WebSource[];
  fetchedAt: string;
};

const MAX_QUERY_LENGTH = 200;
const GENERIC_QUERY_TOKENS = new Set([
  '대한민국',
  '한국',
  '기업',
  '회사',
  '서비스',
  '알려줘',
  '설명',
  '정보',
  '검색',
  '최신',
  '관련',
  '대해',
  '무엇',
  '뭐',
  '운영',
  '해줘',
]);

function sanitizeQuery(input: string): string {
  const compact = String(input || '').replace(/\s+/g, ' ').trim();
  const withoutEmail = compact.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
  const withoutPhone = withoutEmail.replace(/\b01[0-9]-?\d{3,4}-?\d{4}\b/g, '[redacted-phone]');
  return withoutPhone.slice(0, MAX_QUERY_LENGTH);
}

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const raw = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return raw.filter((token) => token.length >= 2 && !GENERIC_QUERY_TOKENS.has(token));
}

/** 질의에서 브랜드·고유명사 후보(한글 2~10자, 영문 3자+) */
function extractCoreEntityTokens(query: string): string[] {
  const s = String(query || '').trim();
  const fromTokenize = tokenizeQuery(query);
  const korean = s.match(/[가-힣]{2,10}/g) || [];
  const latin = s.match(/\b[a-z]{3,}\b/gi) || [];
  const merged = [...fromTokenize, ...korean.map((x) => x.toLowerCase()), ...latin.map((x) => x.toLowerCase())];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of merged) {
    const t = raw.trim();
    if (!t || t.length < 2) continue;
    if (GENERIC_QUERY_TOKENS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 12);
}

function scoreSourceRelevance(queryTokens: string[], source: WebSource): number {
  if (queryTokens.length === 0) return 0;
  const haystack = `${source.title} ${source.snippet} ${source.url}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function filterRelevantSources(query: string, sources: WebSource[]): WebSource[] {
  const tokens = tokenizeQuery(query);
  const coreEntities = extractCoreEntityTokens(query);
  if (sources.length === 0) return [];
  if (tokens.length === 0 && coreEntities.length === 0) {
    return sources.slice(0, 5);
  }

  const scored = sources
    .map((source) => {
      const haystack = `${source.title} ${source.snippet} ${source.url}`.toLowerCase();
      const base = tokens.length > 0 ? scoreSourceRelevance(tokens, source) : 0;
      let coreHits = 0;
      for (const c of coreEntities) {
        if (haystack.includes(c.toLowerCase())) coreHits += 1;
      }
      const coreOk = coreEntities.length === 0 ? true : coreHits > 0;
      const score = base + coreHits * 3;
      return { source, score, coreOk };
    })
    .filter((row) => {
      if (coreEntities.length > 0 && !row.coreOk) return false;
      if (tokens.length === 0 && coreEntities.length === 0) return row.score > 0;
      return row.score > 0;
    })
    .sort((a, b) => b.score - a.score);

  return scored.map((row) => row.source);
}

/** 동일 질의 재시도 시 검색어 확장 */
export function buildExpandedSearchQuery(original: string): string {
  const compact = String(original || '').trim().replace(/\s+/g, ' ');
  if (!compact) return compact;
  if (/공식|사이트|법인|주식회사|기업\s*소개/i.test(compact)) return compact;
  return `${compact} 공식 사이트`;
}

async function fetchDuckDuckGoSources(
  query: string,
  maxResults: number,
  signal: AbortSignal
): Promise<WebSource[]> {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');
  url.searchParams.set('no_redirect', '1');

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      'User-Agent': 'ongoing-ai-assistant/1.0 (+https://ongoing.ai)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const collected: WebSource[] = [];

  const abstractText = stripHtml(json?.AbstractText || '');
  const abstractUrl = String(json?.AbstractURL || '').trim();
  const heading = String(json?.Heading || '').trim();
  if (abstractText && abstractUrl) {
    collected.push({
      title: heading || 'DuckDuckGo Abstract',
      url: abstractUrl,
      snippet: abstractText.slice(0, 500),
      source: 'duckduckgo',
    });
  }

  const related = Array.isArray(json?.RelatedTopics) ? json.RelatedTopics : [];
  for (const topic of related) {
    if (collected.length >= maxResults) break;
    const text = stripHtml(topic?.Text || '');
    const firstUrl = String(topic?.FirstURL || '').trim();
    if (!text || !firstUrl) continue;
    collected.push({
      title: text.slice(0, 80),
      url: firstUrl,
      snippet: text.slice(0, 500),
      source: 'duckduckgo',
    });
  }
  return collected;
}

export async function searchWebKnowledge(params: {
  query: string;
  maxResults?: number;
  timeoutMs?: number;
}): Promise<WebKnowledgeResult> {
  const maxResults = Math.max(1, Math.min(params.maxResults || 3, 5));
  const query = sanitizeQuery(params.query);
  if (!query) {
    return { snippets: [], sources: [], fetchedAt: new Date().toISOString() };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, params.timeoutMs || 3500));

  try {
    const collected: WebSource[] = [];
    const seen = new Set<string>();

    const ddg = await fetchDuckDuckGoSources(query, maxResults, controller.signal).catch(() => []);
    for (const item of ddg) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      collected.push(item);
      if (collected.length >= maxResults) break;
    }

    const relevant = filterRelevantSources(query, collected);
    return {
      snippets: relevant.map((row) => row.snippet),
      sources: relevant,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return { snippets: [], sources: [], fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeoutId);
  }
}

