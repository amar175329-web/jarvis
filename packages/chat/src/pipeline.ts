import { route as routeDepth, type Route } from '../../brain/src/depth-router.ts';
import { asData, scanData } from '../../brain/src/injection.ts';
import { readKillFailClosed, type KillSwitchReader } from '../../shared/src/index.ts';
import { classify } from '../../memory/src/classify.ts';
import { findSecrets, redactText } from '../../memory/src/redact.ts';
import { MEMORY_PURPOSES, type MemoryPurpose } from '../../memory/src/types.ts';
import type { GatewayRequest, GatewayResult, ProviderChunkHandler } from '../../model-gateway/src/types.ts';
import { routeModel, type ModelRouterConfig } from './model-router.ts';
import { buildSystemPrompt } from './system-prompt.ts';
import { emitReply } from './stream.ts';
import { CARE_REPLY, detectCareSignal } from './care.ts';
import type { ChatInput, ChatMemoryPort, ChatStreamEvent, ChatThreadStore } from './types.ts';

export type ChatGateway = {
  /** Legacy call() is retained for compatibility with existing test doubles. */
  call?: (request: GatewayRequest) => Promise<GatewayResult>;
  callStream?: (request: GatewayRequest, onChunk: ProviderChunkHandler) => Promise<GatewayResult>;
};
export type ChatDecisionLogger = (line: string) => void | Promise<void>;
export type ChatDependencies = {
  killSwitch: KillSwitchReader;
  memory?: ChatMemoryPort;
  threads?: ChatThreadStore;
  /** Supplied by the authenticated server session, never from request JSON. */
  ownerId?: string;
  gateway: ChatGateway;
  modelConfig: ModelRouterConfig;
  emit?: (event: ChatStreamEvent) => void | Promise<void>;
  onDecisionLog?: ChatDecisionLogger;
  chunkSize?: number;
  /** Configurable context budget for prior thread turns; defaults to a conservative 1,000 tokens. */
  historyTokenBudget?: number;
};
export type HandleMessageResult = {
  status: 'ok' | 'care' | 'killed' | 'needs_model' | 'input_needed' | 'failed';
  text: string;
  decisionLog: string;
  depth?: Route;
  memorySaved?: boolean;
  memoryNotice?: string;
  modelError?: Extract<GatewayResult, { ok: false }>['code'];
};

function purposeFor(input: ChatInput): MemoryPurpose | undefined {
  const request = input.memoryPurpose;
  if (!request || !(MEMORY_PURPOSES as readonly string[]).includes(request.purpose)) return undefined;
  if (request.purpose === 'ask' && request.reason !== 'explicit_question') return undefined;
  if (request.purpose !== 'ask' && request.reason !== 'task_requirement') return undefined;
  return request.purpose;
}

function gatewayMessage(result: Extract<GatewayResult, { ok: false }>): string {
  switch (result.code) {
    case 'budget_exceeded': return (result.message && result.message.includes('budget set nahi hai')) ? 'Model budget set nahi hai. Settings mein MODEL_DAY_LIMIT_INR aur MODEL_MONTH_LIMIT_INR set karein.' : 'Aaj ki model budget limit poori ho gayi hai. Main abhi model call nahi kar raha.';
    case 'unpriced_model': return 'Is model ki keemat settings mein set nahi hai. Main keemat ka andaza nahi lagaunga; Amit/S13 ko ise configure karna hoga.';
    case 'no_key': return 'Model ki server key configured nahi hai. Key sirf server environment mein set honi chahiye.';
    case 'kill_switch_on': return 'Kill switch ON hai, main kuch nahi kar raha.';
    case 'unknown_model':
    case 'unknown_provider': return 'Ye model/provider allow-list mein configured nahi hai. Main doosra model khud se nahi chununga.';
    case 'timeout': return 'Model ne jawab dene mein zyada waqt liya. Main dobara khud se call nahi kar raha.';
    case 'provider_error': return 'Model service se jawab nahi mila. Main is error ko safe tareeke se rok raha hoon.';
  }
}

function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }
function isPrivateMessage(text: string): boolean {
  return classify(text).categories.length > 0 || findSecrets(text).length > 0;
}

