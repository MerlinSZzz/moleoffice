// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READING ROUND'S RATE-LIMIT EVENT IS READ FROM THE END OF ITS OUTPUT FILE, WITH THE ANSWER THE WHOLE TEXT GIVES. Wave
 * 13y round 17 for the envelope; wave 13p round E for the rate-limit event, which the sandboxes' login is read from.
 *
 * The week-use notice read every run's `out` whole and decoded it; on the live host that was 4,082 files and 1.8 GB on
 * its first reading after a start. `theRateLimitLineInTheFile` (src/server/lib/logins-week.ts) reads 64 KB at a time
 * from the end and decodes only the stretches that can hold the event. What it must not do is give a different answer,
 * so each file here is asked both ways: from its end, and whole through `theRateLimitLineIn`.
 *
 * THE FILES are the shapes that read differently from the end: an event that is the last line, with or without a
 * newline after it; one with lines after it, as a result line always is; one that is the first line, a megabyte back;
 * one longer than three reads; one whose `rate_limit_event` is written with a `\u` escape; lines that carry
 * `"no_rate_limit_event"` and none that is an event; the word as another line's text, and no event; an event behind a
 * broken line; an empty file; and lines split by `\r\n`.
 *
 * Every figure here is made up.
 *
 * CONTROL: the test passes at the tip. MUTATIONS, each run and each red:
 *   1. A stretch is decoded only when it holds `"rate_limit_event"`: the test for `\u` removed.
 *   2. Only the last read is looked at: the loop returns null after its first read.
 *   3. A line begun in an earlier read loses those bytes: the stretch is made without `...unfinished`.
 *   4. The first line of the file is not looked at: the read at the start splits at its first newline as the others do.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let folder: string
let t: TestDb

// A THROWAWAY DATABASE, because lib/logins-week.ts opens the database client when it is loaded.
beforeAll(async () => {
  t = await freshDb()
  folder = mkdtempSync(join(tmpdir(), 'mole-office-test-rate-limit-lines-'))
})

afterAll(() => {
  t?.close()
  rmSync(folder, { recursive: true, force: true })
})

const event = (used: number, more: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { seven_day: { utilization: used, resetsAt: 1_700_172_800 } } }, ...more })
const result = JSON.stringify({ type: 'result', subtype: 'success', result: 'A made-up answer.' })
const chatter = (n: number): string =>
  Array.from({ length: n }, (_, at) => JSON.stringify({ type: 'assistant', at, message: { content: [{ type: 'text', text: `line ${String(at)}`, note: 'no_rate_limit_event' }] } })).join('\n')

const THE_FILES: Record<string, string> = {
  'the last line, with a newline after it': `${chatter(3)}\n${event(0.01)}\n`,
  'the last line, with no newline after it': `${chatter(3)}\n${event(0.02)}`,
  'lines after it': `${chatter(3)}\n${event(0.03)}\n${result}\n${chatter(5)}\n`,
  'the first line, a megabyte back': `${event(0.04)}\n${chatter(9_000)}\n`,
  'longer than three reads': `${chatter(10)}\n${event(0.05, { said: 'x'.repeat(200_000) })}\n${chatter(2)}\n`,
  'its type written with an escape': `${chatter(2)}\n{"type":"rate_limit_ev\\u0065nt","rate_limit_info":{"status":"allowed"}}\n${chatter(2_000)}\n`,
  'lines that carry no_rate_limit_event and no event': `${chatter(4_000)}\n`,
  'the word as another line’s text, and no event': `${chatter(3)}\n${JSON.stringify({ type: 'assistant', text: 'rate_limit_event' })}\n${result}\n`,
  'an event behind a broken line': `${event(0.07)}\n{"type":"rate_limit_event", broken\n`,
  'an empty file': '',
  'lines split by CR LF': `${chatter(3).replaceAll('\n', '\r\n')}\r\n${event(0.08)}\r\n${result}\r\n`,
}

it('every file gives from its end the rate-limit line the whole text gives', async () => {
  const { theRateLimitLineIn, theRateLimitLineInTheFile } = await import('../src/server/lib/logins-week.ts')
  const found: Record<string, string | null> = {}
  for (const [name, text] of Object.entries(THE_FILES)) {
    const path = join(folder, `${name.replaceAll(' ', '-')}.out`)
    writeFileSync(path, text)
    const whole = theRateLimitLineIn(text)
    found[name] = theRateLimitLineInTheFile(path)
    expect(found[name], name).toBe(whole)
  }
  // AND THE WHOLE TEXT FOUND WHAT EACH FILE WAS MADE TO HOLD, so the comparison above is not of two nulls.
  expect(Object.entries(found).filter(([, line]) => line !== null).map(([name]) => name)).toEqual(
    Object.keys(THE_FILES).filter((name) => !['lines that carry no_rate_limit_event and no event', 'the word as another line’s text, and no event', 'an empty file'].includes(name)),
  )
  expect(JSON.parse(found['longer than three reads']!)).toMatchObject({ rate_limit_info: { unifiedWindows: { seven_day: { utilization: 0.05 } } } })
  expect(found['its type written with an escape']).toBe('{"type":"rate_limit_ev\\u0065nt","rate_limit_info":{"status":"allowed"}}')
  expect(JSON.parse(found['lines split by CR LF']!)).toMatchObject({ rate_limit_info: { unifiedWindows: { seven_day: { utilization: 0.08 } } } })
})
