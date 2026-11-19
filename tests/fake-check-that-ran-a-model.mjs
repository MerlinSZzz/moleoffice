// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SYNTHETIC CHECK TOOL THAT RAN A MODEL, FOR THE CHECK-RECEIPT TEST.
 *
 * It runs no model and judges no work. It prints the one line an inspector prints its Claude Code
 * envelope on — through the shared marker constant, so the fixture follows the product — and stops
 * without a verdict. Nothing here is a real check and the record says so.
 */
import { CLAUDE_USAGE_LINE } from '../src/config/usage.mjs'

process.stdout.write('Synthetic check tool: the line below stands in for a model that ran. No model ran.\n')
process.stdout.write(CLAUDE_USAGE_LINE + JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 4321,
  session_id: '22222222-2222-2222-2222-222222222222',
  total_cost_usd: 0.25,
  usage: { input_tokens: 11, cache_read_input_tokens: 22, cache_creation_input_tokens: 33, output_tokens: 44 },
  modelUsage: { 'claude-opus-5': {} },
}) + '\n')
