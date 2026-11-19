// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S TOKENS ARE READ WHILE IT RUNS, FROM WHAT ITS RUNTIME WRITES AS IT GOES (wave 14d, package RM, clause RM-3).
 *
 * Each runtime's adapter is asked for its tokens so far (`tokensSoFar` in src/worker/runtimes/adapter.ts) after the
 * first half of a made-up output is written and again after the second, and each answer is the count of what was
 * written by then. The count is the one rule of src/config/tokens-so-far.mjs: input not read from the cache, plus cache
 * writes, plus output. Cache reads are left out, so every made-up answer here has some, and a count that took them in
 * would be wrong. A runtime that gives no count says so in words, and gives no zero.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The adapters and their readers are the product's. Every output is MADE UP by this file, in its own temporary
 * folder, in the shape each runtime writes: no real run's conversation or output is read, and no process is started.
 * The counts are made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. theTokensCounted adds the cache reads to a count whose input leaves them out. The Claude Code, OpenCode and
 *      fake cases go red.
 *   2. Claude Code's reader counts every line of the file, not only those since the run began. The Claude Code case
 *      goes red.
 *   3. Codex's adapter counts a resumed run with codexUsage, the thread's total. The resumed case goes red.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { THE_TOKENS_COUNTED } from '../src/config/tokens-so-far.mjs'
import { theTranscriptFolder } from '../src/config/claude-code-served.mjs'
import { clockStamp } from '../src/shared/time.ts'
import type { RunHandle, RuntimeAdapter } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'
import { KimiAdapter } from '../src/worker/runtimes/kimi.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'

