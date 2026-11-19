// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY RUN RECORDS THE MODEL IT WAS SERVED, READ FROM THE RUNTIME'S OWN RECORD OF THE RUN. HB1 of
 * design/honour-board/ACCEPTANCE.md, in wave 13s round 36.
 *
 * Wave 13u found `served.model` on none of 136 runs. These are the readings each runner now makes at a run's end:
 * a Codex rollout's turn_context lines, an `opencode export`, Kimi's nothing, the fake runtime's own name, and the
 * check tool's Claude Code envelope. The runners writing the reading onto the run's record are proved in
 * tests/the-worker-delivers-a-message.test.ts (the message worker), tests/sandbox-launcher.test.ts (the sandbox launcher's
 * Codex run) and tests/a-builder-run-carries-its-usage-receipt.test.ts (tools/agent-worker.mjs).
 *
 * Every rollout, export and envelope here is synthetic, written to the shapes read from Codex 0.159.2's rollouts and
 * OpenCode 1.18.31's export command.
 *
 * MUTATIONS, each after a control run; each turned the case named red and was put back (round 36):
 *   1. theModelsInACodexRollout ignores the start (`at < sinceMs` → `false`): the earlier turn's model is counted.
 *   2. aServed keeps duplicates (`new Set(models.filter(…))` → `models.filter(…)`): one model is written twice.
 *   3. theOpenCodeExportSays reads user messages too (`!== 'assistant'` → `=== 'nobody'`): the user's model is counted.
 *   4. theServedOfACodexRun reads a start that is not a moment: every turn of the thread is counted.
 *   5. FakeAdapter.servedOf ignores the envelope: the fake run's model is "not reported".
 *   6. The worker leaves `served` off the run's ending (src/worker/index.ts): red in the-worker-delivers-a-message.
 *   7. tools/sandbox-start.mjs writes `served` for claude-code runs only: red in sandbox-launcher's Codex served case.
 *   8. tools/agent-worker.mjs leaves `served` off the run's record: red in a-builder-run-carries-its-usage-receipt.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { NOT_REPORTED } from '../src/config/claude-code-served.mjs'
import { CLAUDE_USAGE_LINE, INSPECTION_USAGE_LINE, inspectionUsageLine } from '../src/config/usage.mjs'
import {
  aServed,
  theModelsInACodexRollout,
  theOpenCodeExportSays,
  theServedOfACodexRun,
  theServedOfAKimiRun,
  theServedOfAnOpenCodeRun,
} from '../src/config/runtime-served.mjs'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'
import { InspectionAdapter } from '../src/worker/runtimes/inspection.ts'
import type { RunHandle, RuntimeAdapter } from '../src/worker/runtimes/adapter.ts'

