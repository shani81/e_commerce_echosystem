// @aicos/shared — cross-cutting runtime utilities shared across AICOS workspaces.
//   - env     : zod-validated environment loader
//   - result  : Result/ok/err for fallible operations
//   - errors  : AppError hierarchy + stable error codes
//   - money   : toCents/fromCents/formatMoney
//   - ids     : slug/sku/code helpers
//   - queues  : BullMQ queue names + job payload contracts (API ⇄ worker)
export * from './env';
export * from './result';
export * from './errors';
export * from './money';
export * from './ids';
export * from './queues';
