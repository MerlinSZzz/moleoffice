// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND'S RECEIPT IS ITS OWN, AND SAYS WHY WHEN IT HAS NO NUMBERS (wave 13s round 42, two Codex receipt faults).
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECTS THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 *   1. Run 2WL9TfhVa3u6, a Claude Code round that continued a conversation, was billed 767.70 USD: the conversation's
 *      cost over every round, not the round's own. The same was measured for Codex: `codex exec resume` reports the
 *      thread's total so far in turn.completed. Its receipt also held the seal's words "No numbers were read at the
 *      seal" beside the launcher's numbers, because the two were merged key by key.
 *   2. Codex run V9PIC7m9HQYx's receipt said only that its output held no turn.completed event. It had printed plain
 *      text, which ends with a "tokens used" line and its total.
 *
 * The outputs below are stand-ins written for this file, shaped like what `codex exec --json` and
 * `claude -p --output-format json` print. The plain-text one is shaped like the end of V9PIC7m9HQYx's output (the
 * masked tail of it). No number here is a real run's except the two costs of 2WL9TfhVa3u6 and qRQgEx30PmY1, which are
 * those runs' own envelopes' figures.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. theRoundsOwnCodexUsage returns the thread's total when it continues a run. The three-round case goes red.
 *   2. theRoundsOwnCodexUsage returns the total, as the round's, when the earlier figure cannot be found. The missing
 *      case goes red.
 *   3. theRoundsOwnCodexUsage skips the thread check. The different-thread case goes red.
 *   4. theRoundsOwnClaudeUsage keeps the conversation's cost. The 2WL9TfhVa3u6 case goes red.
 *   5. whyCodexReportedNoUsage leaves out the "tokens used" reading. The plain-text case goes red.
 *   6. whyCodexReportedNoUsage leaves out the failed turn, the error event, the signal, the cut line, or the no-JSON
 *      case. Each one's case goes red.
 *   7. theReceiptWrittenOver sends the fresh receipt as it is, a second writer merged key by key. The one-writer case
 *      goes red.
 *   8. theReceiptWrittenOver without its guard. The guard case goes red.
 *   9. estimatedCostOf pricing a receipt with no cached count as if none were cached. The price case goes red.
 *  10. The Codex adapter ignores `resumed`. The worker case goes red.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  A_LATER_READING_FOUND_NO_NUMBERS,
  theReceiptOfAnEndedCodexCommand,
  theReceiptOfAnEndedCommand,
  theReceiptWrittenOver,
  theRoundsOwnClaudeUsage,
  theRoundsOwnCodexUsage,
  USAGE_NUMBERS,
} from '../src/config/usage.mjs'
import { estimatedCostOf, type PriceTableReading } from '../src/shared/price-table.ts'
import type { UsageReceipt } from '../src/shared/usage-receipts.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { freshDb, type TestDb } from './helpers.ts'

const THREAD = '01a106ba-1b44-7371-868f-903c4d3866e6'
const ANOTHER_THREAD = '01a106ba-1b44-7371-868f-000000000000'

/** What `codex exec --json` prints for one round of a thread whose total so far is these counts. */
function aCodexRound(thread: string, [input, cached, output, reasoning]: [number, number, number, number]): string {
  return [
    { type: 'thread.started', thread_id: thread },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'ok' } },
    { type: 'turn.completed', usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning } },
  ].map((event) => JSON.stringify(event)).join('\n') + '\n'
}

const ROUND_ONE = aCodexRound(THREAD, [100, 60, 10, 4])
const ROUND_TWO = aCodexRound(THREAD, [250, 180, 25, 9])
const ROUND_THREE = aCodexRound(THREAD, [400, 330, 45, 15])

const numbersOf = (receipt: UsageReceipt) => Object.fromEntries(USAGE_NUMBERS.filter((key) => receipt[key] !== undefined).map((key) => [key, receipt[key]]))

