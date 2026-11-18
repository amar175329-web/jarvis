import type { Gateway } from '../../model-gateway/src/gateway.ts';
import type { Provider, ProviderChunkHandler, ProviderResult } from '../../model-gateway/src/types.ts';
import { isLocalHealthy, type LocalHealth } from '../../models/src/index.ts';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type PromptEnvelope = { system?: string; user?: string };
type DeltaParser = (event: unknown, state: UsageState) => string;
type UsageState = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
};

function promptParts(input: unknown): PromptEnvelope {
  if (typeof input === 'string') return { user: input };
  if (!input || typeof input !== 'object') throw new Error('invalid model input');
  const value = input as Record<string, unknown>;
  return { system: typeof value.system === 'string' ? value.system : '', user: typeof value.user === 'string' ? value.user : JSON.stringify(value) };
}
function estimateTokens(value: string): number { return Math.max(1, Math.ceil(value.length / 4)); }
function parseJson(data: string): unknown | null { try { return JSON.parse(data) as unknown; } catch { return null; } }

async function consumeSse(response: Response, signal: AbortSignal, parse: DeltaParser, fallbackInputTokens: number, onChunk?: ProviderChunkHandler): Promise<ProviderResult> {
  if (!response.ok) throw new Error('provider request failed'); // Never expose/log provider body; it can echo secrets.
  if (!response.body) throw new Error('provider stream missing');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const usage: UsageState = { input: 0, output: 0 };
  const output: string[] = [];
  let buffer = '';
  const frame = async (raw: string) => {
    const data = raw.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const event = parseJson(data); if (!event) return;
    const delta = parse(event, usage);
    if (delta) { output.push(delta); await onChunk?.(delta); }
  };
  try {
    for (;;) {
      if (signal.aborted) throw new Error('provider request aborted');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.search(/\r?\n\r?\n/);
      while (split >= 0) {
        const separator = buffer.slice(split).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
        await frame(buffer.slice(0, split));
        buffer = buffer.slice(split + separator.length);
        split = buffer.search(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) await frame(buffer);
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const text = output.join('');
  // Providers usually include usage in their final SSE event. This fallback is token counting only,
  // never a price estimate; the gateway's configured ModelSpec remains the only price source.
  return {
    text,
    tokensIn: usage.input || fallbackInputTokens,
    tokensOut: usage.output || estimateTokens(text),
    ...(usage.cacheRead !== undefined ? { cacheReadTokens: usage.cacheRead } : {}),
    ...(usage.cacheWrite !== undefined ? { cacheWriteTokens: usage.cacheWrite } : {}),
    ...(usage.cacheWrite1h !== undefined ? { cacheWrite1hTokens: usage.cacheWrite1h } : {}),
  };
}

export function createAnthropicProvider(fetcher: FetchLike = fetch, endpoint = 'https://api.anthropic.com/v1/messages'): Provider {
  return {
    name: 'anthropic',
    async invoke(args) {
      const p = promptParts(args.input);
      const response = await fetcher(endpoint, {
        method: 'POST', signal: args.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': args.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: args.model, max_tokens: args.maxOutputTokens, stream: true, system: p.system, messages: [{ role: 'user', content: p.user }] }),
      });
      return consumeSse(response, args.signal, (raw, usage) => {
        const e = raw as {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: {
            usage?: {
              input_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
          };
          usage?: {
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        };
        if (e.type === 'message_start' && e.message?.usage) {
          usage.input = e.message.usage.input_tokens ?? usage.input;
          if (e.message.usage.cache_read_input_tokens !== undefined) usage.cacheRead = e.message.usage.cache_read_input_tokens;
          if (e.message.usage.cache_creation_input_tokens !== undefined) usage.cacheWrite = e.message.usage.cache_creation_input_tokens;
        }
        if (e.type === 'message_delta' && e.usage) {
          usage.output = e.usage.output_tokens ?? usage.output;
          if (e.usage.cache_read_input_tokens !== undefined) usage.cacheRead = e.usage.cache_read_input_tokens;
          if (e.usage.cache_creation_input_tokens !== undefined) usage.cacheWrite = e.usage.cache_creation_input_tokens;
        }
        return e.type === 'content_block_delta' && e.delta?.type === 'text_delta' ? (e.delta.text ?? '') : '';
      }, estimateTokens(JSON.stringify(args.input)), args.onChunk);
    },
  };
}

export function createOpenAIProvider(
  fetcher: FetchLike = fetch,
  endpoint = 'https://api.openai.com/v1/chat/completions',
  name = 'openai',
): Provider {
  return {
    name,
    async invoke(args) {
      const p = promptParts(args.input);
      const response = await fetcher(endpoint, {
        method: 'POST', signal: args.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${args.apiKey}` },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxOutputTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: [{ role: 'system', content: p.system ?? '' }, { role: 'user', content: p.user ?? '' }],
        }),
      });
      return consumeSse(response, args.signal, (raw, usage) => {
        const e = raw as {
          choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: {
              cached_tokens?: number;
            };
          };
        };
        if (e.usage) {
          const cached = e.usage.prompt_tokens_details?.cached_tokens ?? 0;
          const totalIn = e.usage.prompt_tokens ?? usage.input;
          usage.input = Math.max(0, totalIn - cached);
          usage.output = e.usage.completion_tokens ?? usage.output;
          if (cached > 0) usage.cacheRead = cached;
        }
        const content = e.choices?.[0]?.delta?.content;
        return typeof content === 'string' ? content : Array.isArray(content) ? content.map((x) => x.text ?? '').join('') : '';
      }, estimateTokens(JSON.stringify(args.input)), args.onChunk);
    },
  };
}

export function createZenProvider(
  fetcher: FetchLike = fetch,
  endpoint = (process.env.OPENCODE_ZEN_BASE_URL ? `${process.env.OPENCODE_ZEN_BASE_URL.replace(/\/+$/, '')}/chat/completions` : 'https://opencode.ai/zen/v1/chat/completions'),
): Provider {
  return createOpenAIProvider(fetcher, endpoint, 'opencode-zen');
}

export function createLocalProvider(options: {
  fetcher?: FetchLike;
  url?: string;
  token?: string;
  getHealth?: () => LocalHealth | null | undefined;
  now?: () => Date;
} = {}): Provider {
  const fetcher = options.fetcher ?? fetch;
  return {
    name: 'local',
    async invoke(args) {
      const rawUrl = options.url ?? process.env.LOCAL_MODEL_URL ?? '';
      const token = options.token ?? process.env.LOCAL_MODEL_TOKEN ?? '';
      const trimmed = rawUrl.trim();
      const isHttps = trimmed.startsWith('https://');
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed);
      if (!trimmed || (!isHttps && !isLocalhost)) {
        throw new Error('abhi band: LOCAL_MODEL_URL must use https:// or localhost');
      }

      if (options.getHealth) {
        const h = options.getHealth();
        const n = options.now ? options.now() : new Date();
        if (!isLocalHealthy(h, n)) {
          throw new Error('abhi band: local model is not healthy or health check is stale');
        }
      }

      const endpoint = trimmed.replace(/\/+$/, '').endsWith('/v1/chat/completions')
        ? trimmed
        : `${trimmed.replace(/\/+$/, '')}/v1/chat/completions`;

      const p = promptParts(args.input);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;

      const response = await fetcher(endpoint, {
        method: 'POST',
        signal: args.signal,
        headers,
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxOutputTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            ...(p.system ? [{ role: 'system', content: p.system }] : []),
            { role: 'user', content: p.user ?? '' },
          ],
        }),
      });

      return consumeSse(response, args.signal, (raw, usage) => {
        const e = raw as {
          choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        usage.input = e.usage?.prompt_tokens ?? usage.input;
        usage.output = e.usage?.completion_tokens ?? usage.output;
        const content = e.choices?.[0]?.delta?.content;
        return typeof content === 'string' ? content : Array.isArray(content) ? content.map((x) => x.text ?? '').join('') : '';
      }, estimateTokens(JSON.stringify(args.input)), args.onChunk);
    },
  };
}

export function createGeminiProvider(fetcher: FetchLike = fetch, endpointBase = 'https://generativelanguage.googleapis.com/v1beta/models'): Provider {
  return {
    name: 'gemini',
    async invoke(args) {
      const p = promptParts(args.input);
      const url = `${endpointBase}/${encodeURIComponent(args.model)}:streamGenerateContent?alt=sse`;
      const response = await fetcher(url, {
        method: 'POST', signal: args.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': args.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.system ?? '' }] },
          contents: [{ role: 'user', parts: [{ text: p.user ?? '' }] }],
          generationConfig: { maxOutputTokens: args.maxOutputTokens },
        }),
      });
      return consumeSse(response, args.signal, (raw, usage) => {
        const e = raw as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            cachedContentTokenCount?: number;
          };
        };
        if (e.usageMetadata) {
          const cached = e.usageMetadata.cachedContentTokenCount ?? 0;
          const totalIn = e.usageMetadata.promptTokenCount ?? usage.input;
          usage.input = Math.max(0, totalIn - cached);
          usage.output = e.usageMetadata.candidatesTokenCount ?? usage.output;
          if (cached > 0) usage.cacheRead = cached;
        }
        return e.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      }, estimateTokens(JSON.stringify(args.input)), args.onChunk);
    },
  };
}

export function createProviderAdapters(
  fetcher: FetchLike = fetch,
  localOptions?: Parameters<typeof createLocalProvider>[0],
): Provider[] {
  return [
    createAnthropicProvider(fetcher),
    createOpenAIProvider(fetcher),
    createGeminiProvider(fetcher),
    createZenProvider(fetcher),
    createLocalProvider({ fetcher, ...localOptions }),
  ];
}

/** Register S07's fetch-only adapters in the shared gateway provider map. No key/model/price is supplied here. */
export function registerChatProviderAdapters(
  gateway: Pick<Gateway, 'registerProvider'>,
  fetcher: FetchLike = fetch,
  localOptions?: Parameters<typeof createLocalProvider>[0],
): string[] {
  const adapters = createProviderAdapters(fetcher, localOptions);
  for (const adapter of adapters) gateway.registerProvider(adapter);
  return adapters.map((adapter) => adapter.name);
}

