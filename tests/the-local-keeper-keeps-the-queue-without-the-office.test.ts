// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOCAL KEEPER KEEPS ONE PROJECT'S MERGE QUEUE IN A FILE, WITH NO OFFICE.
 *
 * What this file proves. The local keeper puts one project's queue under
 * ~/.cache/merge-tool/<repository hash>/, writes it whole, and reads it back in the order the entries
 * were added. It refuses a duplicate id, a state it does not know, a step it does not know, a step
 * from the wrong state, a record-resting step it has no records for, and a seat another live process
 * holds. It takes the suite seat with an exclusive lock file, takes over a stale one, and refuses one
 * it cannot read. It moves an entry with the same `theMoveAStepMakes` table the office's state
 * machine calls, stores the attempts and tool-run counts, and applies the three local moves the keeper
 * can decide without records: a pinned submitted entry is judged at once, a judged entry takes its
 * lane for integrating, and an integrated one is testing at once.
 *
 * The fixture is synthetic. Every repository path, home and work folder is made under the system
 * temporary directory and removed after; no real office, browser or network is used. The only server
 * is the stand-in this file starts on 127.0.0.1, which holds one entry in memory and applies the
 * same shared `theMoveAStepMakes` table the real state machine calls first. The real doors are
 * proved in tests/the-queue-moves-that-need-no-record.test.ts and
 * tests/merge-state-machine.test.ts. This file compares the two keeper clients, so a copied move in
 * the local keeper goes red.
 *
 * The red-before-code run (before tools/merge-tool/local-keeper.mjs existed) is
 * out/r196-local-keeper/red-before-the-module.log: it exited 1 and failed at the import of this file,
 * which is the red run chapter 5 rule 1 asks for.
 *
 * Mutation proof, 2026-11-10. The control run (the green run on the finished module) is
 * out/r196-local-keeper/control-green.log: exit 0, 31 passed. I replaced the `theMoveAStepMakes` call in `step` with a copied conflict move
 * (`{ move: 'to', state: 'resolving' }`); out/r196-local-keeper/mutation-red.log has that run: exit
 * 1, 21 cases failed and 10 passed. I restored the line byte for byte (the file's sha256 was again
 * 2dc69b2c53c8354b1aa7f07e7957af67773e8b054210e7687450ac508bf528eb at that time) and
 * out/r196-local-keeper/restore-green.log has the restore run: exit 0, 31 passed.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { gateNamed } from '../src/config/gates.mjs'
import {
  A_TOOL_RUN_ENDED,
  MERGE_STATES,
  theMoveAStepMakes,
  type MergeState,
  type MergeStep,
  type WhatHappenedToAnEntry,
} from '../src/shared/merge-queue.ts'
import { localStamp } from '../src/shared/time.ts'
import { openTheLocalKeeper, theLocalKeepersPlace } from '../tools/merge-tool/local-keeper.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LANDING_ATTEMPTS = Number(gateNamed('landing-attempts').defaults.ordinary)
const TOOL_RUNS = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)

const folders: string[] = []
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

/** A made-up folder under the system temporary folder, removed after the file. */
function aFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), `mole-office-local-keeper-${name}-`))
  folders.push(folder)
  return folder
}

/** The queue as this file's own setup writes it, so a case can start an entry in any state. */
function putAnEntry(queueFile: string, repository: string, entries: Record<string, unknown>[]): void {
  writeFileSync(queueFile, `${JSON.stringify({ version: 1, repository: resolve(repository), entries }, null, 2)}\n`)
}

/** One entry for a case, with the counts a step needs. */
function anEntry(id: string, state: MergeState, repository: string, counts: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, state, lane: resolve(repository), submittedAt: localStamp(new Date()), ...counts }
}

/** The sentence a refusal said, or a failure when the keeper accepted what it had to refuse. */
function theRefusal(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('The local keeper accepted what it had to refuse.')
}