describe("fault 1: a resumed Codex round's receipt holds only its own part of the thread's total", () => {
  it('gives each of three rounds of one thread only its own delta', () => {
    const one = theRoundsOwnCodexUsage(ROUND_ONE, null, null)
    const two = theRoundsOwnCodexUsage(ROUND_TWO, { run: 'roundOne0001', text: ROUND_ONE }, null)
    const three = theRoundsOwnCodexUsage(ROUND_THREE, { run: 'roundTwo0002', text: ROUND_TWO }, null)
    expect(numbersOf(one)).toEqual({ inputTokens: 100, cachedInputTokens: 60, outputTokens: 10, reasoningTokens: 4 })
    expect(numbersOf(two)).toEqual({ inputTokens: 150, cachedInputTokens: 120, outputTokens: 15, reasoningTokens: 5 })
    expect(numbersOf(three)).toEqual({ inputTokens: 150, cachedInputTokens: 150, outputTokens: 20, reasoningTokens: 6 })
    expect(three).toMatchObject({ runtime: 'codex', inputIncludesCached: true })
    expect(three.source).toContain('less the total run roundTwo0002 reported at its end')
    expect(three.says).toContain('Codex reports no cost.')
    expect(three).not.toHaveProperty('costUsd')
  })

  it('keeps no number as the round’s when the earlier figure cannot be found, and says the figures are the thread’s total', () => {
    const cumulative = "So the figures Codex gave are the thread's total so far, over every round of it, and not this run's own: tokens in 250, cached tokens 180, tokens out 25, reasoning tokens 9. None of them is kept on this receipt as a number of this run's. Codex reports no cost."
    const cases: [string, Parameters<typeof theRoundsOwnCodexUsage>[1], string][] = [
      ['unread', { run: 'roundOne0001', unread: '/sandbox/logs/roundOne0001/out: ENOENT' }, 'This run continues run roundOne0001, whose output file could not be read (/sandbox/logs/roundOne0001/out: ENOENT).'],
      ['no turn.completed', { run: 'roundOne0001', text: '{"type":"thread.started","thread_id":"' + THREAD + '"}\n' }, "This run continues run roundOne0001, whose output holds no turn.completed event, so the thread's total at its end is unknown."],
      ['another thread', { run: 'roundOne0001', text: aCodexRound(ANOTHER_THREAD, [100, 60, 10, 4]) }, `This run continues run roundOne0001, whose output names Codex thread ${ANOTHER_THREAD}, while this run's names ${THREAD}.`],
      ['a larger total', { run: 'roundOne0001', text: aCodexRound(THREAD, [300, 60, 10, 4]) }, "This run continues run roundOne0001, whose thread's total is larger than this run's (inputTokens 300 against 250), so the two are not one thread's totals."],
      ['the worker', { thread: THREAD }, `This run resumes Codex thread ${THREAD}, and the message worker was not told which run of that thread came before it.`],
    ]
    for (const [name, previous, why] of cases) {
      const receipt = theRoundsOwnCodexUsage(ROUND_TWO, previous, null)
      expect(numbersOf(receipt), name).toEqual({})
      expect(receipt.says, name).toBe(`${why} ${cumulative}`)
    }
  })

  it('gives a continued Claude Code round its own cost: 2WL9TfhVa3u6 less qRQgEx30PmY1, not the conversation’s', () => {
    const anEnvelope = (session: string, cost: number, input: number) => JSON.stringify({ type: 'result', subtype: 'success', session_id: session, total_cost_usd: cost, duration_ms: 1000, usage: { input_tokens: input, cache_read_input_tokens: 10, cache_creation_input_tokens: 1, output_tokens: 5 }, modelUsage: { 'claude-opus-5-5': {} } })
    const before = anEnvelope('a-conversation', 759.8058742000014, 7)
    const after = anEnvelope('a-conversation', 767.7004848000017, 9)
    const own = theRoundsOwnClaudeUsage(after, { run: 'qRQgEx30PmY1', text: `a warning\n${before}\n` })
    expect(own.costUsd).toBeCloseTo(7.8946106, 7)
    expect(own).toMatchObject({ inputTokens: 9, outputTokens: 5, durationMs: 1000 })
    expect(own.source).toContain('the cost is total_cost_usd less the 759.8058742000014 USD run qRQgEx30PmY1 reported at its end')
    expect(theRoundsOwnClaudeUsage(after, null).costUsd).toBe(767.7004848000017)

    const total = "So the cost Claude Code gave, 767.7004848000017 USD, is the conversation's total so far, over every round of it, and not this run's own. No cost is kept on this receipt as this run's."
    const unread = theReceiptOfAnEndedCommand({ text: after, noEnvelope: 'none', previous: { run: 'qRQgEx30PmY1', unread: '/sandbox/logs/qRQgEx30PmY1/out: ENOENT' }, stored: undefined, paidBy: 'p', ranIn: 'r' })
    expect(unread).not.toHaveProperty('costUsd')
    expect(unread).toMatchObject({ inputTokens: 9, outputTokens: 5 })
    expect(unread.says).toBe(`This run continues run qRQgEx30PmY1, whose output file could not be read (/sandbox/logs/qRQgEx30PmY1/out: ENOENT). ${total}`)
    const another = theRoundsOwnClaudeUsage(after, { run: 'qRQgEx30PmY1', text: anEnvelope('another-conversation', 1, 1) })
    expect(another).not.toHaveProperty('costUsd')
    expect(another.says).toBe(`This run continues run qRQgEx30PmY1, whose envelope names conversation another-conversation, while this run's names a-conversation. ${total}`)
  })
})

