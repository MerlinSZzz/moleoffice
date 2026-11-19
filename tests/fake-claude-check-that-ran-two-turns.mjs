// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic native Claude results for a check and its resumed correction. No model runs. */
import { inspectionUsageLine } from '../src/config/usage.mjs'

process.stdout.write('Synthetic check and correction. No model ran.\n')
process.stdout.write(inspectionUsageLine('claude-code', [
  { type: 'result', session_id: '44444444-4444-4444-4444-444444444444', usage: { input_tokens: 10, cache_read_input_tokens: 2, output_tokens: 3 }, total_cost_usd: 0.1, model: 'claude-synthetic' },
  { type: 'result', session_id: '44444444-4444-4444-4444-444444444444', usage: { input_tokens: 20, cache_read_input_tokens: 4, output_tokens: 6 }, total_cost_usd: 0.2, model: 'claude-synthetic' },
].map((envelope) => JSON.stringify(envelope)).join('\n')) + '\n')
