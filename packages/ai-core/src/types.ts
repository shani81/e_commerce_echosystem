import { z } from 'zod';

/**
 * The set of model providers AICOS can swap between. The router treats these as
 * opaque identifiers; the alias table (see `aliases.ts`) maps logical
 * capabilities (e.g. `extraction.primary`) onto one of these.
 */
export const AI_PROVIDER_NAMES = ['anthropic', 'openai', 'gemini'] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

/** Conversation roles common to all three providers. */
export const AiRoleSchema = z.enum(['system', 'user', 'assistant']);
export type AiRole = z.infer<typeof AiRoleSchema>;

/** A single chat message. `content` is plain text in Phase 0. */
export const AiMessageSchema = z.object({
  role: AiRoleSchema,
  content: z.string(),
  /** Optional speaker label (provider-dependent; ignored by stubs). */
  name: z.string().optional(),
});
export type AiMessage = z.infer<typeof AiMessageSchema>;

/**
 * Normalized token accounting returned by every call, so callers/metering can
 * sum usage across providers uniformly.
 */
export const AiUsageSchema = z.object({
  provider: z.enum(AI_PROVIDER_NAMES),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

/** Knobs shared by chat/vision generation requests. */
export const AiGenerationOptionsSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  /** Force JSON output where the provider supports it. */
  json: z.boolean().optional(),
  /** Caller-supplied id for tracing/idempotency. */
  requestId: z.string().optional(),
});
export type AiGenerationOptions = z.infer<typeof AiGenerationOptionsSchema>;

export const ChatRequestSchema = AiGenerationOptionsSchema.extend({
  messages: z.array(AiMessageSchema).min(1),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  text: z.string(),
  finishReason: z.enum(['stop', 'length', 'content_filter', 'tool_calls', 'error']).optional(),
  usage: AiUsageSchema,
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

/** An image reference for a vision request: a URL or base64 data. */
export const AiImageSchema = z.object({
  url: z.string().url().optional(),
  base64: z.string().optional(),
  mimeType: z.string().default('image/png'),
});
export type AiImage = z.infer<typeof AiImageSchema>;

export const VisionRequestSchema = AiGenerationOptionsSchema.extend({
  /** The text instruction / question accompanying the image(s). */
  prompt: z.string(),
  images: z.array(AiImageSchema).min(1),
});
export type VisionRequest = z.infer<typeof VisionRequestSchema>;

export type VisionResponse = ChatResponse;
export const VisionResponseSchema = ChatResponseSchema;

export const EmbedRequestSchema = z.object({
  model: z.string().optional(),
  /** One or many strings to embed. */
  input: z.union([z.string(), z.array(z.string()).min(1)]),
  requestId: z.string().optional(),
});
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;

export const EmbedResponseSchema = z.object({
  /** One vector per input string, in order. */
  embeddings: z.array(z.array(z.number())),
  usage: AiUsageSchema,
});
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;

/** Capabilities a provider may advertise; the router routes on these. */
export const AI_CAPABILITIES = ['chat', 'vision', 'embed'] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];
