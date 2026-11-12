import { route as routeDepth, type Route } from '../../brain/src/depth-router.ts';
import { asData, scanData } from '../../brain/src/injection.ts';
import { readKillFailClosed, type KillSwitchReader } from '../../shared/src/index.ts';
import { classify } from '../../memory/src/classify.ts';
import { findSecrets, redactText } from '../../memory/src/redact.ts';
import { MEMORY_PURPOSES, type MemoryPurpose } from '../../memory/src/types.ts';
import type { GatewayRequest, GatewayResult } from '../../model-gateway/src/types.ts';
import { routeModel, type ModelRouterConfig } from './model-router.ts';
import { buildSystemPrompt } from './system-prompt.ts';
import { emitReply } from './stream.ts';
import type { ChatInput, ChatMemoryPort, ChatStreamEvent } from './types.ts';

export type ChatGateway = { call(request: GatewayRequest): Promise<GatewayResult> };
export type ChatDecisionLogger = (line: string) => void | Promise<void>;
export type ChatDependencies = {
  killSwitch: KillSwitchReader;
  memory?: ChatMemoryPort;
  gateway: ChatGateway;
  modelConfig: ModelRouterConfig;
  emit?: (event: ChatStreamEvent) => void | Promise<void>;
  onDecisionLog?: ChatDecisionLogger;
  chunkSize?: number;
};
export type HandleMessageResult = {
  status: 'ok' | 'killed' | 'needs_model' | 'input_needed' | 'failed';
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
    case 'budget_exceeded': return 'Aaj ki model budget limit poori ho gayi hai. Main abhi model call nahi kar raha.';
    case 'unpriced_model': return 'Is model ki keemat settings mein set nahi hai. Main keemat ka andaza nahi lagaunga; Amit/S13 ko ise configure karna hoga.';
    case 'no_key': return 'Model ki server key configured nahi hai. Key sirf server environment mein set honi chahiye.';
    case 'kill_switch_on': return 'Kill switch ON hai, main kuch nahi kar raha.';
    case 'unknown_model':
    case 'unknown_provider': return 'Ye model/provider allow-list mein configured nahi hai. Main doosra model khud se nahi chununga.';
    case 'timeout': return 'Model ne jawab dene mein zyada waqt liya. Main dobara khud se call nahi kar raha.';
    case 'provider_error': return 'Model service se jawab nahi mila. Main is error ko safe tareeke se rok raha hoon.';
  }
}

/**
 * S07's single message entry point. The kill-switch read is deliberately the first I/O.
 * Provider SSE is buffered by today's model-gateway Provider contract; chat emits ordered
 * deltas after the gateway returns. The true live-delta seam is documented as a contract request.
 */
