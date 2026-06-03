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

export interface OpenAiProviderConfig {
  /** From `OPENAI_API_KEY`. Unused in Phase 0 (no network calls). */
  apiKey?: string;
  /** Override the default chat/vision model id. */
  model?: string;
  /** Override the default embeddings model id. */
  embedModel?: string;
  baseUrl?: string;
}

/**
 * OpenAI adapter — STUB.
 *
 * Declares correct default model ids and supports all three capabilities, but
 * every method throws `NotImplementedError` until Phase 1 wires in the `openai`
 * SDK.
 */
export class OpenAiProvider implements AiProvider {
  readonly name: AiProviderName = 'openai';

  readonly models: Readonly<Record<AiCapability, string>>;

  private readonly config: OpenAiProviderConfig;

  constructor(config: OpenAiProviderConfig = {}) {
    this.config = config;
    const chat = config.model ?? 'gpt-4o';
    this.models = {
      chat,
      vision: chat,
      embed: config.embedModel ?? 'text-embedding-3-large',
    };
  }

  supports(_capability: AiCapability): boolean {
    return true;
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