const scratch = mkdtempSync(join(tmpdir(), 'served-readings-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const THREAD = '019a0000-1111-7222-8333-444455556666'
const START = '2026-10-11T10:00:00.000Z'

/** A synthetic rollout: a turn before the run began, then two turns of the run on two models, then a repeat. */
function aRollout(): string {
  const line = (timestamp: string, type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp, type, payload })
  return [
    line('2026-10-11T09:00:00.000Z', 'session_meta', { id: THREAD }),
    line('2026-10-11T09:00:01.000Z', 'turn_context', { model: 'earlier-model', cwd: '/w' }),
    line('2026-10-11T10:00:02.000Z', 'turn_context', { model: 'gpt-6-luna', cwd: '/w' }),
    line('2026-10-11T10:00:03.000Z', 'event_msg', { type: 'token_count' }),
    line('2026-10-11T10:00:04.000Z', 'turn_context', { model: 'gpt-6.1-sol', cwd: '/w' }),
    line('2026-10-11T10:00:05.000Z', 'turn_context', { model: 'gpt-6-luna', cwd: '/w' }),
    'not json',
  ].join('\n')
}

describe('the Served shape', () => {
  it('keeps each distinct model once, in the order it first answered, and says "not reported" for the rest', () => {
    expect(aServed(['a', 'b', 'a', ''])).toEqual({
      model: 'a, b',
      temperature: NOT_REPORTED,
      briefBytes: NOT_REPORTED,
      contextTokens: { largestTurn: NOT_REPORTED, total: NOT_REPORTED },
    })
    expect(aServed([]).model).toBe(NOT_REPORTED)
    expect(aServed(['m'], [10, 30]).contextTokens).toEqual({ largestTurn: 30, total: 40 })
  })
})

describe('a Codex run', () => {
  const home = join(scratch, 'codex-home')
  mkdirSync(join(home, 'sessions', '2026', '10', '11'), { recursive: true })
  writeFileSync(join(home, 'sessions', '2026', '10', '11', `rollout-2026-10-11T09-00-00-${THREAD}.jsonl`), aRollout())

  it("reads the models from the rollout's turns since the run began, and not the thread's earlier turns", () => {
    expect(theModelsInACodexRollout(aRollout(), Date.parse(START))).toEqual(['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-luna'])
    const read = theServedOfACodexRun({ thread: THREAD, env: { CODEX_HOME: home }, sinceMs: Date.parse(START) })
    expect(read.served.model).toBe('gpt-6-luna, gpt-6.1-sol')
    expect(read.served.temperature).toBe(NOT_REPORTED)
    expect(read.said).toContain('3 turns')
  })

  it('finds the rollout under HOME/.codex when CODEX_HOME is not set', () => {
    const asHome = join(scratch, 'a-home')
    mkdirSync(join(asHome, '.codex', 'sessions'), { recursive: true })
    writeFileSync(join(asHome, '.codex', 'sessions', `rollout-x-${THREAD}.jsonl`), aRollout())
    expect(theServedOfACodexRun({ thread: THREAD, env: { HOME: asHome }, sinceMs: Date.parse(START) }).served.model).toBe('gpt-6-luna, gpt-6.1-sol')
  })

  it('says "not reported", and why, when there is no thread, no rollout, or no moment to count from', () => {
    for (const [run, why] of [
      [{ thread: null, env: { CODEX_HOME: home }, sinceMs: Date.parse(START) }, 'named no Codex thread'],
      [{ thread: 'no-such-thread', env: { CODEX_HOME: home }, sinceMs: Date.parse(START) }, 'No rollout'],
      [{ thread: THREAD, env: {}, sinceMs: Date.parse(START) }, 'Neither CODEX_HOME nor HOME'],
      [{ thread: THREAD, env: { CODEX_HOME: home }, sinceMs: Number.NaN }, 'not a moment'],
      [{ thread: THREAD, env: { CODEX_HOME: home }, sinceMs: Date.parse('2026-10-11T11:00:00Z') }, 'no turn_context'],
    ] as const) {
      const read = theServedOfACodexRun(run)
      expect(read.served.model, why).toBe(NOT_REPORTED)
      expect(read.said).toContain(why)
    }
  })
})

describe('an OpenCode run', () => {
  const anExport = JSON.stringify({
    info: { id: 'ses_1' },
    messages: [
      { info: { role: 'user', providerID: 'nobody', modelID: 'the-users-choice' }, parts: [] },
      { info: { role: 'assistant', providerID: 'anthropic', modelID: 'claude-x', tokens: { input: 100, output: 5, cache: { read: 900, write: 0 } } }, parts: [] },
      { info: { role: 'assistant', providerID: 'anthropic', modelID: 'claude-x', tokens: { input: 50, output: 5, cache: { read: 1000, write: 10 } } }, parts: [] },
    ],
  })

  it("reads the assistant messages' provider and model, and what each was sent", () => {
    expect(theOpenCodeExportSays('Exporting session: ses_1\n' + anExport)).toEqual({ models: ['anthropic/claude-x', 'anthropic/claude-x'], inputs: [1000, 1060] })
    expect(theOpenCodeExportSays('no export here')).toBeNull()
  })

  it('runs `opencode export` on the run\'s session and writes what it says', () => {
    const program = join(scratch, 'opencode')
    writeFileSync(join(scratch, 'export.json'), anExport)
    writeFileSync(program, `#!/bin/sh\n[ "$1" = export ] && [ "$2" = ses_1 ] || { echo "asked $*" >&2; exit 3; }\ncat '${join(scratch, 'export.json')}'\n`)
    chmodSync(program, 0o755)
    const read = theServedOfAnOpenCodeRun({ session: 'ses_1', command: program, env: { PATH: '/usr/bin:/bin' } })
    expect(read.served).toEqual({ model: 'anthropic/claude-x', temperature: NOT_REPORTED, briefBytes: NOT_REPORTED, contextTokens: { largestTurn: 1060, total: 2060 } })
    const refused = theServedOfAnOpenCodeRun({ session: 'ses_other', command: program, env: { PATH: '/usr/bin:/bin' } })
    expect(refused.served.model).toBe(NOT_REPORTED)
    expect(refused.said).toContain('exited with 3')
    expect(theServedOfAnOpenCodeRun({ session: null, command: program, env: {} }).said).toContain('named no OpenCode session')
  })
})

describe('a Kimi run', () => {
  it('says nothing names the model', () => {
    const read = theServedOfAKimiRun()
    expect(read.served.model).toBe(NOT_REPORTED)
    expect(read.said).toContain('names no model')
  })
})

describe("the worker's other runtimes", () => {
  function servedFrom(adapter: RuntimeAdapter, said: string) {
    const outputPath = join(scratch, `out-${adapter.runtime}`)
    writeFileSync(outputPath, said)
    const handle: RunHandle = { runtime: adapter.runtime, pid: 0, pgid: 0, startedAt: '2026-10-11 10:00:00', providerSession: null, outputPath }
    return adapter.servedOf(handle)
  }

  it('the fake runtime is served by itself, and says so', () => {
    const read = servedFrom(new FakeAdapter('fake-runtime.mjs', {}), JSON.stringify({ reply: 'ok', conversation: 'fake-1', model: 'fake-runtime' }) + '\n')
    expect(read.served.model).toBe('fake-runtime')
    expect(servedFrom(new FakeAdapter('fake-runtime.mjs', {}), '{"reply":"ok"}\n').served.model).toBe(NOT_REPORTED)
  })

  it("the check tool's run is served by the models its Claude Code envelope names", () => {
    const envelope = JSON.stringify({ type: 'result', model: 'claude-y', modelUsage: { 'claude-y': {}, 'claude-z': {} } })
    expect(servedFrom(new InspectionAdapter({ run: 'a-check', checkout: null }, {}), `checking\n${CLAUDE_USAGE_LINE}${envelope}\ndone\n`).served.model).toBe('claude-y, claude-z')
    const none = servedFrom(new InspectionAdapter({ run: 'a-check', checkout: null }, {}), 'checked without a model\n')
    expect(none.served.model).toBe(NOT_REPORTED)
    expect(none.said).toContain('printed no model envelope')
  })

  it('reads a Claude result from the runtime-labelled inspection line', () => {
    const output = JSON.stringify({ type: 'result', model: 'claude-synthetic', modelUsage: { 'claude-synthetic': {} } })
    const read = servedFrom(new InspectionAdapter({ run: 'synthetic-check', checkout: null }, {}), inspectionUsageLine('claude-code', output))
    expect(read.served.model).toBe('claude-synthetic')
  })

  it('keeps the Codex served model unreported when its native events name none', () => {
    const events = '{"type":"thread.started","thread_id":"synthetic-thread"}\n{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":1}}'
    const read = servedFrom(new InspectionAdapter({ run: 'synthetic-check', checkout: null, model: 'gpt-6.1-sol' }, {}), inspectionUsageLine('codex', events))
    expect(read.served.model).toBe(NOT_REPORTED)
    expect(read.said).toContain('Codex JSON events named no model')
  })

  it.each([
    JSON.stringify({ type: 'text', sessionID: 'ses_Synthetic', part: { type: 'text', text: 'Synthetic answer', time: { end: 1 } } }),
    '', 'Synthetic malformed output',
  ])('keeps OpenCode inspection served model unreported without reading output %s as Claude', events => {
    const read = servedFrom(new InspectionAdapter({ run: 'synthetic-check', checkout: null, model: 'opencode-go/deepseek-v4.1-flash' }, {}), inspectionUsageLine('opencode', events))
    expect(read.served.model).toBe(NOT_REPORTED)
    expect(read.said).toBe("The model served by this OpenCode check is not reported.")
  })

  it('reports a broken inspection line without substituting an older Claude result', () => {
    const old = CLAUDE_USAGE_LINE + JSON.stringify({ type: 'result', model: 'claude-synthetic' })
    const read = servedFrom(new InspectionAdapter({ run: 'synthetic-check', checkout: null }, {}), old + '\n' + INSPECTION_USAGE_LINE + '{broken')
    expect(read.served.model).toBe(NOT_REPORTED)
    expect(read.said).toContain('not JSON')
  })
})
