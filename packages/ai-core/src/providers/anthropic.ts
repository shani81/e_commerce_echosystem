import { type AiProvider, NotImplementedError } from '../provider';
import type {
  AiCapability,
  AiProviderName,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  VisionRequest,
  VisionResponse,
} from '../types';

export interface AnthropicProviderConfig {
  /** From `ANTHROPIC_API_KEY`. Unused in Phase 0 (no network calls). */
  apiKey?: string;
  /** Override the default chat/vision model id. */
  model?: string;
  baseUrl?: string;
}

/**
 * Claude (Anthropic) adapter — STUB.
 *
 * Declares the correct shape and default model ids so the worker/api can build
 * against it, but every method throws `NotImplementedError` until Phase 1 wires
 * in `@anthropic-ai/sdk`. Anthropic has no embeddings endpoint, so it does not
 * advertise the `embed` capability.
 */
export class AnthropicProvider implements AiProvider {
  readonly name: AiProviderName = 'anthropic';

  readonly models: Readonly<Record<AiCapability, string>>;

  private readonly config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig = {}) {
    this.config = config;
    const chat = config.model ?? 'claude-3-7-sonnet-latest';
    this.models = {
      chat,
      vision: chat,
      // Anthropic does not provide embeddings; left blank and not supported.
      embed: '',
    };
  }

  supports(capability: AiCapability): boolean {
    return capability === 'chat' || capability === 'vision';
  }

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    throw new NotImplementedError(this.name, 'chat');
  }

  async vision(_request: VisionRequest): Promise<VisionResponse> {
    throw new NotImplementedError(this.name, 'vision');
  }

  async embed(_request: EmbedRequest): Promise<EmbedResponse> {
    throw new NotImplementedError(this.name, 'embed');
  }
}
