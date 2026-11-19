// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN IN ONE OF THE OFFICE'S TERMINALS GETS ITS USAGE RECEIPT WHEN ITS TERMINAL ENDS.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Every run records its tokens, by a decision. A run the
 * office opens in a terminal it holds is started by no
 * launcher, and the office's end of it (endTheRunOf in src/server/lib/terminal-agents.ts) wrote only how it ended, so a
 * Codex, OpenCode or Kimi run there carried no receipt at all (message gcF1KMJaSBD4, item 1; the secretary's agreement
 * ZbUh96UhT6YQ). lib/terminal-run-receipt.ts is the receipt; tests/an-agent-opens-in-a-terminal.test.ts cases 4 and 5
 * prove that the end of a real terminal writes it.
 *
 * The rollouts are made up in a folder of this test's own under the system's temporary folder, which stands in for a
 * home. Nothing reads the real home.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. A Claude Code run gets a receipt in words too. Case 1 goes red: its session hook's receipt would be replaced.
 *   2. The run's part of a Codex thread is counted from the thread's start, not from when the run was filed. Case 2
 *      goes red.
 *   3. The rollout is looked for by the first 24 characters of the record's thread, which another thread shares, so
 *      the newer of the two is read. Case 2 goes red.
 *
 * OLD (wave 13s round 113): the run was filed an hour before the real time, in the machine's zone. Run at 02:39 winter
 * time on 25 October 2026, its filing time was 01:39, a time the clocks show twice that night. It was read as the
 * summer-time one, an hour earlier, so case 2 counted the thread from before its first count and said 300 and 50.
 * NEW: the cases run on a fixed clock in Europe/London, frozen at noon summer time on 24 October 2026, and the run is
 * filed an hour before that noon.
 * WHY: a test that reads the real time passes or fails by the hour it is run at.
 * MUTATION (round 113, after a control run, then restored): mutation 2 above → case 2 goes red.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { localStamp } from '../src/shared/time.ts'
import { USAGE_NUMBERS } from '../src/config/usage.mjs'
import { theReceiptAtATerminalsEnd } from '../src/server/lib/terminal-run-receipt.ts'

// THE CLOCK READS IN EUROPE/LONDON, set before any module reads the zone. The zone before is put back after the file.
const theZoneBefore = vi.hoisted(() => {
  const before = process.env.TZ
  process.env.TZ = 'Europe/London'
  return before
})

const THREAD = '01a106ba-1b44-7371-868f-903c4d3866e6'
const ANOTHER_THREAD = '01a106ba-1b44-7371-868f-000000000000'
const SECRET = 'THE-CONTENT-OF-A-PROMPT-NEVER-COPIED'

/** Noon summer time on 24 October 2026, an ordinary day: the clock every case stands at. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

let home = ''
const began = AN_ORDINARY_NOON - 60 * 60_000

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AN_ORDINARY_NOON })
  home = mkdtempSync(join(tmpdir(), 'mole-terminal-receipt-'))
})
afterAll(() => {
  rmSync(home, { recursive: true, force: true })
  vi.useRealTimers()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

function aRun(runtime: string, more: Record<string, unknown> = {}) {
  return { createdAt: localStamp(new Date(began)), data: { runtime, state: 'running', workingDirectory: '/work/a-checkout', ...more } }
}

const numbersIn = (receipt: object) => Object.keys(receipt).filter((name) => (USAGE_NUMBERS as readonly string[]).includes(name))

describe("the receipt a run in the office's terminal gets when its terminal ends", () => {
  it("1: leaves a Claude Code run's receipt to its session hook", () => {
    expect(theReceiptAtATerminalsEnd(aRun('claude-code', { providerSession: THREAD }), { HOME: home })).toBeNull()
  })

  it("2: reads a brought-back Codex run's part of the thread its record names, from that thread's own rollout", () => {
    const day = join(home, '.codex', 'sessions', '2026', '10', '12')
    mkdirSync(day, { recursive: true })
    const at = (ms: number) => new Date(ms).toISOString()
    const count = (ms: number, input: number, output: number) => JSON.stringify({ timestamp: at(ms), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0 } } } })
    const own = join(day, `rollout-2026-10-12T01-00-00-${THREAD}.jsonl`)
    writeFileSync(own, [
      JSON.stringify({ timestamp: at(began - 10_000), type: 'session_meta', payload: { id: THREAD } }),
      count(began - 5_000, 100, 10),
      JSON.stringify({ timestamp: at(began + 1_000), type: 'turn_context', payload: { model: 'gpt-5.5-codex' } }),
      JSON.stringify({ timestamp: at(began + 1_500), type: 'response_item', payload: { content: SECRET } }),
      count(began + 2_000, 300, 50),
    ].join('\n') + '\n')
    const other = join(day, `rollout-2026-10-12T02-00-00-${ANOTHER_THREAD}.jsonl`)
    writeFileSync(other, `${count(began + 2_000, 9000, 900)}\n`)
    utimesSync(own, new Date(began), new Date(began))

    const spent = [{ service: 'a paid search', usd: 0.5 }]
    const receipt = theReceiptAtATerminalsEnd(aRun('codex', { providerSession: THREAD, usageReceipt: { outsideSpend: spent } }), { HOME: home })
    expect(receipt).toMatchObject({ runtime: 'codex', inputTokens: 200, outputTokens: 40, inputIncludesCached: true, model: 'gpt-5.5-codex', paidBy: 'not reported', ranIn: 'on the host', outsideSpend: spent })
    expect(receipt?.source).toBe(
      "read by the office when the run's terminal ended, from ~/.codex/sessions/2026/10/12/" +
        `rollout-2026-10-12T01-00-00-${THREAD}.jsonl: the Codex rollout, the last token_count's total_token_usage less the last one before the run began`,
    )
    expect(receipt?.readAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(JSON.stringify(receipt)).not.toContain(SECRET)
    expect(JSON.stringify(receipt)).not.toContain(home)
  })

  it('3: says in words why a fresh Codex run, an OpenCode run and a Kimi run carry no numbers', () => {
    for (const [run, why] of [
      [aRun('codex'), "Codex picks its own thread id when the office opens it in a terminal, and nothing recorded which thread this run had, so no rollout is this run's own."],
      [aRun('opencode'), "the office has no reader of an opencode run's own log."],
      [aRun('kimi', { providerSession: 'mole-office-terminal-0a1b2c3d4e5f' }), "the office has no reader of a kimi run's own log."],
    ] as const) {
      const receipt = theReceiptAtATerminalsEnd(run, { HOME: home })
      expect(receipt).toMatchObject({ runtime: run.data.runtime, source: "read by the office when the run's terminal ended", paidBy: 'not reported', ranIn: 'on the host' })
      expect(numbersIn(receipt!)).toEqual([])
      expect(receipt?.says).toBe(`No numbers were read when its terminal ended: ${why}`)
    }
  })
})
