// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import { claudeUsage, codexUsage, openCodeUsage, theRoundsOwnCodexUsage } from '../../config/usage.mjs'

/**
 * The Claude, Codex and OpenCode readers live in `src/config/usage.mjs`, shared with `tools/agent-worker.mjs` and
 * `tools/sandbox-start.mjs`, which cannot read TypeScript. They are re-exported here so every adapter keeps importing
 * its receipt from the one place the adapters' receipt rules live, and absence and the "not given" sentence cannot
 * drift between the runtimes.
 */
export { claudeUsage, codexUsage, openCodeUsage, theRoundsOwnCodexUsage }

/** The installed Kimi final-message format emits assistant content only, no usage envelope. */
export function kimiUsage(_said: string): UsageReceipt {
  return { runtime: 'kimi', source: '--output-format stream-json --final-message-only',
    says: 'This output format gives no token usage, model, duration or cost.' }
}
