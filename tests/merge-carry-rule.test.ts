// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VERDICT FOLLOWS FILE CONTENT, AND A SCOPED CHECK IS STARTED WITH ITS SCOPE. Sandbox v1, piece
 * P7: test T6 of SPEC.md section 6, on decision R2.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. `whatChangedSinceTheVerdict`, the one rule of SPEC.md section 5.5: a path whose hash is what
 *      the verdict read keeps its verdict; a path read at other content, or never read, needs one;
 *      a path the entry no longer changes is neither.
 *   2. `A_STEP_IS_TAKEN_FROM` names one non-final state for every step, so no step can be reported
 *      from an end.
 *   3. The message worker starts the check tool with `--only` and `--needs-judgment` exactly as the
 *      office asked, and writes the needs-judgment list where the tool reads it, in the shape
 *      src/config/needs-judgment.mjs reads.
 *
 * MUTATIONS (each after a control run, each restored; the handback records all three runs):
 *   - `whatChangedSinceTheVerdict` answering "kept" for every path: cases 1 go red.
 *   - the `--only` and `--needs-judgment` arguments left off `commandFor`: cases 3 go red.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { A_STEP_IS_TAKEN_FROM, ABSENT, MERGE_STATE_SPECS, MERGE_STEPS, isALineFile, whatChangedSinceTheVerdict } from '../src/shared/merge-queue.ts'
import { readTheNeedsJudgmentList } from '../src/config/needs-judgment.mjs'
import { InspectionAdapter, needsJudgmentFileFor } from '../src/worker/runtimes/inspection.ts'
import { runIsAlive } from '../src/worker/runtimes/common.ts'

const A = 'work/a.txt'
const B = 'work/b.txt'
const C = 'work/c.txt'
const RULES = 'design/rules.md'
const h = (c: string): string => c.repeat(40)

describe('whatChangedSinceTheVerdict: the one rule of decision R2', () => {
  it('keeps a path whose hash is what the verdict read, and asks again about one whose hash differs', () => {
    const judged = { [A]: h('1'), [B]: h('2'), [RULES]: h('3') }
    const now = { [A]: h('9'), [B]: h('2'), [RULES]: h('3') }
    expect(whatChangedSinceTheVerdict(judged, now)).toEqual({ kept: [RULES, B], changed: [A], keptByLine: [] })
  })

  it('asks about a path no verdict read, and says nothing of a path the entry no longer changes', () => {
    const judged = { [A]: h('1'), [B]: h('2') }
    const now = { [A]: h('1'), [C]: h('5') }
    const read = whatChangedSinceTheVerdict(judged, now)
    expect(read.kept).toEqual([A])
    expect(read.changed).toEqual([C])
    expect([...read.kept, ...read.changed]).not.toContain(B)
  })

  it('reads a deletion as content: absent kept where the verdict read absent, changed where it read a file', () => {
    const judged = { [A]: ABSENT, [B]: h('2') }
    const now = { [A]: ABSENT, [B]: ABSENT }
    expect(whatChangedSinceTheVerdict(judged, now)).toEqual({ kept: [A], changed: [B], keptByLine: [] })
  })

  it('answers in sorted path order, and an empty verdict covers nothing', () => {
    expect(whatChangedSinceTheVerdict({}, { [B]: h('2'), [A]: h('1') })).toEqual({ kept: [], changed: [A, B], keptByLine: [] })
    expect(whatChangedSinceTheVerdict({ [A]: h('1') }, {})).toEqual({ kept: [], changed: [], keptByLine: [] })
  })
})

