import type {
  AiCapability,
  AiProviderName,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  VisionRequest,
  VisionResponse,
} from './types';

/**
 * The contract every model provider adapter implements. The router and the rest
 * of AICOS depend only on this interface, never on a concrete SDK — this is the
 * seam that lets us swap Claude/OpenAI/Gemini.
 */
export interface AiProvider {
  /** Stable provider id used by the router and usage metering. */
  readonly name: AiProviderName;

  /** Default model ids this adapter targets, keyed by capability. */
  readonly models: Readonly<Record<AiCapability, string>>;

  /** Capabilities this adapter supports; the router will not route others to it. */
  supports(capability: AiCapability): boolean;

  /** Text/chat completion. */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Multimodal (image + text) completion. */
  vision(request: VisionRequest): Promise<VisionResponse>;

  /** Text embeddings. */
  embed(request: EmbedRequest): Promise<EmbedResponse>;
}

/**
 * Thrown by Phase 0 stub adapters for any method that would require a real
 * network call. The router catches it to advance its fallback chain, and callers
 * can detect it to distinguish "not wired up yet" from genuine provider errors.
 */
export class NotImplementedError extends Error {
  readonly code = 'AI_NOT_IMPLEMENTED' as const;
  constructor(
    public readonly provider: AiProviderName,
    public readonly method: AiCapability,
  ) {
    super(`@aicos/ai-core: ${provider}.${method}() is not implemented in Phase 0`);
    this.name = 'NotImplementedError';
  }
}