describe('fault 2: a Codex run that reported no usage says why, from what it printed', () => {
  const read = (text: string, stopped: string | null = null, previous: Parameters<typeof theRoundsOwnCodexUsage>[1] = null) => {
    const receipt = theReceiptOfAnEndedCodexCommand({ text, unread: null, stopped, previous, stored: undefined, ranIn: 'r' })
    expect(numbersOf(receipt), text.slice(0, 80)).toEqual({})
    return receipt.says
  }
  const STARTED = `{"type":"thread.started","thread_id":"${THREAD}"}\n{"type":"turn.started"}\n`

  it('takes the "tokens used" total of plain text, says it is one total with no split, and does not price it', () => {
    // Shaped like the end of V9PIC7m9HQYx's output: the total comes before Codex's last message, not after it.
    const plain = 'codex\nI ran the checks.\n\ntokens used\n425,719\nFiled the report and sent the paths.\n'
    expect(read(plain)).toBe('Codex printed plain text, not codex exec --json events, so the one usage it gave is its "tokens used" line, 425,719. That is a single total, not split into tokens in, cached tokens and tokens out, so it is kept in these words only and is not priced. Codex reports no cost.')
    expect(read(plain, null, { run: 'roundOne0001', text: '' })).toBe('Codex printed plain text, not codex exec --json events, so the one usage it gave is its "tokens used" line, 425,719. That is a single total, not split into tokens in, cached tokens and tokens out, so it is kept in these words only and is not priced. This run continues run roundOne0001, so the total is the thread\'s so far, over every round of it, and not this run\'s own. Codex reports no cost.')
  })

  it('quotes a failed turn’s message and an error event’s, cut to 200 characters', () => {
    expect(read(`${STARTED}{"type":"turn.failed","error":{"message":"stream disconnected before completion"}}\n`)).toBe('The turn failed before Codex reported usage: "stream disconnected before completion".')
    expect(read(`${STARTED}{"type":"error","message":"You've hit your usage limit."}\n`)).toBe('Codex reported an error before it reported usage: "You\'ve hit your usage limit.".')
    expect(read(`${STARTED}{"type":"turn.failed","error":{"message":"${'x'.repeat(250)}"}}\n`)).toBe(`The turn failed before Codex reported usage: "${'x'.repeat(200)}…".`)
  })

  it('says a run was stopped, an output was cut, held no JSON, or was empty, and otherwise names the last event', () => {
    expect(read(STARTED, 'by SIGTERM')).toBe('The run was stopped by SIGTERM before Codex reported usage.')
    expect(read(`${STARTED}{"type":"item.completed","item":{"id":"item_3","ty`)).toBe('The output ends part-way through a line of JSON, so it was cut before Codex reported usage.')
    expect(read('Not inside a trusted directory.\n')).toBe('The output holds no event of codex exec --json and no "tokens used" line of Codex\'s plain text, so Codex reported no usage that can be read.')
    expect(read('')).toBe('The output is empty, so Codex reported nothing.')
    expect(read(STARTED)).toBe('Codex\'s last event was "turn.started", and no turn.completed came after it, so no usage was reported.')
  })
})

