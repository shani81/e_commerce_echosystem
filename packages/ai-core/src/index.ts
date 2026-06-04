// @aicos/ai-core — the provider abstraction (swap layer) over Claude/OpenAI/Gemini.
// Phase 0: interfaces + a router skeleton with stub providers and NO network calls.
// The worker/api implement against these contracts.

export * from './types';
export * from './provider';
export * from './aliases';
export * from './router';
export * from './clip';

export { AnthropicProvider } from './providers/anthropic';
export type { AnthropicProviderConfig } from './providers/anthropic';
export { OpenAiProvider } from './providers/openai';
export type { OpenAiProviderConfig } from './providers/openai';
export { GeminiProvider } from './providers/gemini';
export type { GeminiProviderConfig } from './providers/gemini';

import { AiRouter, type AiRouterOptions } from './router';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAiProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';

/**
 * Build a router pre-registered with all three stub providers and the default
 * alias table / fallback chain. API keys are read from env by callers and passed
 * in; in Phase 0 they are unused because the adapters make no network calls.
 */
export function createDefaultRouter(
  options: AiRouterOptions & {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    geminiApiKey?: string;
    /** Override the Gemini model id (e.g. `gemini-flash-latest`). */
    geminiModel?: string;
  } = {},
): AiRouter {
  const { anthropicApiKey, openaiApiKey, geminiApiKey, geminiModel, ...routerOptions } = options;
  return new AiRouter(routerOptions)
    .register(new GeminiProvider({ apiKey: geminiApiKey, model: geminiModel }))
    .register(new AnthropicProvider({ apiKey: anthropicApiKey }))
    .register(new OpenAiProvider({ apiKey: openaiApiKey }));
}