/** Keep recent messages in chronological order; count JSON and DATA-frame overhead in the history budget. */
function selectHistory(messages: Awaited<ReturnType<ChatThreadStore['listMessages']>>, purpose: MemoryPurpose | undefined, tokenBudget: number) {
  const budget = Math.max(0, Math.floor(tokenBudget));
  const selected: Array<{ role: 'user' | 'assistant'; content: string; sequence: number }> = [];
  let includedPrivate = false;
  const frameTokens = (rows: typeof selected) => estimateTokens(asData('message', JSON.stringify(rows.slice().sort((a, b) => a.sequence - b.sequence).map(({ role, content }) => ({ role, content })))));
  if (frameTokens([]) > budget) return { messages: selected, includedPrivate };

  for (const message of [...messages].sort((a, b) => b.sequence - a.sequence)) {
    const privateMessage = isPrivateMessage(message.content);
    if (privateMessage && !purpose) continue;
    const points = Array.from(redactText(message.content));
    if (!points.length) continue;

    // Binary-search the longest safe prefix whose complete serialized DATA frame fits.
    let low = 0;
    let high = points.length;
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = { role: message.role, content: points.slice(0, mid).join(''), sequence: message.sequence };
      const fits = mid > 0 && frameTokens([...selected, candidate]) <= budget;
      if (fits) { best = mid; low = mid + 1; }
      else high = mid - 1;
    }
    if (best === 0) continue;
    selected.push({ role: message.role, content: points.slice(0, best).join(''), sequence: message.sequence });
    if (privateMessage) includedPrivate = true;
    if (best < points.length) break;
  }
  return { messages: selected.reverse(), includedPrivate };
}

async function persistThreadMessage(deps: ChatDependencies, input: ChatInput, role: 'user' | 'assistant', content: string): Promise<boolean> {
  if (!deps.threads || !deps.ownerId || !input.threadId) return false;
  try {
    await deps.threads.appendMessage({ ownerId: deps.ownerId, threadId: input.threadId, role, content });
    return true;
  } catch {
    // Do not log chat text or storage errors that may contain private data.
    await deps.onDecisionLog?.(`Thread ${role} message could not be persisted; chat content was not logged.`);
    return false;
  }
}

