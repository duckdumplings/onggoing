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
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');
    url.searchParams.set('no_redirect', '1');

    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      return { snippets: [], sources: [], fetchedAt: new Date().toISOString() };
    }

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

