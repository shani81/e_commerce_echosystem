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
  /** 2.5-series thinking budget; 0 (default) disables thinking for clean JSON. */
  thinkingBudget?: number;
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

/**
 * Gemini (Google) adapter. `vision()` is implemented against the Generative
 * Language REST API (`:generateContent`) — the default primary for the
 * extraction pipeline. It requires an API key (from `GEMINI_API_KEY`); without
 * one it throws `NotImplementedError` so the router advances its fallback chain.
 * `chat()`/`embed()` remain stubs until needed.
 */
export class GeminiProvider implements AiProvider {
  readonly name: AiProviderName = 'gemini';

  readonly models: Readonly<Record<AiCapability, string>>;

  private readonly config: GeminiProviderConfig;
  private readonly baseUrl: string;

  constructor(config: GeminiProviderConfig = {}) {
    this.config = config;
    // `gemini-2.0-flash` was retired (404). Default to the current flash; override
    // per call/config (e.g. `gemini-flash-latest` to always track the newest).
    const chat = config.model ?? 'gemini-2.5-flash';
    this.models = {
      chat,
      vision: chat,
      embed: config.embedModel ?? 'text-embedding-004',
    };
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  supports(_capability: AiCapability): boolean {
    return true;
  }

  async chat(_request: ChatRequest): Promise<ChatResponse> {
    throw new NotImplementedError(this.name, 'chat');
  }

  async vision(request: VisionRequest): Promise<VisionResponse> {
    if (!this.config.apiKey) throw new NotImplementedError(this.name, 'vision');
    const model = request.model ?? this.models.vision;

    const parts: GeminiPart[] = [{ text: request.prompt }];
    for (const img of request.images) {
      if (img.base64) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        ...(request.temperature != null ? { temperature: request.temperature } : {}),
        ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
        ...(request.json ? { responseMimeType: 'application/json' } : {}),
        // Disable 2.5-series "thinking": it spends the output-token budget on
        // reasoning and can truncate the structured JSON (→ empty result).
        // Ignored by non-thinking models.
        thinkingConfig: { thinkingBudget: this.config.thinkingBudget ?? 0 },
      },
    };

    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini vision HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as GeminiResponse;
    const candidate = json.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    const u = json.usageMetadata ?? {};

    return {
      text,
      finishReason: mapFinishReason(candidate?.finishReason),
      usage: {
        provider: this.name,
        model,
        inputTokens: u.promptTokenCount ?? 0,
        outputTokens: u.candidatesTokenCount ?? 0,
        totalTokens: u.totalTokenCount ?? 0,
      },
    };
  }

  async embed(_request: EmbedRequest): Promise<EmbedResponse> {
    throw new NotImplementedError(this.name, 'embed');
  }
}

function mapFinishReason(reason?: string): ChatResponse['finishReason'] {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
    default:
      return undefined;
  }
}
