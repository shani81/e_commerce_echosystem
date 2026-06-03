# @aicos/ai-core

The AICOS **AI provider abstraction** — the swap layer over Claude (Anthropic), OpenAI, and Gemini (Google). It defines the provider contract, the normalized request/response/usage types, a logical task-alias table, and an `AiRouter` that selects a provider by capability/alias and walks a fallback chain.

**Phase 0:** this is a contract package. The provider adapters are **stubs that throw `NotImplementedError`** and make **no network calls**. The worker and API build against these interfaces; real SDK wiring lands in Phase 1. CommonJS library (`main: dist/index.js`), consumed by the NestJS services.

## Concepts

- **`AiProvider`** (`provider.ts`) — the seam. `chat()`, `vision()`, `embed()`, plus `name`, `models`, and `supports(capability)`. Nothing else in AICOS imports a vendor SDK directly.
- **Providers** (`providers/*`) — `AnthropicProvider`, `OpenAiProvider`, `GeminiProvider`. Each declares correct default model ids and supported capabilities, but every method throws `NotImplementedError` in Phase 0. (Anthropic does not advertise `embed`.)
- **Aliases** (`aliases.ts`) — logical tasks map to a capability + an ordered provider chain, so call sites ask for a *task*, not a vendor:
  | Alias | Capability | Chain |
  |-------|-----------|-------|
  | `extraction.primary` | vision | gemini → anthropic → openai |
  | `extraction.fallback` | vision | anthropic → openai |
  | `content` | chat | anthropic → openai → gemini |
  | `content.fallback` | chat | openai → gemini |
  | `chat` | chat | gemini → anthropic → openai |
  | `vision` | vision | gemini → anthropic → openai |
  | `embed` | embed | openai → gemini |

  The global default fallback order is **Gemini → Claude → OpenAI**.
- **`AiRouter`** (`router.ts`) — `register()` providers, then `chat()` / `vision()` / `embed()`. It resolves the chain (by `alias` or pinned `provider`), skips unregistered/unsupporting providers, falls through on `NotImplementedError`, throws `NoProviderAvailableError` if the chain is exhausted, and emits a `UsageEvent` via the injected `onUsage` callback on success.

## Usage

```ts
import { createDefaultRouter } from '@aicos/ai-core';

const router = createDefaultRouter({
  geminiApiKey: process.env.GEMINI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  onUsage: (e) => metering.record(e), // injected; this package has no side effects
});

// Routes by the "content" alias → anthropic → openai → gemini.
const res = await router.chat(
  { messages: [{ role: 'user', content: 'Write a product blurb.' }] },
  { alias: 'content' },
);
// Phase 0: ultimately throws NoProviderAvailableError because every adapter is a stub.
```

You can also build the router by hand:

```ts
import { AiRouter, GeminiProvider, AnthropicProvider } from '@aicos/ai-core';

const router = new AiRouter({ onUsage })
  .register(new GeminiProvider({ apiKey }))
  .register(new AnthropicProvider({ apiKey }));
```

All request shapes have matching zod schemas (e.g. `ChatRequestSchema`, `VisionRequestSchema`, `EmbedRequestSchema`) for validation at the API boundary.

## Errors

- `NotImplementedError` (`code: 'AI_NOT_IMPLEMENTED'`) — a stub method that needs a real network call; the router treats it as a "try the next provider" signal.
- `NoProviderAvailableError` (`code: 'AI_NO_PROVIDER'`) — the whole chain was skipped or exhausted; carries `fallbacksTried` for diagnostics.

## Scripts

| Script | Action |
|--------|--------|
| `pnpm --filter @aicos/ai-core build` | `tsc -p tsconfig.json` → `dist` |
| `pnpm --filter @aicos/ai-core typecheck` | `tsc -p tsconfig.json --noEmit` |
| `pnpm --filter @aicos/ai-core lint` | ESLint over `src` |
| `pnpm --filter @aicos/ai-core clean` | remove `dist` |