/** What the shared table says the state becomes, for a case that must be an evidence-free move. */
function theExpectedState(state: MergeState, step: MergeStep, facts: Record<string, unknown>, attempts?: number): MergeState {
  const happened = {
    ...facts,
    step,
    ...(step === 'main-moved' || step === 'main-moved-while-testing' ? { attempts: attempts ?? 0 } : {}),
  } as WhatHappenedToAnEntry
  const move = theMoveAStepMakes(state, happened)
  if (move.move === 'to') return move.state
  if (move.move === 'bounce') return 'bounced'
  if (move.move === 'stays') return state
  throw new Error(`The table answered ${move.move} for ${step} from ${state}; this case expects an evidence-free move.`)
}

const CASES: readonly { state: MergeState; step: MergeStep; facts: Record<string, unknown>; attempts?: number }[] = [
  { state: 'integrating', step: 'conflict', facts: {} },
  { state: 'integrating', step: 'guard-failed', facts: {} },
  { state: 'testing', step: 'tested', facts: { green: true } },
  { state: 'testing', step: 'tested', facts: { green: false } },
  { state: 'testing', step: 'tested', facts: { green: true, flakyAtBlock: true } },
  { state: 'testing', step: 'tested', facts: { green: false, onlyHouseRulesRed: true } },
  { state: 'testing', step: 'landing', facts: {} },
  { state: 'landing', step: 'landed', facts: {} },
  { state: 'landing', step: 'main-moved', facts: { mainAt: 'a-main' }, attempts: 0 },
  { state: 'testing', step: 'main-moved-while-testing', facts: { mainAt: 'a-main' }, attempts: 0 },
  { state: 'landing', step: 'main-moved', facts: { mainAt: 'a-main' }, attempts: LANDING_ATTEMPTS },
  { state: 'testing', step: 'no-room-to-test', facts: { says: 'the launcher had no room' } },
  { state: 'integrating', step: 'no-room-to-integrate', facts: { says: 'the launcher had no room' } },
  { state: 'testing', step: 'red-on-main', facts: { files: ['a-made-up-test.ts'] } },
]

describe("the local keeper's place", () => {
  it('gives two repositories two folders under the test home, and the same path the same folder', () => {
    const home = aFolder('place')
    const one = theLocalKeepersPlace(join(home, 'projects', 'one'), { home })
    const two = theLocalKeepersPlace(join(home, 'projects', 'two'), { home })
    const oneAgain = theLocalKeepersPlace(join(home, 'projects', 'one'), { home })

    expect(one.folder).toBe(oneAgain.folder)
    expect(one.folder).not.toBe(two.folder)
    expect(one.folder.startsWith(join(home, '.cache', 'merge-tool'))).toBe(true)
    expect(one.folder.split(/[/\\]/u).pop()).toMatch(/^[0-9a-f]{16}$/u)
    expect(one.queueFile).toBe(join(one.folder, 'queue.json'))
    expect(one.seatFile).toBe(join(one.folder, 'the-suite-seat.lock'))
    expect(one.toolRunsFile).toBe(join(one.folder, 'tool-runs.jsonl'))
  })

  it('makes the folder only when a keeper is opened, never at import or when the place is asked for', () => {
    const home = aFolder('opened')
    const place = theLocalKeepersPlace(join(home, 'project'), { home })
    expect(existsSync(place.folder)).toBe(false)
    openTheLocalKeeper({ repository: join(home, 'project'), home })
    expect(existsSync(place.folder)).toBe(true)
  })
})