export async function handleMessage(input: ChatInput, deps: ChatDependencies): Promise<HandleMessageResult> {
  const kill = await readKillFailClosed(deps.killSwitch);
  if (kill.kill) {
    const decisionLog = 'Kill switch ON/unreadable; stopped before memory, model, stream or power. ' + 'No content was read or acted on.';
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'killed', text: 'Kill switch ON hai, main kuch nahi kar raha.', decisionLog };
  }

  const originalText = input.text ?? '';
  if (!originalText.trim()) {
    const decisionLog = 'No text was supplied; voice transcription remains S21-owned and no model was called.';
    await deps.onDecisionLog?.(decisionLog);
    return { status: 'input_needed', text: 'Abhi text nahi mila. Voice ko S21 se text banwa kar bhejo.', decisionLog };
  }

  const safeText = redactText(originalText);
  // Establish the trust boundary before depth routing and memory recall.
  const sanitizedData = (input.data ?? []).map((item) => ({ source: item.source, text: redactText(item.text) }));
  const framedData = sanitizedData.map((item) => asData(item.source, item.text));
  const dataScans = sanitizedData.map((item) => scanData(item.text));
  const purpose = purposeFor(input);
  const rawExternalText = (input.data ?? []).map((x) => x.text).join('\n');
  const allForClassification = [originalText, rawExternalText].join('\n');
  const privateInput = classify(allForClassification).categories.length > 0 || findSecrets(allForClassification).length > 0;
  // Depth is chosen before memory recall. A typed private-purpose request is routed DEEP.
  const depth = routeDepth({ text: safeText, tags: (privateInput || purpose) ? ['personal'] : undefined });

  let memoryRecall: Awaited<ReturnType<ChatMemoryPort['recall']>> | undefined;
  if (deps.memory) {
    memoryRecall = await deps.memory.recall({ text: safeText, ...(purpose ? { purpose } : {}) });
  }
  const privateHitCount = memoryRecall?.private_hits ?? 0;
  const privateRecall = Boolean(purpose && privateHitCount > 0);
  const privateData = privateInput || privateHitCount > 0;
  const memoryReason = privateRecall
    ? 'Amit ke sawal ya zaroori task ke typed purpose se private memory mili; detail isi kaam tak seemit hai.'
    : purpose
      ? 'Typed purpose diya gaya, lekin koi T2 detail prompt mein nahi aayi.'
      : privateHitCount > 0
        ? 'Private memory match mili, par typed purpose nahi tha; T2 text recall nahi kiya.'
        : 'Sirf T1/default memory dekhi; T2 ko bina typed purpose ke nahi bulaya.';
  const prompt = buildSystemPrompt({
    userText: safeText,
    framedData,
    memoryBlock: memoryRecall?.block,
    memoryReason,
  });
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

  // Attachments and voice are references only. S07 never introduces a second STT/TTS path.
  const attachmentNote = (input.attachments ?? []).map((a) => ({ fileName: a.fileName ?? null, mimeType: a.mimeType, sizeBytes: a.sizeBytes ?? null }));
  const userContent = [prompt.user, attachmentNote.length ? `<<DATA source=file-reference: attachment metadata only>>\n${JSON.stringify(attachmentNote)}\n<<END DATA>>` : ''].filter(Boolean).join('\n\n');
  const gatewayInput = { system: prompt.system, user: userContent };
  const request: GatewayRequest = {
    provider: routed.slot.provider,
    model: routed.slot.model,
    task: `chat:${taskType}:${depth.depth.toLowerCase()}`,
    input: gatewayInput,
    maxOutputTokens: depth.budget.maxOutputTokens,
    estimatedInputTokens: Math.max(1, Math.ceil((prompt.system.length + userContent.length) / 4)),
  };
  const modelResult = await deps.gateway.call(request);
  if (!modelResult.ok) {
    const decisionLog = `Model gateway refused/failed (${modelResult.code}); no memory save or power ran.`;
    await deps.onDecisionLog?.(decisionLog);
    await deps.emit?.({ type: 'chat.message.error', threadId: input.threadId, messageId: input.messageId, code: modelResult.code });
    return { status: 'failed', text: gatewayMessage(modelResult), decisionLog, depth, modelError: modelResult.code };
  }

  const stream = deps.emit ?? (() => undefined);
  await emitReply(modelResult.text, stream, { threadId: input.threadId, messageId: input.messageId }, deps.chunkSize ?? 48);

  let memorySaved: boolean | undefined;
  let memoryNotice: string | undefined;
  if (input.remember?.explicit && deps.memory) {
    // Original text is supplied only to S09's policy/service, which refuses T3 and never logs it.
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
  const decisionLog = [
    `${depth.depth} selected (${depth.reason}); ${routed.reason}.`,
    dataNote,
    privateRecall ? 'T2 used for a typed purpose; private text omitted from logs.' : 'Default recall remained T1-only.',
    input.remember?.explicit ? 'Explicit memory request passed only through MemoryService policy.' : 'No automatic memory write.',
    'No power was executed by the chat pipeline.',
  ].join(' ');
  await deps.onDecisionLog?.(decisionLog);
  return { status: 'ok', text: modelResult.text, decisionLog, depth, memorySaved, memoryNotice };
}
