import type { Depth } from '../../brain/src/depth-router.ts';

export type ProviderName = 'anthropic' | 'openai' | 'gemini';
export type TaskType = 'chat' | 'reasoning' | 'summarize' | 'code' | 'creative' | 'action';
export type ModelSlot = {
  provider: ProviderName;
  model: string;
  tier: 'free' | 'paid' | 'unknown';
  /** S13/Amit sets this only after provider data handling has been reviewed. */
  privateDataApproved?: boolean;
};
export type ModelRouterConfig = {
  fast: ModelSlot | null;
  normal: ModelSlot | null;
  deep: ModelSlot | null;
  private: ModelSlot | null;
  /** Optional task-specific slots; absent/null falls back to FAST/NORMAL/DEEP. */
  tasks?: Partial<Record<TaskType, ModelSlot | null>>;
};
export const EMPTY_MODEL_ROUTER_CONFIG: ModelRouterConfig = {
  fast: null,
  normal: null,
  deep: null,
  private: null,
  tasks: {},
};
export type ModelRoute =
  | { status: 'routed'; slot: ModelSlot; depth: Depth; reason: string }
  | { status: 'ask'; question: string; depth: Depth; reason: string }
  | { status: 'unconfigured'; message: string; depth: Depth; reason: string };

/** Selects only a configured slot. Prices intentionally do not live in this router. */
export function routeModel(input: {
  depth: Depth;
  privateData: boolean;
  taskType?: TaskType;
  config: ModelRouterConfig;
}): ModelRoute {
  if (input.privateData) {
    const slot = input.config.private;
    if (slot?.tier === 'paid' && slot.privateDataApproved === true && slot.model.trim()) {
      return { status: 'routed', slot, depth: input.depth, reason: 'private data -> approved paid/safe slot' };
    }
    return {
      status: 'ask',
      question: 'Is private baat ko sirf approved paid/safe model par process karun? Abhi aisa model configured nahi hai.',
      depth: input.depth,
      reason: 'private data blocked: no approved paid/safe slot',
    };
  }
  const taskSlot = input.taskType ? input.config.tasks?.[input.taskType] : null;
  const slot = taskSlot?.model?.trim() ? taskSlot : input.config[input.depth.toLowerCase() as 'fast' | 'normal' | 'deep'];
  if (!slot?.model?.trim()) {
    return { status: 'unconfigured', message: 'Is depth ka model configured nahi hai. Main model ka naam ya keemat khud se nahi chununga.', depth: input.depth, reason: 'model slot is blank' };
  }
  if (slot.tier === 'unknown') {
    return { status: 'unconfigured', message: 'Model ka tier verify nahi hai. Amit/S13 ko settings mein confirm karna hoga.', depth: input.depth, reason: 'model tier is unknown' };
  }
  return { status: 'routed', slot, depth: input.depth, reason: taskSlot?.model?.trim() ? `${input.taskType} task override -> configured ${slot.tier} slot` : `${input.depth} -> configured ${slot.tier} slot` };
}
