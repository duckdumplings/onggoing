type WebSource = {
  title: string;
  url: string;
  snippet: string;
  source: 'duckduckgo' | 'wikipedia';
};

type WebKnowledgeResult = {
  snippets: string[];
  sources: WebSource[];
  fetchedAt: string;
};

const MAX_QUERY_LENGTH = 200;

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

async function fetchWikipediaSources(
  query: string,
  maxResults: number,
  signal: AbortSignal
): Promise<WebSource[]> {
  const url = new URL('https://ko.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('utf8', '1');
  url.searchParams.set('srlimit', String(maxResults));

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      'User-Agent': 'ongoing-ai-assistant/1.0 (+https://ongoing.ai)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const rows = Array.isArray(json?.query?.search) ? json.query.search : [];
  const collected: WebSource[] = [];
  for (const row of rows) {
    const title = String(row?.title || '').trim();
    const snippet = stripHtml(String(row?.snippet || '')).slice(0, 500);
    if (!title || !snippet) continue;
    collected.push({
      title,
      url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
      snippet,
      source: 'wikipedia',
    });
    if (collected.length >= maxResults) break;
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

    if (collected.length < maxResults) {
      const wiki = await fetchWikipediaSources(query, maxResults - collected.length, controller.signal).catch(() => []);
      for (const item of wiki) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        collected.push(item);
        if (collected.length >= maxResults) break;
      }
    }

    return {
      snippets: collected.map((row) => row.snippet),
      sources: collected,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return { snippets: [], sources: [], fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeoutId);
  }
}