describe("the local keeper's queue file", () => {
  it('keeps two entries in order for a second keeper, and refuses a duplicate, an unknown state and a missing id', () => {
    const home = aFolder('queue')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    const first = keeper.addAnEntry({ id: 'first', title: 'The first entry' })
    const second = keeper.addAnEntry({ id: 'second', title: 'The second entry', state: 'judged' })

    expect(first.state).toBe('submitted')
    expect(first.lane).toBe(resolve(repository))
    expect(second.state).toBe('judged')

    const again = openTheLocalKeeper({ repository, home })
    expect(again.entries().map((entry: { id: string }) => entry.id)).toEqual(['first', 'second'])

    const queue = JSON.parse(readFileSync(again.place.queueFile, 'utf8')) as { version: number; repository: string; entries: unknown[] }
    expect(queue.version).toBe(1)
    expect(queue.repository).toBe(resolve(repository))
    expect(queue.entries).toHaveLength(2)

    expect(theRefusal(() => keeper.addAnEntry({ id: 'first' }))).toContain('first')

    const invented = 'not-a-state-the-queue-has'
    expect(MERGE_STATES).not.toContain(invented)
    expect(theRefusal(() => keeper.addAnEntry({ id: 'third', state: invented }))).toContain(invented)

    expect(theRefusal(() => keeper.readEntry('no-such-entry'))).toContain('no-such-entry')

    const moved = keeper.step('first', 'pinned')
    expect(moved.state).toBe('judged')
    expect(openTheLocalKeeper({ repository, home }).readEntry('first').state).toBe('judged')
  })

  it('returns copies, so changing one answer does not change the queue', () => {
    const home = aFolder('copies')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'one', title: 'One' })

    const read = keeper.readEntry('one') as { title: string }
    read.title = 'changed by a caller'
    expect(keeper.readEntry('one').title).toBe('One')

    const all = keeper.entries() as { title: string }[]
    all[0]!.title = 'changed again'
    expect(keeper.entries()[0]!.title).toBe('One')
  })

  it('reads one lane in the queue order, and narrows it to the states asked for', () => {
    const home = aFolder('lane')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'first', state: 'judged' })
    keeper.addAnEntry({ id: 'second', state: 'testing' })
    keeper.addAnEntry({ id: 'elsewhere', state: 'testing', lane: 'another-lane' })

    expect((keeper.theLane() as { id: string }[]).map((entry) => entry.id)).toEqual(['first', 'second'])
    expect((keeper.theLane(resolve(repository), ['testing']) as { id: string }[]).map((entry) => entry.id)).toEqual(['second'])
    expect((keeper.theLane('another-lane') as { id: string }[]).map((entry) => entry.id)).toEqual(['elsewhere'])
  })
})

let base = ''

describe('the same evidence-free steps through both keepers', () => {
  let standIn: { base: string; stop: () => Promise<void> }

  beforeAll(async () => {
    standIn = await startTheStandIn(aFolder('stand-in'))
    base = standIn.base
  })

  afterAll(async () => {
    await standIn.stop()
  })

  for (const one of CASES) {
    it(`"${one.step}" from ${one.state} gives the office keeper, the local keeper and the table the same state`, async () => {
      const held = { id: 'entry-a', state: one.state, ...(one.attempts === undefined ? {} : { attempts: one.attempts }) }
      const answered = await fetch(`${base}/__hold`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entry: held }),
      })
      expect(answered.status).toBe(200)

      const facts = one.attempts === undefined ? one.facts : { ...one.facts, attempts: 999 }
      const expected = theExpectedState(one.state, one.step, one.facts, one.attempts)

      const folder = aFolder(`compare-${one.step}-${one.state}`)
      const script = theChildScript(folder)
      const workdir = join(folder, 'workdir')
      mkdirSync(workdir, { recursive: true })
      const throughTheOffice = runTheChild(script, workdir, one.step, facts)

      const repository = join(folder, 'project')
      const keeper = openTheLocalKeeper({ repository, home: folder })
      putAnEntry(keeper.place.queueFile, repository, [anEntry('entry-local', one.state, repository, one.attempts === undefined ? {} : { attempts: one.attempts })])
      const throughTheFile = keeper.step('entry-local', one.step, facts).state

      expect(throughTheOffice, `the office keeper's state for ${one.step} from ${one.state}`).toBe(expected)
      expect(throughTheFile, `the local keeper's state for ${one.step} from ${one.state}`).toBe(expected)
      expect(throughTheFile).toBe(throughTheOffice)
    })
  }
})

describe('a step from the wrong state', () => {
  it('refuses judged + tested, names testing, and writes nothing', () => {
    const home = aFolder('wrong-state')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'judged-one', state: 'judged' })
    const before = readFileSync(keeper.place.queueFile, 'utf8')

    const said = theRefusal(() => keeper.step('judged-one', 'tested', { green: true }))

    expect(said).toContain('testing')
    expect(keeper.readEntry('judged-one').state).toBe('judged')
    expect(readFileSync(keeper.place.queueFile, 'utf8')).toBe(before)
  })
})

