function plainText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function hostAllowed(host, allowedHosts) {
  const clean = host.toLowerCase();
  return allowedHosts.some((allowed) => clean === allowed || clean.endsWith(`.${allowed}`));
}

function safeArticleUrl(value, allowedHosts) {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !hostAllowed(url.hostname, allowedHosts)) return null;
    url.hash = '';
    // Remove tracking/query content before displaying or forwarding public data.
    url.search = '';
    return url.toString();
  } catch { return null; }
}

/** Normalizes public feed entries; no user-specific fields are accepted or returned. */
export function normalizePublicNewsItems(rawItems, { allowedHosts = [], limit = 6 } = {}) {
  if (!Array.isArray(rawItems) || !Array.isArray(allowedHosts)) return [];
  const hosts = allowedHosts
    .filter((host) => typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host))
    .map((host) => host.toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
  if (!hosts.length) return [];
  const output = [];
  const seen = new Set();
  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const url = safeArticleUrl(entry.url ?? entry.link, hosts);
    const title = plainText(entry.title, 180);
    if (!url || !title) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    let publishedAt = '';
    if (typeof entry.publishedAt === 'string' && Number.isFinite(Date.parse(entry.publishedAt))) {
      publishedAt = new Date(entry.publishedAt).toISOString();
    }
    const host = new URL(url).hostname.toLowerCase();
    output.push({
      id: `news-${output.length + 1}`,
      source: plainText(entry.source, 48) || host,
      title,
      summary: plainText(entry.summary ?? entry.description ?? '', 320),
      url,
      published_at: publishedAt,
    });
    if (output.length >= Math.max(0, Math.min(6, limit))) break;
  }
  return output;
}

export function sanitizePublicSummary(value) {
  return plainText(value, 800);
}
