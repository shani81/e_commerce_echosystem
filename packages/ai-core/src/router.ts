import {
  ALIASES,
  DEFAULT_FALLBACK_CHAIN,
  resolveAlias,
  type AiTaskAlias,
  type AliasDefinition,
} from './aliases';
import { NotImplementedError, type AiProvider } from './provider';
import type {
  AiCapability,
  AiProviderName,
  AiUsage,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  VisionRequest,
  VisionResponse,
} from './types';

/** Emitted once per successful provider call so callers can meter/bill usage. */
export interface UsageEvent {
  alias?: AiTaskAlias;
  capability: AiCapability;
  provider: AiProviderName;
  usage: AiUsage;
  /** Wall-clock latency of the underlying provider call (ms). */
  latencyMs: number;
  /** Providers skipped (and why) before this one succeeded. */
  fallbacksTried: { provider: AiProviderName; reason: string }[];
}

/** Injected sink for usage events. Kept side-effect-free in this package. */
export type UsageCallback = (event: UsageEvent) => void;

export interface AiRouterOptions {
  /** Called after every successful provider call. */
  onUsage?: UsageCallback;
  /** Override the global fallback order. Defaults to Gemini → Claude → OpenAI. */
  defaultChain?: readonly AiProviderName[];
}

/** How to pick a provider for a single call. Supply exactly one of these. */
export interface RouteOptions {
  /** Resolve via a logical task alias (preferred). */
  alias?: AiTaskAlias;
  /** Or pin a specific provider. */
  provider?: AiProviderName;
}

/**
 * Routes AI calls to registered providers by capability/alias, walking a
 * fallback chain when a provider is missing or throws `NotImplementedError`, and
 * emits a usage event via the injected callback on success.
 *
 * Phase 0: providers are stubs, so every chain ultimately rethrows
 * `NotImplementedError` — the router's selection, fallback, and event logic are
 * what's exercised and what the worker/api build against.
 */
export class AiRouter {
  private readonly providers = new Map<AiProviderName, AiProvider>();
  private readonly onUsage?: UsageCallback;
  private readonly defaultChain: readonly AiProviderName[];

  constructor(options: AiRouterOptions = {}) {
    this.onUsage = options.onUsage;
    this.defaultChain = options.defaultChain ?? DEFAULT_FALLBACK_CHAIN;
  }

  /** Register (or replace) a provider adapter. Chainable. */
  register(provider: AiProvider): this {
    this.providers.set(provider.name, provider);
    return this;
  }

  /** Whether a provider is registered. */
  has(name: AiProviderName): boolean {
    return this.providers.has(name);
  }

  /** Capability-aware chat with alias/provider routing + fallback. */
  chat(request: ChatRequest, route: RouteOptions = { alias: 'chat' }): Promise<ChatResponse> {
    return this.dispatch('chat', route, (p) => p.chat(request));
  }

  /** Capability-aware vision (multimodal) with routing + fallback. */
  vision(request: VisionRequest, route: RouteOptions = { alias: 'vision' }): Promise<VisionResponse> {
    return this.dispatch('vision', route, (p) => p.vision(request));
  }

  /** Capability-aware embeddings with routing + fallback. */
  embed(request: EmbedRequest, route: RouteOptions = { alias: 'embed' }): Promise<EmbedResponse> {
    return this.dispatch('embed', route, (p) => p.embed(request));
  }

  /**
   * Build the ordered provider chain for a route, validating that the requested
   * capability matches the alias.
   */
  private resolveChain(capability: AiCapability, route: RouteOptions): {
    chain: readonly AiProviderName[];
    alias?: AiTaskAlias;
  } {
    if (route.provider) {
      return { chain: [route.provider] };
    }
    if (route.alias) {
      const def: AliasDefinition = resolveAlias(route.alias);
      if (def.capability !== capability) {
        throw new Error(
          `@aicos/ai-core: alias "${route.alias}" is for "${def.capability}", not "${capability}"`,
        );
      }
      return { chain: def.chain, alias: route.alias };
    }
    return { chain: this.defaultChain };
  }

  /**
   * Walk the chain: skip unregistered/unsupporting providers, call the first
   * eligible one, fall through to the next on `NotImplementedError`, and emit a
   * usage event on success.
   */
  private async dispatch<R extends { usage: AiUsage }>(
    capability: AiCapability,
    route: RouteOptions,
    call: (provider: AiProvider) => Promise<R>,
  ): Promise<R> {
    const { chain, alias } = this.resolveChain(capability, route);
    const fallbacksTried: { provider: AiProviderName; reason: string }[] = [];

    for (const name of chain) {
      const provider = this.providers.get(name);
      if (!provider) {
        fallbacksTried.push({ provider: name, reason: 'not registered' });
        continue;
      }
      if (!provider.supports(capability)) {
        fallbacksTried.push({ provider: name, reason: `does not support ${capability}` });
        continue;
      }

      const startedAt = Date.now();
      try {
        const result = await call(provider);
        this.onUsage?.({
          alias,
          capability,
          provider: name,
          usage: result.usage,
          latencyMs: Date.now() - startedAt,
          fallbacksTried,
        });
        return result;
      } catch (err) {
        // Only `NotImplementedError` is a "try the next provider" signal in
        // Phase 0; genuine provider errors propagate so callers see them.
        if (err instanceof NotImplementedError) {
          fallbacksTried.push({ provider: name, reason: err.code });
          continue;
        }
        throw err;
      }
    }

    const attempted = chain.join(' → ');
    throw new NoProviderAvailableError(capability, attempted, fallbacksTried, alias);
  }
}

/** Thrown when every provider in the chain was skipped or could not handle the call. */
export class NoProviderAvailableError extends Error {
  readonly code = 'AI_NO_PROVIDER' as const;
  constructor(
    public readonly capability: AiCapability,
    public readonly chain: string,
    public readonly fallbacksTried: { provider: AiProviderName; reason: string }[],
    public readonly alias?: AiTaskAlias,
  ) {
    super(
      `@aicos/ai-core: no provider could handle "${capability}"` +
        (alias ? ` (alias "${alias}")` : '') +
        ` — tried: ${chain}`,
    );
    this.name = 'NoProviderAvailableError';
  }
}

/** Re-exported for convenience so consumers can build a default registry. */
export { ALIASES };