describe('the other refusals', () => {
  it('refuses a step it does not know, and a step whose fact is missing, and writes nothing', () => {
    const home = aFolder('refusals')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'checking', state: 'testing' })
    const before = readFileSync(keeper.place.queueFile, 'utf8')

    const unknown = theRefusal(() => keeper.step('checking', 'not-a-step'))
    expect(unknown).toContain('not-a-step')
    expect(readFileSync(keeper.place.queueFile, 'utf8')).toBe(before)

    const missing = theRefusal(() => keeper.step('checking', 'tested'))
    expect(missing).toContain('green')
    expect(readFileSync(keeper.place.queueFile, 'utf8')).toBe(before)
  })

  it('refuses integrating while another entry holds the lane, naming it and its state, and writes nothing', () => {
    const home = aFolder('lane-held')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'holding', state: 'testing', lane: 'the-one-lane' })
    keeper.addAnEntry({ id: 'next', state: 'judged', lane: 'the-one-lane' })
    const before = readFileSync(keeper.place.queueFile, 'utf8')

    const said = theRefusal(() => keeper.step('next', 'integrating'))

    expect(said).toContain('holding')
    expect(said).toContain('testing')
    expect(keeper.readEntry('next').state).toBe('judged')
    expect(readFileSync(keeper.place.queueFile, 'utf8')).toBe(before)
  })

  it('records a tool end where the tool does not act and moves nothing', () => {
    const home = aFolder('tool-end-pinned')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'waiting', state: 'pinned' })

    const ended = keeper.toolEnded('waiting', { session: 'run-four', reason: 'the tool stopped' })

    expect(ended.state).toBe('pinned')
    expect((ended.tool as { reason: string }).reason).toBe('the tool stopped')
    expect(ended.runs).toBeUndefined()
  })

  it('leaves a judged entry judged with its run count unchanged while another entry holds the lane', () => {
    const home = aFolder('tool-end-lane-held')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    putAnEntry(keeper.place.queueFile, repository, [
      { ...anEntry('holding', 'integrating', repository), lane: 'the-one-lane' },
      { ...anEntry('waiting', 'judged', repository, { runs: 2 }), lane: 'the-one-lane' },
    ])

    const ended = keeper.toolEnded('waiting', { session: 'run-five', reason: 'the tool stopped' })

    expect(ended.state).toBe('judged')
    expect(ended.runs).toBe(2)
    expect((ended.stalls as { runs: number }).runs).toBe(2)
    expect((ended.stalls as { says: string }).says).toContain('holding')
    expect((ended.bounced as { reason?: string } | undefined)?.reason).toBeUndefined()
  })
})

