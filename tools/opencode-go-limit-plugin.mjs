// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGIN THAT TELLS THE LAUNCHER OPENCODE IS WAITING ON GO'S USAGE LIMIT (round 48).
 *
 * OpenCode 1.18.31 retries a Go limit in silence, and may wait five hours before it gives up. It hands every event to
 * the plugins named in `OPENCODE_CONFIG_CONTENT`, in its own process, and what a plugin writes to standard output lands
 * in the run's output, in order (measured on 14 October 2026 against a local stand-in for the provider).
 * tools/sandbox-start.mjs names this file for each OpenCode run whose output it keeps, and reads the line.
 *
 * IT PRINTS ONE LINE FOR A RETRY ON GO'S LIMIT AND NOTHING ELSE, EVER, because the output is the run's own. The line
 * holds what OpenCode handed it, as handed. theGoLimitAnOpenCodeRunWaitsOn in src/config/stopped-run-cause.mjs reads it
 * and is the one place the reset is worked out. The plugin reads no environment and holds no key.
 *
 * ONLY THE PLUGIN IS EXPORTED. OpenCode calls every function a plugin module exports as a plugin.
 */
import { A_GO_RETRY_LINE } from '../src/config/stopped-run-cause.mjs'

export const MoleOfficeGoLimit = async () => ({
  /** @param {{ event: { type?: string, properties?: { status?: { type?: string, attempt?: number, next?: number, action?: { reason?: string, provider?: string, message?: string } } } } }} input */
  event: async ({ event }) => {
    const status = event?.type === 'session.status' ? event.properties?.status : undefined
    if (status?.type !== 'retry' || status.action?.reason !== 'account_rate_limit') return
    const line = { type: A_GO_RETRY_LINE, at: Date.now(), attempt: status.attempt, next: status.next, provider: status.action.provider, said: status.action.message }
    process.stdout.write(`${JSON.stringify(line)}\n`)
  },
})