/** S07's single message entry point. Care reply bypasses all models/memory and remains active even when kill switch is ON. */
export async function handleMessage(input: ChatInput, deps: ChatDependencies): Promise<HandleMessageResult> {
  const originalText = input.text ?? '';
  const care = detectCareSignal(originalText);
  const kill = await readKillFailClosed(deps.killSwitch);

  if (care) {
    if (deps.threads && deps.ownerId && input.threadId) {
      try {
        const existing = await deps.threads.listMessages({ ownerId: deps.ownerId, threadId: input.threadId, limit: 10 });
        const alreadySaved = existing.some((m) => m.id === input.messageId || (m.role === 'user' && m.content === originalText));
        if (!alreadySaved) {
          await persistThreadMessage(deps, input, 'user', originalText);
        }
      } catch {
        await persistThreadMessage(deps, input, 'user', originalText);
      }
    }
    await emitReply(CARE_REPLY, deps.emit ?? (() => undefined), { threadId: input.threadId, messageId: input.messageId }, deps.chunkSize ?? 48);
    await persistThreadMessage(deps, input, 'assistant', CARE_REPLY);
    const decisionLog = `Care reply (${care}) returned locally; no private slot, memory recall or model call was used.${kill.kill ? ' (Kill switch was ON, but care reply is exempt).' : ''}`;
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'care', text: CARE_REPLY, decisionLog };
  }

  if (kill.kill) {
    const decisionLog = 'Kill switch ON/unreadable; stopped before memory, model, stream or power. No content was read or acted on.';
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'killed', text: 'Kill switch ON hai, main kuch nahi kar raha.', decisionLog };
  }

  if (!originalText.trim()) {
    const decisionLog = 'No text was supplied; voice transcription remains S21-owned and no model was called.';
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'input_needed', text: 'Abhi text nahi mila. Voice ko S21 se text banwa kar bhejo.', decisionLog };
  }

  const safeText = redactText(originalText);
  // External content is framed as DATA before it can enter any prompt or depth routing.
  const sanitizedData = (input.data ?? []).map((item) => ({ source: item.source, text: redactText(item.text) }));
  const framedData = sanitizedData.map((item) => asData(item.source, item.text));
  const dataScans = sanitizedData.map((item) => scanData(item.text));
  const purpose = purposeFor(input);
  const rawExternalText = (input.data ?? []).map((x) => x.text).join('\n');
  const allForClassification = [originalText, rawExternalText].join('\n');
  const privateInput = isPrivateMessage(allForClassification);
  const depth = routeDepth({ text: safeText, tags: (privateInput || purpose) ? ['personal'] : undefined });

  let memoryRecall: Awaited<ReturnType<ChatMemoryPort['recall']>> | undefined;
  if (deps.memory) memoryRecall = await deps.memory.recall({ text: safeText, ...(purpose ? { purpose } : {}) });
  const privateHitCount = memoryRecall?.private_hits ?? 0;

  let selectedHistory: ReturnType<typeof selectHistory> = { messages: [], includedPrivate: false };
  if (input.threadId && deps.ownerId && deps.threads) {
    try {
      const rows = await deps.threads.listMessages({ ownerId: deps.ownerId, threadId: input.threadId, limit: 40 });
      selectedHistory = selectHistory(rows, purpose, deps.historyTokenBudget ?? 1000);
    } catch {
      await deps.onDecisionLog?.('Thread history was unavailable; current message will continue without prior turns.');
    }
  }
  const historyFrame = selectedHistory.messages.length
    ? [asData('message', JSON.stringify(selectedHistory.messages.map(({ role, content }) => ({ role, content }))))]
    : [];
  const privateRecall = Boolean(purpose && privateHitCount > 0);
  // Even a hidden T2 hit is enough to forbid a FREE slot; its text still stays out without purpose.
  const privateData = privateInput || privateHitCount > 0 || selectedHistory.includedPrivate;
  const memoryReason = privateRecall
    ? 'Amit ke sawal ya zaroori task ke typed purpose se private memory mili; detail isi kaam tak seemit hai.'
    : purpose
      ? 'Typed purpose diya gaya, lekin koi T2 detail prompt mein nahi aayi.'
      : privateHitCount > 0
        ? 'Private memory match mili, par typed purpose nahi tha; T2 text recall nahi kiya.'
        : 'Sirf T1/default memory dekhi; T2 ko bina typed purpose ke nahi bulaya.';
  const prompt = buildSystemPrompt({ userText: safeText, framedData: [...framedData, ...historyFrame], memoryBlock: memoryRecall?.block, memoryReason });
  await persistThreadMessage(deps, input, 'user', originalText);

  const taskType = input.taskType ?? 'chat';
  const routed = routeModel({ depth: depth.depth, privateData, taskType, config: deps.modelConfig });
  if (routed.status === 'ask') {
    const decisionLog = 'Private context detected; no free/unknown model was called because an approved paid/safe slot is missing.';
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'needs_model', text: routed.question, decisionLog, depth };
  }
  if (routed.status === 'unconfigured') {
    const decisionLog = 'No model was selected; the requested depth has no verified model slot in settings.';
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'needs_model', text: routed.message, decisionLog, depth };
  }

  const attachmentNote = (input.attachments ?? []).map((attachment) => ({ fileName: attachment.fileName ?? null, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes ?? null }));
  const attachmentFrame = attachmentNote.length
    ? `<<DATA source=file-reference: attachment metadata only>>\n${JSON.stringify(attachmentNote)}\n<<END DATA>>`
    : '';
  const userContent = [prompt.user, attachmentFrame].filter(Boolean).join('\n\n');
  const request: GatewayRequest = {
    provider: routed.slot.provider,
    model: routed.slot.model,
    task: `chat:${taskType}:${depth.depth.toLowerCase()}`,
    input: { system: prompt.system, user: userContent },
    maxOutputTokens: depth.budget.maxOutputTokens,
    estimatedInputTokens: Math.max(1, estimateTokens(prompt.system + userContent)),
  };

  let modelResult: GatewayResult;
  if (deps.gateway.callStream) {
    const emit = deps.emit ?? (() => undefined);
    let started = false;
    let index = 0;
    const start = async () => {
      if (started) return;
      started = true;
      await emit({ type: 'chat.message.started', threadId: input.threadId, messageId: input.messageId });
    };
    const onChunk: ProviderChunkHandler = async (delta) => {
      await start();
      await emit({ type: 'chat.message.delta', threadId: input.threadId, messageId: input.messageId, index: index++, text: delta });
    };
    modelResult = await deps.gateway.callStream(request, onChunk);
    if (!modelResult.ok) {
      await emit({ type: 'chat.message.error', threadId: input.threadId, messageId: input.messageId, code: modelResult.code });
      const decisionLog = `Model gateway refused/failed (${modelResult.code}); no memory save or power ran.`;
      await deps.onDecisionLog?.(decisionLog);
      return { status: 'failed', text: gatewayMessage(modelResult), decisionLog, depth, modelError: modelResult.code };
    }
    if (!started) {
      await start();
      if (modelResult.text) await onChunk(modelResult.text);
    }
    await emit({ type: 'chat.message.completed', threadId: input.threadId, messageId: input.messageId });
  } else {
    if (!deps.gateway.call) throw new Error('ChatGateway requires callStream or call');
    modelResult = await deps.gateway.call(request);
    if (!modelResult.ok) {
      const decisionLog = `Model gateway refused/failed (${modelResult.code}); no memory save or power ran.`;
      await deps.onDecisionLog?.(decisionLog);
      await deps.emit?.({ type: 'chat.message.error', threadId: input.threadId, messageId: input.messageId, code: modelResult.code });
      return { status: 'failed', text: gatewayMessage(modelResult), decisionLog, depth, modelError: modelResult.code };
    }
    await emitReply(modelResult.text, deps.emit ?? (() => undefined), { threadId: input.threadId, messageId: input.messageId }, deps.chunkSize ?? 48);
  }

  await persistThreadMessage(deps, input, 'assistant', modelResult.text);

  let memorySaved: boolean | undefined;
  let memoryNotice: string | undefined;
  if (input.remember?.explicit && deps.memory) {
    const save = await deps.memory.remember({
      text: originalText,
      kind: input.remember.kind ?? 'fact',
      title: input.remember.title,
      tags: input.remember.tags,
      origin: 'chat',
      actor: 'jarvis',
      explicit: true,
      why: 'Amit ne chat mein yaad rakhne ko kaha',
    });
    memorySaved = save.verdict.verdict === 'save';
    memoryNotice = save.verdict.userMessage || undefined;
  } else if (input.remember?.explicit && !deps.memory) {
    memoryNotice = 'Memory service abhi connected nahi hai; main ise save nahi kar paya.';
  }

  const dataNote = input.data?.length
    ? (dataScans.some((scan) => scan.flagged) ? 'Possible instruction-like text stayed inside DATA boundaries.' : 'External content stayed inside DATA boundaries.')
    : 'No external data was supplied.';
  const historyNote = selectedHistory.messages.length
    ? `Included ${selectedHistory.messages.length} prior thread messages within ${deps.historyTokenBudget ?? 1000} token history budget; T2 history ${selectedHistory.includedPrivate ? 'used only for typed purpose' : 'excluded without purpose'}.`
    : 'No eligible prior thread messages were included.';
  const decisionLog = [
    `${depth.depth} selected (${depth.reason}); ${routed.reason}.`,
    dataNote,
    historyNote,
    privateRecall ? 'T2 memory used for a typed purpose; private text omitted from logs.' : 'Default memory recall remained T1-only.',
    input.remember?.explicit ? 'Explicit memory request passed only through MemoryService policy.' : 'No automatic memory write.',
    'No power was executed by the chat pipeline.',
  ].join(' ');
  await deps.onDecisionLog?.(decisionLog);
  return { status: 'ok', text: modelResult.text, decisionLog, depth, memorySaved, memoryNotice };
}