describe('the counts', () => {
  it('stores main-moved attempts on the entry, and the next main-moved step uses the stored count, not the facts', () => {
    const home = aFolder('attempts')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    putAnEntry(keeper.place.queueFile, repository, [anEntry('moving', 'landing', repository, { attempts: 0 })])

    const first = keeper.step('moving', 'main-moved', { mainAt: 'a-main', attempts: 999 })
    expect(first.state).toBe('judged')
    expect(first.attempts).toBe(1)

    putAnEntry(keeper.place.queueFile, repository, [anEntry('moving', 'landing', repository, { attempts: 0, tested: { green: true } })])
    const dropped = keeper.step('moving', 'main-moved', { mainAt: 'a-main' })
    expect(dropped.state).toBe('judged')
    expect(dropped).not.toHaveProperty('tested')

    putAnEntry(keeper.place.queueFile, repository, [{ ...first, state: 'landing' }])
    const next = keeper.step('moving', 'main-moved', { mainAt: 'another-main', attempts: 999 })
    expect(next.state).toBe('judged')
    expect(next.attempts).toBe(2)
  })

  it('bounces as churn at the landing limit, and stores the count', () => {
    const home = aFolder('attempts-limit')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    putAnEntry(keeper.place.queueFile, repository, [anEntry('moving', 'landing', repository, { attempts: LANDING_ATTEMPTS })])

    const bounced = keeper.step('moving', 'main-moved', { mainAt: 'a-main' })
    expect(bounced.state).toBe('bounced')
    expect(bounced.attempts).toBe(LANDING_ATTEMPTS + 1)
    expect((bounced.bounced as { reason: string }).reason).toBe('churn')
  })

  it('records a tool start and end, and below the tool-run limit leaves the entry where it is with runs one higher', () => {
    const home = aFolder('tool-runs-below')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    putAnEntry(keeper.place.queueFile, repository, [anEntry('ending', 'testing', repository, { runs: 0 })])

    const started = keeper.toolStarted('ending', { session: 'run-one' })
    expect(started.state).toBe('testing')
    expect((started.tool as { session: string }).session).toBe('run-one')
    expect(typeof (started.tool as { startedAt: string }).startedAt).toBe('string')

    const ended = keeper.toolEnded('ending', { session: 'run-one', reason: 'the tool stopped' })
    expect(ended.state).toBe('testing')
    expect(ended.runs).toBe(1)
    expect((ended.tool as { startedAt: string }).startedAt).toBe((started.tool as { startedAt: string }).startedAt)
    expect((ended.tool as { reason: string }).reason).toBe('the tool stopped')
    expect(typeof (ended.tool as { endedAt: string }).endedAt).toBe('string')
  })

  it('at the tool-run limit bounces a testing entry as stalled and leaves a landing entry in landing for a person', () => {
    const home = aFolder('tool-runs-limit')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    putAnEntry(keeper.place.queueFile, repository, [
      anEntry('stalling', 'testing', repository, { runs: TOOL_RUNS - 1 }),
      anEntry('landing', 'landing', repository, { runs: TOOL_RUNS - 1 }),
    ])

    const stalled = keeper.toolEnded('stalling', { session: 'run-two', reason: 'the tool stopped' })
    expect(stalled.state).toBe('bounced')
    expect(stalled.runs).toBe(TOOL_RUNS)
    expect((stalled.bounced as { reason: string }).reason).toBe('stalled')

    const left = keeper.toolEnded('landing', { session: 'run-three', reason: 'the tool stopped' })
    expect(left.state).toBe('landing')
    expect(left.runs).toBe(TOOL_RUNS)
    expect((left.stayed as { because: string }).because).toBe('a-person-must-look')
  })
})

describe('the local rules', () => {
  it('moves pinned to judged, judged to integrating, and integrated to testing without waiting for a record', () => {
    const home = aFolder('local-rules')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'pinning', state: 'submitted' })
    keeper.addAnEntry({ id: 'judged-to-integrate', state: 'judged' })

    expect(keeper.step('pinning', 'pinned').state).toBe('judged')
    expect(keeper.step('judged-to-integrate', 'integrating').state).toBe('integrating')

    keeper.addAnEntry({ id: 'integrating', state: 'integrating' })
    expect(keeper.step('integrating', 'integrated').state).toBe('testing')
  })

  it('refuses a record-resting step it has no records for, naming the step, and writes nothing', () => {
    const home = aFolder('no-records')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })
    keeper.addAnEntry({ id: 'checking', state: 'testing' })
    const before = readFileSync(keeper.place.queueFile, 'utf8')

    const said = theRefusal(() => keeper.step('checking', 'resolution-checked', {}))

    expect(said).toContain('local keeper has no records')
    expect(said).toContain('resolution-checked')
    expect(keeper.readEntry('checking').state).toBe('testing')
    expect(readFileSync(keeper.place.queueFile, 'utf8')).toBe(before)
  })
})

