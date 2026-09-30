export interface SearchResult {
  title: string;
  body: string;
  href: string;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(input: string): string {
  return decodeHtml(input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function resolveHref(raw: string): string {
  try {
    const url = new URL(raw, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return raw;
  }
}

function parseResults(html: string): SearchResult[] {
  const anchors = [...html.matchAll(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const results: SearchResult[] = [];
  for (const match of anchors.slice(0, 3)) {
    const start = match.index ?? 0;
    const nearby = html.slice(start, start + 6000);
    const snippetMatch = nearby.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|a)>/i);
    results.push({
      title: stripTags(match[2] || ""),
      body: stripTags(snippetMatch?.[1] || ""),
      href: resolveHref(match[1] || ""),
    });
  }
  return results.filter((item) => item.title || item.body || item.href);
}

export async function webSearch(query: string, maxResults = 3): Promise<string> {
  try {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    url.searchParams.set("kl", "wt-wt");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AskMoina/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return `Search error: HTTP ${response.status}`;
    const results = parseResults(await response.text()).slice(0, maxResults);
    if (!results.length) return "No relevant search results found.";
    return results
      .map((result) => `Title: ${result.title}\nSnippet: ${result.body}\nURL: ${result.href}`)
      .join("\n\n");
  } catch (error) {
    return `Search error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
