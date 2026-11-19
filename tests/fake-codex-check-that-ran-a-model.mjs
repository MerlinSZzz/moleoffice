// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic check output for the receipt test. No model runs and no verdict is filed. */
import { inspectionUsageLine } from '../src/config/usage.mjs'

process.stdout.write('Synthetic check tool. The events below are made up; no model ran.\n')
process.stdout.write(inspectionUsageLine('codex', [
  { type: 'thread.started', thread_id: '33333333-3333-3333-3333-333333333333' },
  { type: 'turn.completed', usage: { input_tokens: 111, cached_input_tokens: 22, output_tokens: 44 } },
].map((event) => JSON.stringify(event)).join('\n')) + '\n')