describe('the suite seat', () => {
  it('lets one keeper take it, refuses a second with the holder named, and lets the second in after the first releases it', () => {
    const home = aFolder('seat')
    const repository = join(home, 'project')
    const first = openTheLocalKeeper({ repository, home })
    const second = openTheLocalKeeper({ repository, home })

    expect(first.takeTheSeat({ session: 'first-run' })).toEqual({ seat: true, file: first.place.seatFile })
    const holder = first.seatHolder()
    expect(holder?.file).toBe(first.place.seatFile)
    expect((holder?.holder as { session: string }).session).toBe('first-run')
    expect((holder?.holder as { pid: number }).pid).toBe(process.pid)

    const refused = second.takeTheSeat({ session: 'second-run' })
    expect(refused.seat).toBe(false)
    expect(String((refused as { says: string }).says)).toContain('first-run')

    expect(first.releaseTheSeat()).toEqual({ released: true })
    expect(second.takeTheSeat({ session: 'second-run' })).toEqual({ seat: true, file: second.place.seatFile })
    expect(second.releaseTheSeat()).toEqual({ released: true })
  })

  it('takes over a stale lock, refuses a lock it cannot read, and removes only its own lock', () => {
    const home = aFolder('seat-stale')
    const repository = join(home, 'project')
    const keeper = openTheLocalKeeper({ repository, home })

    writeFileSync(keeper.place.seatFile, `${JSON.stringify({ session: 'stale-run', pid: 999999, startedAt: localStamp(new Date(0)), at: localStamp(new Date()) }, null, 2)}\n`)
    expect(keeper.takeTheSeat({ session: 'after-stale' })).toEqual({ seat: true, file: keeper.place.seatFile })
    expect(keeper.releaseTheSeat()).toEqual({ released: true })

    writeFileSync(keeper.place.seatFile, 'this is not a seat lock\n')
    const refused = keeper.takeTheSeat({ session: 'cannot-read' })
    expect(refused.seat).toBe(false)
    expect(String((refused as { says: string }).says)).toContain(keeper.place.seatFile)
    expect(readFileSync(keeper.place.seatFile, 'utf8')).toBe('this is not a seat lock\n')

    writeFileSync(keeper.place.seatFile, `${JSON.stringify({ session: 'somebody-else', pid: 999998, startedAt: localStamp(new Date(0)), at: localStamp(new Date()) }, null, 2)}\n`)
    const notMine = keeper.releaseTheSeat()
    expect(notMine.released).toBe(false)
    expect(String((notMine as { says: string }).says)).toContain('999998')
    expect(existsSync(keeper.place.seatFile)).toBe(true)
  })
})

/**
 * THE STAND-IN OFFICE'S SOURCE. It runs as a process of its own, so `spawnSync` in the test process
 * cannot block the server that has to answer the child it waits for. It holds one entry in memory,
 * applies the same shared table the real state machine calls first, and prints READY with its port.
 */
function theStandInSource(): string {
  const queue = pathToFileURL(join(ROOT, 'src', 'shared', 'merge-queue.ts')).href
  return (
    [
      "import { createServer } from 'node:http'",
      `import { theMoveAStepMakes } from ${JSON.stringify(queue)}`,
      '',
      "let held = { id: 'entry-a', state: 'submitted' }",
      'const server = createServer((request, response) => {',
      "  const url = new URL(request.url ?? '/', 'http://127.0.0.1')",
      '  const reply = (status, body) => {',
      "    response.writeHead(status, { 'content-type': 'application/json' })",
      '    response.end(JSON.stringify(body))',
      '  }',
      "  if (request.method === 'POST' && url.pathname === '/__hold') {",
      "    let text = ''",
      "    request.setEncoding('utf8')",
      "    request.on('data', (chunk) => { text += chunk })",
      "    request.on('end', () => { held = JSON.parse(text).entry; reply(200, { held }) })",
      '    return',
      '  }',
      "  if (request.method === 'GET' && url.pathname === '/api/merge-queue/' + held.id) {",
      '    reply(200, { entry: held })',
      '    return',
      '  }',
      "  if (request.method === 'POST' && url.pathname === '/api/merge-queue/' + held.id + '/step') {",
      "    let text = ''",
      "    request.setEncoding('utf8')",
      "    request.on('data', (chunk) => { text += chunk })",
      "    request.on('end', () => {",
      '      const body = JSON.parse(text)',
      '      const happened = { ...body.facts, step: body.step }',
      "      if (body.step === 'main-moved' || body.step === 'main-moved-while-testing') happened.attempts = held.attempts ?? 0",
      '      const move = theMoveAStepMakes(held.state, happened)',
      "      if (move.move === 'to') {",
      '        held.state = move.state',
      '        if (move.attempts !== undefined) held.attempts = move.attempts',
      '        if (move.runs !== undefined) held.runs = move.runs',
      "      } else if (move.move === 'bounce') {",
      "        held.state = 'bounced'",
      '        if (move.attempts !== undefined) held.attempts = move.attempts',
      '        if (move.runs !== undefined) held.runs = move.runs',
      "      } else if (move.move === 'stays') {",
      '        if (move.runs !== undefined) held.runs = move.runs',
      '      } else {',
      "        reply(409, { error: 'The stand-in cannot apply the move ' + move.move + '.' })",
      '        return',
      '      }',
      "      reply(200, { entry: held, decided: 'the shared table moved the entry to ' + held.state })",
      '    })',
      '    return',
      '  }',
      "  reply(404, { error: 'No such stand-in door.' })",
      '})',
      "server.listen(0, '127.0.0.1', () => {",
      '  const address = server.address()',
      "  process.stdout.write('READY ' + String(address.port) + '\\n')",
      '})',
      "process.on('SIGTERM', () => server.close(() => process.exit(0)))",
      "process.on('SIGINT', () => server.close(() => process.exit(0)))",
      '',
    ].join('\n')
  )
}