const scratch = mkdtempSync(join(tmpdir(), 'tokens-so-far-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** When each made-up run began. */
const STARTED = new Date('2026-11-16T10:00:00Z')

function aHandle(runtime: string, outputPath: string, more: Partial<RunHandle> = {}): RunHandle {
  const startedTime = clockStamp(() => STARTED)
  return { runtime, pid: 0, pgid: 0, startedAt: startedTime.stamp, startedTime, providerSession: null, outputPath, ...more }
}

const lines = (events: unknown[]): string => events.map((event) => `${JSON.stringify(event)}\n`).join('')
const countedAs = (source: string, how: string) => `Read from ${source}, ${how}. Counted: ${THE_TOKENS_COUNTED}.`

describe('each runtime that writes as it goes gives its count so far, with the cache reads left out', () => {
  it('Claude Code: each answer of the conversation file once, from the lines since the run began', () => {
    const home = join(scratch, 'claude-home')
    const cwd = join(scratch, 'a made-up checkout')
    const conversation = 'made-up-conversation'
    const folder = theTranscriptFolder({ HOME: home }, cwd)!
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `${conversation}.jsonl`)
    const at = (minutes: number) => new Date(STARTED.getTime() + minutes * 60_000).toISOString()
    const answer = (id: string, minutes: number, usage: Record<string, number>) => ({ type: 'assistant', timestamp: at(minutes), message: { id, model: 'made-up-model', usage } })
    // An answer of the round before this run, in the same file, as a continued conversation has. It is left out.
    writeFileSync(file, lines([answer('msg_before', -5, { input_tokens: 900_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 900_000 })]))
    // The first answer is written in two lines with the same id, the second with the answer's final usage; it is counted once, as its last line says.
    appendFileSync(file, lines([
      { type: 'user', timestamp: at(1), message: { role: 'user', content: 'made up' } },
      answer('msg_1', 1, { input_tokens: 10, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 30_000, output_tokens: 1 }),
      answer('msg_1', 1, { input_tokens: 10, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 30_000, output_tokens: 400 }),
    ]))
    const adapter = new ClaudeCodeAdapter({ HOME: home })
    const handle = aHandle('claude-code', join(scratch, 'claude-output.json'), { cwd, providerSession: conversation })

    expect(adapter.tokensSoFar(handle)).toEqual({ tokens: 10 + 2_000 + 400, read: countedAs('the conversation file', 'each answer once') })

    appendFileSync(file, lines([answer('msg_2', 3, { input_tokens: 7, cache_creation_input_tokens: 5_000, cache_read_input_tokens: 32_000, output_tokens: 1_200 })]))
    expect(adapter.tokensSoFar(handle)).toEqual({ tokens: 10 + 2_000 + 400 + 7 + 5_000 + 1_200, read: countedAs('the conversation file', 'each answer once') })
  })

  it('Claude Code with no conversation file yet, or none named, gives no count and says why', () => {
    const adapter = new ClaudeCodeAdapter({ HOME: join(scratch, 'an empty home') })
    const cwd = join(scratch, 'another checkout')
    const named = adapter.tokensSoFar(aHandle('claude-code', join(scratch, 'x.json'), { cwd, providerSession: 'not-written-yet' }))
    expect(named.tokens).toBeNull()
    expect('why' in named && named.why).toMatch(/^The conversation file .*not-written-yet\.jsonl could not be read: /)
    expect(adapter.tokensSoFar(aHandle('claude-code', join(scratch, 'x.json'), { cwd }))).toEqual({
      tokens: null,
      why: 'The run names no conversation, so its conversation file is not known.',
    })
  })

  it('Codex: no count until a turn completes, then input less what was read from the cache, plus output', () => {
    const output = join(scratch, 'codex-output.jsonl')
    writeFileSync(output, lines([{ type: 'thread.started', thread_id: 'made-up-thread' }, { type: 'turn.started' }, { type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: 'made up' } }]))
    const adapter = new CodexAdapter({})
    const handle = aHandle('codex', output)

    const before = adapter.tokensSoFar(handle)
    expect(before.tokens).toBeNull()
    expect('why' in before && before.why).toMatch(/^Read from the output, at its last completed turn: it gives no input count\./)

    appendFileSync(output, lines([{ type: 'turn.completed', usage: { input_tokens: 50_000, cached_input_tokens: 41_000, output_tokens: 700, reasoning_output_tokens: 300 } }]))
    expect(adapter.tokensSoFar(handle)).toEqual({ tokens: 50_000 - 41_000 + 700, read: countedAs('the output', 'at its last completed turn') })
  })

  it("Codex resumed: the run's own part, the thread's total less the total of the run it continues", () => {
    const earlier = join(scratch, 'codex-earlier.jsonl')
    writeFileSync(earlier, lines([{ type: 'thread.started', thread_id: 'made-up-thread' }, { type: 'turn.completed', usage: { input_tokens: 20_000, cached_input_tokens: 15_000, output_tokens: 100, reasoning_output_tokens: 0 } }]))
    const output = join(scratch, 'codex-resumed.jsonl')
    writeFileSync(output, lines([{ type: 'thread.started', thread_id: 'made-up-thread' }, { type: 'turn.completed', usage: { input_tokens: 70_000, cached_input_tokens: 56_000, output_tokens: 800, reasoning_output_tokens: 0 } }]))
    const handle = aHandle('codex', output, { resumed: 'made-up-thread', continues: { run: 'the-run-it-continues', outputPath: earlier } })
    const counted = new CodexAdapter({}).tokensSoFar(handle)
    expect(counted.tokens).toBe(70_000 - 20_000 - (56_000 - 15_000) + (800 - 100))
  })

  it('OpenCode: each step_finish part once, as each step finishes', () => {
    const output = join(scratch, 'opencode-output.jsonl')
    const finished = (id: string, input: number, output: number, read: number, write: number) => ({
      type: 'step_finish',
      sessionID: 'ses_madeup',
      part: { id, type: 'step-finish', tokens: { input, output, reasoning: 0, cache: { read, write } } },
    })
    writeFileSync(output, lines([{ type: 'step_start', sessionID: 'ses_madeup', part: { id: 'prt_0', type: 'step-start' } }, finished('prt_1', 8_000, 30, 20_000, 1_500)]))
    const adapter = new OpenCodeAdapter({})
    const handle = aHandle('opencode', output)
    expect(adapter.tokensSoFar(handle)).toEqual({ tokens: 8_000 + 1_500 + 30, read: countedAs('the output', 'each finished step once') })

    // The same part printed again is counted once.
    appendFileSync(output, lines([finished('prt_1', 8_000, 30, 20_000, 1_500), finished('prt_2', 600, 2_000, 29_000, 0)]))
    expect(adapter.tokensSoFar(handle)).toEqual({ tokens: 8_000 + 1_500 + 30 + 600 + 2_000, read: countedAs('the output', 'each finished step once') })
  })

  it('OpenCode before its first step finishes gives no count', () => {
    const output = join(scratch, 'opencode-started.jsonl')
    writeFileSync(output, lines([{ type: 'step_start', sessionID: 'ses_madeup', part: { id: 'prt_0', type: 'step-start' } }]))
    const counted = new OpenCodeAdapter({}).tokensSoFar(aHandle('opencode', output))
    expect(counted.tokens).toBeNull()
  })

  it("the fake runtime: its tokens lines added up, and its words say runs are not real", () => {
    const output = join(scratch, 'fake-output.jsonl')
    writeFileSync(output, '')
    const adapter = new FakeAdapter(join(scratch, 'no-script.mjs'), {})
    const handle = aHandle('fake', output)
    expect(adapter.tokensSoFar(handle)).toEqual({ tokens: null, why: 'The fake runtime has printed no tokens line.' })

    appendFileSync(output, lines([{ conversation: 'made-up' }, { tokens: { input: 100, cacheWrites: 4_000, cacheReads: 90_000, output: 900 } }]))
    const first = adapter.tokensSoFar(handle)
    expect(first.tokens).toBe(100 + 4_000 + 900)
    expect('read' in first && first.read).toMatch(/Runs are not real\./)

    appendFileSync(output, lines([{ tokens: { input: 5, cacheWrites: 0, cacheReads: 95_000, output: 3_000 } }]))
    expect(adapter.tokensSoFar(handle).tokens).toBe(100 + 4_000 + 900 + 5 + 3_000)
  })
})

describe('a runtime that gives no count while it runs', () => {
  it('Kimi has no reader, so its runs are reminded by time only', () => {
    const kimi: RuntimeAdapter = new KimiAdapter({})
    expect(kimi.tokensSoFar).toBeUndefined()
  })
})
