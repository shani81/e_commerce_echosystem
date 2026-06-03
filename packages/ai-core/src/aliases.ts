import type { AiCapability, AiProviderName } from './types';

/**
 * Logical task aliases. AICOS code asks the router for a *task* (e.g.
 * `extraction.primary`) rather than a concrete provider, so the provider mix can
 * be retuned per task without touching call sites.
 *
 * Defaults reflect the Phase 0 strategy: Gemini leads multimodal extraction
 * (fast + cheap vision), Claude leads written content, OpenAI leads embeddings.
 */
export const AI_TASK_ALIASES = [
  'extraction.primary',
  'extraction.fallback',
  'content',
  'content.fallback',
  'chat',
  'vision',
  'embed',
] as const;

export type AiTaskAlias = (typeof AI_TASK_ALIASES)[number];

export interface AliasDefinition {
  /** Which provider capability this alias resolves to. */
  capability: AiCapability;
  /** Ordered provider preference; the router walks it as a fallback chain. */
  chain: readonly AiProviderName[];
}

/**
 * The default global fallback order when no alias-specific chain applies:
 * Gemini → Claude → OpenAI.
 */
export const DEFAULT_FALLBACK_CHAIN: readonly AiProviderName[] = ['gemini', 'anthropic', 'openai'];

export const ALIASES: Readonly<Record<AiTaskAlias, AliasDefinition>> = {
  'extraction.primary': { capability: 'vision', chain: ['gemini', 'anthropic', 'openai'] },
  'extraction.fallback': { capability: 'vision', chain: ['anthropic', 'openai'] },
  content: { capability: 'chat', chain: ['anthropic', 'openai', 'gemini'] },
  'content.fallback': { capability: 'chat', chain: ['openai', 'gemini'] },
  chat: { capability: 'chat', chain: ['gemini', 'anthropic', 'openai'] },
  vision: { capability: 'vision', chain: ['gemini', 'anthropic', 'openai'] },
  embed: { capability: 'embed', chain: ['openai', 'gemini'] },
};

/** Look up an alias definition, throwing on unknown aliases (fail fast). */
export function resolveAlias(alias: AiTaskAlias): AliasDefinition {
  const def = ALIASES[alias];
  if (!def) {
    throw new Error(`@aicos/ai-core: unknown task alias "${alias}"`);
  }
  return def;
}
