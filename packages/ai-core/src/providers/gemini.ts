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

export interface GeminiProviderConfig {
  /** From `GEMINI_API_KEY`. Unused in Phase 0 (no network calls). */
  apiKey?: string;
  /** Override the default chat/vision model id. */
  model?: string;
  /** Override the default embeddings model id. */
  embedModel?: string;
  baseUrl?: string;
}

/**
 * Gemini (Google) adapter — STUB.
 *
 * The default primary for extraction-style multimodal work. Declares correct
 * model ids and supports all three capabilities, but every method throws
 * `NotImplementedError` until Phase 1 wires in `@google/generative-ai`.
 */
export class GeminiProvider implements AiProvider {
  readonly name: AiProviderName = 'gemini';

  readonly models: Readonly<Record<AiCapability, string>>;

  private readonly config: GeminiProviderConfig;

  constructor(config: GeminiProviderConfig = {}) {
    this.config = config;
    const chat = config.model ?? 'gemini-2.0-flash';
    this.models = {
      chat,
      vision: chat,
      embed: config.embedModel ?? 'text-embedding-004',
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
