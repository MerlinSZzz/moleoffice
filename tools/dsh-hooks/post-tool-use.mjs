#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PostToolUse: deliver messages not yet attached in this session; only the agent marks them read.
 *
 * The bridge runs this after every tool call and folds the `additionalContext` it prints into the
 * tool's result, which is the one moment a dsh run can be steered mid-conversation: a message
 * written while a long tool ran reaches the agent at the boundary instead of waiting for the run to
 * end. The read of `GET /api/messages?only=waiting-for-me&markDelivered=1` marks delivery, and local
 * scratch state remembers which messages this session has already received.
 *
 * NOTHING TO ATTACH IS NO OUTPUT, and every failure is one sentence on stderr with an exit code of
 * zero, because a hook must never stop a run by failing. If scratch state fails, messages are still
 * attached and may be repeated. See `office.mjs`.
 */
import { attachUnseen } from './office.mjs'

try {
  await attachUnseen('PostToolUse')
} catch (error) {
  process.stderr.write(
    `dsh-hooks PostToolUse: ${error instanceof Error ? error.message : String(error)}, so no message was attached.\n`,
  )
}
