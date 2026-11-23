// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { it } from 'vitest'
import { aHostStartGivesOnlyItsOwnKey } from './a-made-up-host-worker.ts'

it('starts a Claude Code worker at its cut with its own key and records its end', async () => {
  await aHostStartGivesOnlyItsOwnKey('claude-code')
}, 120_000)