/** Start the stand-in office on 127.0.0.1, on a port it is given by the system, and answer its address. */
async function startTheStandIn(folder: string): Promise<{ base: string; stop: () => Promise<void> }> {
  const script = join(folder, 'the-stand-in-office.mjs')
  writeFileSync(script, theStandInSource())
  const child = spawn(process.execPath, [script], { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  if (child.stdout === null || child.stderr === null) throw new Error('The stand-in office did not get pipes.')
  const address = await new Promise<string>((ok, fail) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => fail(new Error(`The stand-in office did not start.\nstdout:\n${stdout}\nstderr:\n${stderr}`)), 30_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      const line = stdout.split('\n').find((one) => one.startsWith('READY '))
      if (line !== undefined) {
        clearTimeout(timer)
        ok(`http://127.0.0.1:${line.slice('READY '.length).trim()}`)
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('exit', (code) => {
      if (!stdout.includes('READY ')) {
        clearTimeout(timer)
        fail(new Error(`The stand-in office exited ${String(code)}.\nstdout:\n${stdout}\nstderr:\n${stderr}`))
      }
    })
  })
  return {
    base: address,
    stop: () =>
      new Promise<void>((ok) => {
        if (child.exitCode !== null) {
          ok()
          return
        }
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          ok()
        })
        child.kill('SIGTERM')
      }),
  }
}

/** A small child program that imports the real office keeper and reports the state it read back. */
function theChildScript(folder: string): string {
  const file = join(folder, 'a-step-through-the-office-keeper.mjs')
  const keeper = pathToFileURL(join(ROOT, 'tools', 'merge-tool', 'office-keeper.mjs')).href
  writeFileSync(
    file,
    [
      `import { step } from ${JSON.stringify(keeper)}`,
      'const entry = await step(process.env.STEP_NAME, JSON.parse(process.env.STEP_FACTS))',
      "process.stdout.write('RESULT ' + JSON.stringify({ state: entry.state }) + '\\n')",
    ].join('\n') + '\n',
  )
  return file
}

/** Run the real office keeper once, through the stand-in office, and answer the state it reported. */
function runTheChild(script: string, workdir: string, step: string, facts: Record<string, unknown>): string {
  const run = spawnSync(
    process.execPath,
    [script, '--entry', 'entry-a', '--session', 'a-test-session', '--api', base, '--as', 'a-test', '--workspace', 'default', '--workdir', workdir],
    {
      env: {
        ...process.env,
        STEP_NAME: step,
        STEP_FACTS: JSON.stringify(facts),
        MOLE_OFFICE_COMMIT_EMAIL: 'merge-queue@example.invalid',
      },
      encoding: 'utf8',
      timeout: 120_000,
    },
  )
  if (run.status !== 0) {
    throw new Error(`The office keeper child exited ${String(run.status)}.\nstdout:\n${run.stdout ?? ''}\nstderr:\n${run.stderr ?? ''}`)
  }
  const line = (run.stdout ?? '').split('\n').filter((one) => one.startsWith('RESULT ')).pop()
  if (line === undefined) {
    throw new Error(`The office keeper child printed no RESULT line.\nstdout:\n${run.stdout ?? ''}\nstderr:\n${run.stderr ?? ''}`)
  }
  return (JSON.parse(line.slice('RESULT '.length)) as { state: string }).state
}