describe('whatChangedSinceTheVerdict with lines: a line file whose own lines held keeps its verdict (the line rule)', () => {
  const EN = 'src/shared/words/en.ts'
  const WAVE = 'src/shared/words/zh-wave-13v.ts'
  it('keeps a judged line file the tool says held, and names it; a code file, an unjudged one or one that did not hold is changed', () => {
    expect(isALineFile(EN) && isALineFile(WAVE)).toBe(true)
    expect(isALineFile(A) || isALineFile('src/shared/words/index.ts') || isALineFile('src/shared/words/en-wave-13v.tsx')).toBe(false)
    const judged = { [EN]: h('1'), [WAVE]: h('2'), [A]: h('3') }
    const now = { [EN]: h('7'), [WAVE]: h('8'), [A]: h('9'), [B]: h('4') }
    const lines = [
      { path: EN, held: true, ranges: 'line 9' },
      { path: WAVE, held: false, why: 'its own lines do not stand unchanged on the joined tree' },
      { path: A, held: true, ranges: 'line 2' },
      { path: B, held: true, ranges: 'line 2' },
    ]
    expect(whatChangedSinceTheVerdict(judged, now, lines)).toEqual({ kept: [EN], changed: [WAVE, A, B], keptByLine: [lines[0]] })
  })
})

describe('A_STEP_IS_TAKEN_FROM: every step is taken from one state that is not an end', () => {
  it('names a state for every step, and none of them is final', () => {
    for (const step of MERGE_STEPS) {
      const from = A_STEP_IS_TAKEN_FROM[step]
      expect(MERGE_STATE_SPECS[from], `${step} is taken from ${from}, which is not a state`).toBeDefined()
      expect(MERGE_STATE_SPECS[from].final, `${step} is taken from ${from}, which is final`).toBe(false)
    }
  })
})

describe('the message worker starts a scoped check with its scope', () => {
  let scratch = ''
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-scoped-check-start-'))
  })
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  const request = (outputPath: string) => ({
    session: 'a-check-session',
    agent: 'inspector-one',
    prompt: '',
    cwd: scratch,
    api: 'http://127.0.0.1:1',
    workspace: 'default',
    outputPath,
  })

  it('puts --only and --needs-judgment on the command line exactly as the office asked, and not otherwise', () => {
    const env = { PATH: process.env['PATH'] ?? '', MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' }
    const scoped = new InspectionAdapter({ run: 'the-run', checkout: '/a/checkout', only: [A, RULES], needsJudgment: [{ path: RULES, why: 'protected' }] }, env)
    const out = join(scratch, 'scoped', 'said.txt')
    const args = scoped.commandFor(request(out)).args
    const onlyAt = args.indexOf('--only')
    expect(onlyAt).toBeGreaterThan(0)
    expect(args.slice(onlyAt + 1, onlyAt + 3)).toEqual([A, RULES])
    expect(args.slice(args.indexOf('--needs-judgment') + 1)).toEqual([needsJudgmentFileFor({ outputPath: out })])
    expect(needsJudgmentFileFor({ outputPath: out })).toBe(join(scratch, 'scoped', 'needs-judgment.json'))

    const whole = new InspectionAdapter({ run: 'the-run', checkout: '/a/checkout' }, env)
    const plain = whole.commandFor(request(join(scratch, 'whole', 'said.txt'))).args
    expect(plain).not.toContain('--only')
    expect(plain).not.toContain('--needs-judgment')
  })

  it('writes the needs-judgment list where the tool reads it, in the shape the one reader reads', async () => {
    const tool = join(scratch, 'a-stand-in-tool.mjs')
    writeFileSync(tool, '// A STAND-IN FOR THE CHECK TOOL, written by a test. It does nothing and exits 0.\nprocess.exit(0)\n')
    const env = { PATH: process.env['PATH'] ?? '', MOLE_OFFICE_FAKE_INSPECTION_TOOL: tool, MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' }
    const adapter = new InspectionAdapter({ run: 'the-run', checkout: scratch, only: [RULES], needsJudgment: [{ path: RULES, why: 'A protected path that is not a generated file.' }] }, env)
    const out = join(scratch, 'started', 'said.txt')
    const handle = adapter.start(request(out))
    const until = Date.now() + 10_000
    while (runIsAlive(handle) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runIsAlive(handle), 'the stand-in tool did not end').toBe(false)
    const written = JSON.parse(readFileSync(needsJudgmentFileFor({ outputPath: out }), 'utf8')) as unknown
    expect(readTheNeedsJudgmentList(written).list).toEqual([{ path: RULES, why: 'A protected path that is not a generated file.' }])
  })
})
