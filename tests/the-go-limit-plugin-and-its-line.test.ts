// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 48, ITEM 1: THE PLUGIN THAT TELLS THE LAUNCHER OPENCODE IS WAITING ON GO, AND THE READING OF ITS LINE.
 *
 * OpenCode 1.18.31 runs a plugin in its own process and hands it every event, including each retry. The plugin prints
 * one line on the run's output for a retry on Go's usage limit, and nothing else, ever: the output is the run's own,
 * and the launcher reads it. stopped-run-cause.mjs reads the line, and is the one place that works out the reset and
 * where it came from. A line OpenCode prints itself, other than an error, means the run went on.
 *
 * The events are in the shape OpenCode 1.18.31 sent its plugin on 14 October 2026, against a local stand-in for the
 * provider. No OpenCode, provider or office runs here. Each test was proved by a control run, its named mutation red,
 * and the restore.
 */
import { afterEach, expect, it, vi } from 'vitest'
import * as plugin from '../tools/opencode-go-limit-plugin.mjs'
import { A_GO_LIMIT_WITH_NO_RESET_MS, anOpenCodeLineThatGoesOn, theGoLimitAnOpenCodeRunWaitsOn } from '../src/config/stopped-run-cause.mjs'

afterEach(() => { vi.restoreAllMocks() })

const NEXT = Date.parse('2026-10-14T20:30:00.000Z')
const status = (value: unknown) => ({ id: 'evt_synthetic', type: 'session.status', properties: { sessionID: 'ses_synthetic', status: value } })
const goWords = (resetIn: string) => `5-hour usage limit reached. It will reset in ${resetIn}. To continue using this model now, enable usage from your available balance`
const aGoRetry = (resetIn: string) => status({
  type: 'retry', attempt: 2, message: `${goWords(resetIn)} - https://opencode.ai/workspace/synthetic/go`, next: NEXT,
  action: { reason: 'account_rate_limit', provider: 'opencode-go', title: 'Go limit reached', message: goWords(resetIn), label: 'open settings', link: 'https://opencode.ai/workspace/synthetic/go' },
})

/** What the plugin printed for `events`, line by line, with the run's output caught instead of shown. */
async function whatThePluginPrints(events: unknown[]): Promise<string[]> {
  const written: string[] = []
  const exported = Object.values(plugin)
  expect(exported).toHaveLength(1)
  const hooks = await (exported[0] as (context: unknown) => Promise<{ event: (input: { event: unknown }) => Promise<void> }>)({})
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { written.push(String(chunk)); return true })
  for (const event of events) await hooks.event({ event })
  vi.restoreAllMocks()
  return written.join('').split('\n').filter(line => line !== '')
}

// Mutation: the plugin prints a line for every retry. Red: a retry that is not Go's limit gives a line.
it('prints one line for a retry on Go’s limit, and nothing for any other event', async () => {
  const lines = await whatThePluginPrints([
    status({ type: 'busy' }),
    status({ type: 'retry', attempt: 1, message: 'Too Many Requests', next: NEXT }),
    status({ type: 'retry', attempt: 1, message: 'Free usage exceeded', next: NEXT, action: { reason: 'free_tier_limit', provider: 'opencode', title: 'Free limit reached', message: 'Free usage exceeded' } }),
    { id: 'evt_synthetic', type: 'session.idle', properties: { sessionID: 'ses_synthetic' } },
    aGoRetry('2 hours'),
  ])
  expect(lines).toHaveLength(1)
  const read = theGoLimitAnOpenCodeRunWaitsOn(lines[0]!)
  expect(read).toMatchObject({ attempt: 2, provider: 'opencode-go', said: goWords('2 hours'), resetsAtMs: NEXT, resetFrom: 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"' })
  expect(Math.abs(read!.seenAtMs - Date.now())).toBeLessThan(60_000)
  expect(anOpenCodeLineThatGoesOn(lines[0]!)).toBe(false)
})

// Mutation: a retry that names no reset is read as named by the error. Red: resetFrom claims a source, and the reset is
// OpenCode's next try a few seconds away.
it('reads a retry that names no reset as assumed, five hours from the retry', async () => {
  const lines = await whatThePluginPrints([aGoRetry('')])
  const read = theGoLimitAnOpenCodeRunWaitsOn(lines[0]!)
  expect(read?.resetFrom).toBe("assumed: five hours, Go's allowance window (OpenCode's retry named no reset)")
  expect(read!.resetsAtMs - read!.seenAtMs).toBe(A_GO_LIMIT_WITH_NO_RESET_MS)
})

// Mutation: an error OpenCode prints counts as going on. Red: the end of the tries on Go's limit would take the mark off.
it('counts a line OpenCode prints as going on, except an error, its plugin’s line or what is not its JSON', () => {
  expect(anOpenCodeLineThatGoesOn(JSON.stringify({ type: 'text', timestamp: NEXT, part: { type: 'text', text: 'Synthetic.' } }))).toBe(true)
  expect(anOpenCodeLineThatGoesOn(JSON.stringify({ type: 'step_start', timestamp: NEXT }))).toBe(true)
  expect(anOpenCodeLineThatGoesOn(JSON.stringify({ type: 'error', timestamp: NEXT, error: { name: 'APIError' } }))).toBe(false)
  expect(anOpenCodeLineThatGoesOn('Synthetic words that are not JSON')).toBe(false)
  expect(anOpenCodeLineThatGoesOn(JSON.stringify({ text: 'no type' }))).toBe(false)
  expect(theGoLimitAnOpenCodeRunWaitsOn(JSON.stringify({ type: 'text' }))).toBeNull()
})