describe("one writer: a receipt's words and numbers come from one reading (the tool maintainer's answer k0eknvS08jLE, 2)", () => {
  let t: TestDb
  beforeAll(async () => {
    t = await freshDb()
  })
  afterAll(() => t.close())

  /** The stored receipt after the office merges a write of `usageReceipt` into it, as patchRecord does. */
  const stored = (before: UsageReceipt | undefined, written: Record<string, unknown>) =>
    t.api.mergeData(before === undefined ? {} : { usageReceipt: before }, { usageReceipt: written }).data['usageReceipt']

  const SEALS: UsageReceipt = { runtime: 'claude-code', source: 'self-reported at the seal', says: 'No numbers were read at the seal: no transcript.', paidBy: 'not reported', ranIn: 'on the host', readAt: '2026-10-12 14:07:42' }
  const LAUNCHERS: UsageReceipt = { runtime: 'claude-code', source: '--output-format json', inputTokens: 9, outputTokens: 5, costUsd: 7.89, inputIncludesCached: false, paidBy: 'the payer', ranIn: 'in the sandbox w13s' }

  it('leaves no "no numbers" beside numbers, whichever reading came first', () => {
    // 2WL9TfhVa3u6's order: the seal's words, then the launcher's numbers.
    expect(stored(SEALS, theReceiptWrittenOver(SEALS, LAUNCHERS))).toEqual(LAUNCHERS)
    // The other order: numbers stored first, a later reading with numbers of its own.
    const later: UsageReceipt = { runtime: 'claude-code', source: 'the transcript', outputTokens: 6, says: 'Not given in this output: tokens in.' }
    expect(stored(LAUNCHERS, theReceiptWrittenOver(LAUNCHERS, later))).toEqual(later)
    // Outside spending is kept, as before.
    const spent = { ...SEALS, outsideSpend: [{ service: 'OpenRouter', usd: 0.42 }] }
    expect(stored(spent, theReceiptWrittenOver(spent, LAUNCHERS))).toEqual({ ...LAUNCHERS, outsideSpend: [{ service: 'OpenRouter', usd: 0.42 }] })
    // Nothing stored yet.
    expect(stored(undefined, theReceiptWrittenOver(undefined, LAUNCHERS))).toEqual(LAUNCHERS)
  })

  it('never makes a receipt worse: a reading with no numbers leaves stored numbers whole, and adds its words once', () => {
    const none: UsageReceipt = { runtime: 'claude-code', says: 'The run printed to its starter’s screen.' }
    const once = stored(LAUNCHERS, theReceiptWrittenOver(LAUNCHERS, none)) as UsageReceipt
    expect(once).toEqual({ ...LAUNCHERS, says: `${A_LATER_READING_FOUND_NO_NUMBERS}The run printed to its starter’s screen.` })
    expect(stored(once, theReceiptWrittenOver(once, none))).toEqual(once)
    // Words over words are a plain replacement: there were no numbers to keep.
    expect(stored(SEALS, theReceiptWrittenOver(SEALS, none))).toEqual(none)
  })
})

describe('a price reads the cached part of an input that includes it', () => {
  it('estimates nothing when a receipt says its input includes cached reads and gives no cached count', () => {
    const table: PriceTableReading = { state: 'set', table: { currency: 'USD', prices: { 'gpt-5.5': { input: 1, output: 10, cachedInput: 0.1 } } } }
    const codex: UsageReceipt = { runtime: 'codex', model: 'gpt-5.5', inputTokens: 2000, outputTokens: 100, inputIncludesCached: true }
    expect(estimatedCostOf(codex, table)).toEqual({ state: 'not-enough-numbers', because: "gpt-5.5's receipt did not say how much of its input was cached, so its price cannot be worked out." })
    expect(estimatedCostOf({ ...codex, cachedInputTokens: 2000 }, table)).toEqual({ state: 'estimated', total: (2000 * 0.1 + 100 * 10) / 1_000_000, currency: 'USD' })
  })
})

describe("the message worker's resumed Codex run", () => {
  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-rounds-receipt-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps the thread’s total as words, not as the run’s numbers, when it is not told which run of the thread came before', () => {
    const outputPath = join(dir, 'output')
    writeFileSync(outputPath, ROUND_TWO)
    writeFileSync(`${outputPath}.answer`, 'ok')
    const handle = { runtime: 'codex', pid: 0, pgid: 0, startedAt: '2026-10-13 10:00:00', providerSession: THREAD, outputPath }
    const resumed = new CodexAdapter({}).readResult({ ...handle, resumed: THREAD }).usageReceipt!
    expect(numbersOf(resumed)).toEqual({})
    expect(resumed.says).toContain(`This run resumes Codex thread ${THREAD}, and the message worker was not told which run of that thread came before it.`)
    const fresh = new CodexAdapter({}).readResult({ ...handle, resumed: null }).usageReceipt!
    expect(numbersOf(fresh)).toEqual({ inputTokens: 250, cachedInputTokens: 180, outputTokens: 25, reasoningTokens: 9 })
  })
})
