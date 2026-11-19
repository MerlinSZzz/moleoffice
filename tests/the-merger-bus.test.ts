// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * tools/the-merger.mjs TAKES UP TO EIGHT RELEASED ENTRIES OF ONE LANE THROUGH ONE SUITE: THE BUS.
 *
 * These cases were in tests/the-merger.test.ts until wave 13p's round D split that file, so that each part runs well
 * inside the 590 seconds an agent's command may take. They run the real tool against a real office on its own port,
 * as that file's header says, and the set-up they share is in tests/the-merger-fixture.ts.
 *
 * WHAT IS PROVED, each by running the real tool:
 *
 *   1. The bus: which entries may board, which it passes over and why, which rides though a file is shared, which
 *      conflict it keeps off, how a rider that leaves is taken off, and which entry a red bus sends back while the
 *      others land.
 *   2. Two entries that each add a migration ride one bus, and an entry whose migration is behind the one aboard is
 *      kept off and renumbered at its own integration (wave 13v rounds 18 and 23).
 *   3. The bus's own setting: its cap is read within the technical bound, and the shipped cap is eight.
 *   4. An entry that changes the queue's own code rides a bus, as the first entry and as a rider, when the office and
 *      the merge tool run from outside the lane's checkout (13u round 66). It is tested alone when the office runs from
 *      that checkout, or its switch is 0. The cases where an answer cannot be read are in
 *      tests/the-queues-own-code-rides-a-bus-when-a-landing-changes-neither.test.ts.
 */
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUS_ENTRIES_BOUNDS, BUS_ENTRIES_FALLBACK } from '../src/config/settings.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { localStamp, parseStoredStamp } from '../src/shared/time.ts'
import { endMarker, startMarker } from '../tools/test-audit-table-markers.mjs'
import {
  SUITE_WORKERS, t, app, queue, asInspector, asPerson, git, write, scratch, AUDIT_TABLE, MARKED_AUDIT_SCRIPT,
  MARKED_AUDIT, PASSING_TEST, mainCheckout, submitGit, stateOf, released, pressedToLand, readingOf,
  sandboxCallsOf, startTheTool, runTheTool, untilTheLogSays, stepsOf, factsOf, aRealOfficeForTheMerger,
  theProxySaysTheOfficeRunsFrom,
} from './the-merger-fixture.ts'

aRealOfficeForTheMerger('tests/the-merger-bus.test.ts')

// ============================================================================ 7b. the bus

describe('the bus: up to eight released entries in one suite, the owner\'s cap (wave 13p rounds 19, 27b and 28a)', () => {
  // THE DECISIONS: a released entry waits in a batch; the whole suite leaves with at most eight entries
  // since 6 October 2026; a red bus is split to find the entry that broke it, which goes back while the others land;
  // an entry that changes the queue's own code is still tested alone where a landing changes the office or the merge tool
  // (13u round 66). MUTATION PROOFS are in the commit message.
  const RED = `import { expect, it } from 'vitest'
it('is red', () => { expect(1).toBe(2) })
`
  const suiteCallsOf = (entry: string) => sandboxCallsOf(entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).includes(`--maxWorkers=${SUITE_WORKERS}`))
  async function judgedInOrder(main: string, ...edits: [string, (dir: string) => void][]): Promise<string[]> {
    const ids: string[] = []
    for (const [name, edit] of edits) ids.push((await submitGit(main, name, edit)).entry)
    for (const id of ids) {
      expect((await runTheTool(id)).code).toBe(0)
      await released(id)
    }
    return ids
  }

  it('sends back only the middle entry of a bus of three when it breaks a file, and the other two land with one suite', async () => {
    const main = mainCheckout('bus-middle')
    const [A, B, C] = await judgedInOrder(
      main,
      ['bus-middle-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' })],
      ['bus-middle-b', (dir) => write(dir, { 'tests/b-red.test.ts': RED })],
      ['bus-middle-c', (dir) => write(dir, { 'src/from-c.txt': 'c\n' })],
    )
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    expect(stepsOf(first)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const tested = factsOf(first, 'tested')!
    expect(tested['green']).toBe(true)
    const bus = tested['testedWith']['bus'] as { entry: string; forTheOther?: Record<string, any> }[]
    expect(bus.map((one) => one.entry)).toEqual([B, C])
    expect(bus[0]!.forTheOther).toMatchObject({ green: false, redTests: ['tests/b-red.test.ts'] })
    expect(bus[1]!.forTheOther).toMatchObject({ green: true })
    expect(tested['says']).toContain(`run once for this entry and merge entries ${B!}, ${C!} together on the bus's tree`)
    expect(suiteCallsOf(A!), 'one suite for the three').toHaveLength(1)
    expect(stateOf(A!)).toBe('merged')

    const second = await runTheTool(B!)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated', 'tested'])
    expect(factsOf(second, 'tested')).toMatchObject({ green: false, redTests: ['tests/b-red.test.ts'], borrowedFrom: { entry: A } })
    expect(suiteCallsOf(B!)).toEqual([])
    expect(readingOf(B!)['machine']['bounced']['says']).toContain(`red on main plus ${A!} and this entry`)
    expect(stateOf(B!)).toBe('bounced')

    const third = await runTheTool(C!)
    expect(third.code, third.err + third.out).toBe(0)
    expect(stepsOf(third)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(factsOf(third, 'tested')).toMatchObject({ green: true, borrowedFrom: { entry: A, tree: bus[1]!.forTheOther!['tree'] } })
    expect(suiteCallsOf(C!)).toEqual([])
    expect(git(main, 'rev-parse', 'HEAD^{tree}')).toBe(bus[1]!.forTheOther!['tree'])
    expect(stateOf(C!)).toBe('merged')
  }, 420_000)

  it('tests an entry that changes the queue\'s own code alone when the office runs from the lane, and it waits for no rider', async () => {
    const main = mainCheckout('bus-queue-code')
    const [A] = await judgedInOrder(main, ['bus-queue-code-a', (dir) => write(dir, { 'tools/the-merger.mjs': '// synthetic\n' })], ['bus-queue-code-b', (dir) => write(dir, { 'src/from-b.txt': 'b\n' })])
    // tools/the-merger.mjs lands only after a press.
    await pressedToLand(A!)
    const started = Date.now()
    theProxySaysTheOfficeRunsFrom(main)
    try {
      const alone = await runTheTool(A!, { MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '600' })
      expect(alone.code, alone.err + alone.out).toBe(0)
      expect(Date.now() - started).toBeLessThan(300_000)
      expect(factsOf(alone, 'tested')!['testedWith']).toBeUndefined()
      const said = readFileSync(alone.log, 'utf8')
      expect(said).toContain(`tested alone: this entry changes the queue's own code, and the office runs from ${main}, which a landing on `)
      expect(said).not.toContain('the bus waits for more')
    } finally {
      theProxySaysTheOfficeRunsFrom(null)
    }
  }, 300_000)

  // 13u ROUND 66: the office and the merge tool of these cases run from this checkout, and the lane's checkout is another.
  it('lets an entry that changes the queue\'s own code ride a bus, as the first entry and as a rider, when the office and the merge tool run from outside the lane', async () => {
    const main = mainCheckout('bus-queue-code-rides')
    const [A, B] = await judgedInOrder(main, ['bus-queue-code-rides-a', (dir) => write(dir, { 'tools/the-merger.mjs': '// synthetic\n' })], ['bus-queue-code-rides-b', (dir) => write(dir, { 'tools/merge-tool/synthetic-rider.mjs': '// synthetic\n' })])
    await pressedToLand(A!)
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    const tested = factsOf(first, 'tested')!
    expect(tested['green']).toBe(true)
    expect(tested['testedWith']).toMatchObject({ entry: B, forTheOther: { green: true } })
    expect(suiteCallsOf(A!), 'one suite for the two').toHaveLength(1)
    const said = readFileSync(first.log, 'utf8')
    expect(said).toContain("this entry changes the queue's own code, and the office runs from ")
    expect(said).toContain(`${B!} changes the queue's own code, and the office runs from `)
    expect(said).toContain(`, and a landing on ${main} changes neither, so it may ride`)
  }, 300_000)

  it('tests an entry that changes the queue\'s own code alone when its switch is 0, though the office and the merge tool run from outside the lane', async () => {
    const main = mainCheckout('bus-queue-code-off')
    const [A] = await judgedInOrder(main, ['bus-queue-code-off-a', (dir) => write(dir, { 'tools/the-merger.mjs': '// synthetic\n' })], ['bus-queue-code-off-b', (dir) => write(dir, { 'src/from-b.txt': 'b\n' })])
    await pressedToLand(A!)
    const setting = gateNamed('queue-code-rides-a-bus').setting
    const alone = await runTheTool(A!, { [setting]: '0' })
    expect(alone.code, alone.err + alone.out).toBe(0)
    expect(factsOf(alone, 'tested')!['testedWith']).toBeUndefined()
    expect(readFileSync(alone.log, 'utf8')).toContain(`tested alone: this entry changes the queue's own code, and ${setting} is 0, so it is tested alone`)
  }, 300_000)

  // WAVE 13p ROUND 23: FULLER BUSES. A file two entries change rides when git merges it without a conflict, and an entry
  // that cannot board lets the ones behind it board; the riders take the lane before it. MUTATION PROOFS are in the commit
  // message.
  const long = (dir: string) => readFileSync(join(dir, 'src/long.txt'), 'utf8')
  /** What GET /api/merge-queue/:id says the merge tool waits on for an entry, as its fixed form (round 27, piece 3). */
  async function toolWaitsOf(id: string): Promise<Record<string, unknown> | undefined> {
    const reply = await app.inject({ method: 'GET', url: `/api/merge-queue/${id}`, headers: asPerson })
    expect(reply.statusCode, reply.body).toBe(200)
    return (JSON.parse(reply.body) as { entry: { toolWaits?: Record<string, unknown> } }).entry.toolWaits
  }
  /** The same, from the queue lane by lane, GET /api/merge-queue. */
  async function toolWaitsInTheQueue(main: string): Promise<Map<string, Record<string, unknown> | undefined>> {
    const reply = await app.inject({ method: 'GET', url: `/api/merge-queue?lane=${encodeURIComponent(main)}`, headers: asPerson })
    expect(reply.statusCode, reply.body).toBe(200)
    const lanes = (JSON.parse(reply.body) as { lanes: { entries: { id: string; toolWaits?: Record<string, unknown> }[] }[] }).lanes
    return new Map(lanes.flatMap((lane) => lane.entries).map((one) => [one.id, one.toolWaits]))
  }
  /** The inspector releases the check again the office asked for a reinspecting entry, scoped to the paths it asked about. */
  async function releasedAgain(entry: string): Promise<void> {
    expect(stateOf(entry)).toBe('reinspecting')
    const asked = readingOf(entry)['machine']['reinspection'] as { run: string; only: string[] }
    const sealId = String(t.api.getRecord(asked.run)!.data['sealedTip'])
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
    const read = { sealId, sealHash: seal.hash, worktree: String(t.api.getRecord(asked.run)!.data['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.', only: asked.only }
    const assembled = await app.inject({
      method: 'POST',
      url: `/api/checks/${asked.run}/assembled`,
      headers: asInspector,
      payload: { changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })), base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' }, read, only: asked.only },
    })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const verdict = await app.inject({
      method: 'POST',
      url: `/api/checks/${asked.run}`,
      headers: asInspector,
      payload: { verdict: 'released', traced: syntheticTrace(t, asked.only), check: 'Synthetic: read the merged file and found nothing missing.', chaptersRead: [], read },
    })
    expect(verdict.statusCode, verdict.body).toBe(201)
    expect(stateOf(entry)).toBe('testing')
  }

  it('takes two entries that change different lines of one file on one bus, and the second is checked again for that file before it borrows', async () => {
    const main = mainCheckout('bus-one-file')
    const [A, B] = await judgedInOrder(
      main,
      ['bus-one-file-a', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by A\n') })],
      ['bus-one-file-b', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 19\n', 'line 19 by B\n') })],
    )
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    const tested = factsOf(first, 'tested')!
    const bus = tested['testedWith']['bus'] as { entry: string; forTheOther?: Record<string, any> }[]
    expect(bus.map((one) => one.entry)).toEqual([B])
    expect(bus[0]!.forTheOther).toMatchObject({ green: true })
    expect(readFileSync(first.log, 'utf8')).toContain(`${B!} rides though an entry aboard also changes src/long.txt: git put its commits on this entry's result without a conflict`)
    expect(stateOf(A!)).toBe('merged')

    // AT ITS OWN TURN the file holds both entries' lines, which its release did not read: a check again of that file only.
    const second = await runTheTool(B!)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated'])
    expect(readingOf(B!)['machine']['reinspection']).toMatchObject({ only: ['src/long.txt'] })
    await releasedAgain(B!)
    const third = await runTheTool(B!)
    expect(third.code, third.err + third.out).toBe(0)
    expect(factsOf(third, 'tested')).toMatchObject({ green: true, borrowedFrom: { entry: A, tree: bus[0]!.forTheOther!['tree'] } })
    expect(suiteCallsOf(B!), 'the second entry ran no suite').toEqual([])
    expect(stateOf(B!)).toBe('merged')
    expect(long(main)).toContain('line 2 by A\n')
    expect(long(main)).toContain('line 19 by B\n')
  }, 420_000)

  it('keeps an entry whose change to the same lines is a real conflict off the bus, and sends it back untested', async () => {
    const main = mainCheckout('bus-conflict')
    const [A, B] = await judgedInOrder(
      main,
      ['bus-conflict-a', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by A\n') })],
      ['bus-conflict-b', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by B\n') })],
    )
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    expect(factsOf(first, 'tested')!['testedWith']).toBeUndefined()
    expect(readFileSync(first.log, 'utf8')).toContain(`tested alone: the commits of ${B!} do not go onto this entry's result without a conflict`)
    expect(stateOf(A!)).toBe('merged')
    // AFTER THE LANDING, B CANNOT JOIN THE NEW MAIN, so it is sent back at once, untested (wave 13v round 15).
    expect(stateOf(B!)).toBe('bounced')
    const bounced = readingOf(B!)['machine']['bounced']
    expect(bounced).toMatchObject({ reason: 'conflict', files: ['src/long.txt'], mainAt: git(main, 'rev-parse', 'HEAD') })
    expect(bounced['says']).toContain('src/long.txt at lines 2-6')
    expect(bounced['says']).toContain('The entry was never tested')
  }, 300_000)

  it('passes over an entry that cannot board, lets the ones behind it board, and hands them the lane before it', async () => {
    // X CONFLICTS with the driver, so it cannot board. W changes a file X changes, so it does not pass X. Y changes
    // nothing of X's, so it boards past X, and takes the lane before X once the driver lands.
    const main = mainCheckout('bus-pass-over')
    const [A, X, W, Y] = await judgedInOrder(
      main,
      ['bus-pass-over-a', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by A\n') })],
      ['bus-pass-over-x', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by X\n') })],
      ['bus-pass-over-w', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 19\n', 'line 19 by W\n') })],
      ['bus-pass-over-y', (dir) => write(dir, { 'src/from-y.txt': 'y\n' })],
    )
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    const bus = factsOf(first, 'tested')!['testedWith']['bus'] as { entry: string; forTheOther?: Record<string, any> }[]
    expect(bus.map((one) => one.entry)).toEqual([Y])
    const said = readFileSync(first.log, 'utf8')
    expect(said).toContain(`the bus passes over merge entry ${X!}: the commits of ${X!} do not go onto this entry's result without a conflict`)
    expect(said).toContain(`the bus passes over merge entry ${W!}: ${W!} changes src/long.txt, which ${X!} also changes`)
    expect(stateOf(A!)).toBe('merged')

    // THE RIDER TAKES THE LANE FIRST: the office would hand the merge tool Y, and holds X and W with the reason.
    const reading = (id: string) => queue.readMergeEntry(t.api.getRecord(id)!)
    // THE WORKER'S FILTER (`theMergeToolWork` hands on only entries this holds nothing against). The harness's tool
    // sessions stay running, so the worker's list itself is not read here.
    const handedOn = () => [X!, W!, Y!].filter((id) => stateOf(id) === 'judged' && queue.whyTheMergeToolWaits(reading(id)) === null)
    // X CANNOT JOIN THE MAIN A LEFT, so the landing sent it back, untested (wave 13v round 15). W waits for the rider.
    expect(stateOf(X!)).toBe('bounced')
    expect(handedOn()).toEqual([Y])
    expect(queue.whyTheMergeToolWaits(reading(W!))).toContain(`Merge entry ${Y!} rode the bus merge entry ${A!} ran, and merge entry ${W!} did not`)
    // THE QUEUE SAYS WHICH RIDER GOES FIRST AND WHY, as a fixed form beside the sentence (round 27, piece 3).
    expect(await toolWaitsOf(W!)).toMatchObject({ because: 'a-rider-goes-first', first: Y, driver: A })
    expect(await toolWaitsOf(Y!)).toBeUndefined()
    const rider = await runTheTool(Y!)
    expect(rider.code, rider.err + rider.out).toBe(0)
    expect(factsOf(rider, 'tested')).toMatchObject({ green: true, borrowedFrom: { entry: A, tree: bus[0]!.forTheOther!['tree'] } })
    expect(suiteCallsOf(Y!), 'the rider ran no suite').toEqual([])
    expect(stateOf(Y!)).toBe('merged')
    // ONCE THE RIDER HAS LANDED, the one passed over is handed on first again, in the lane's order.
    expect(handedOn()).toEqual([W])
    expect(queue.whyTheMergeToolWaits(reading(W!))).toBeNull()
  }, 600_000)

  it('lets an entry passed over because it needs a check take the lane next, ahead of the riders marked after it, so the next bus cannot pass it over again', async () => {
    // WAVE 13p ROUND 27 (message JCLX21aDWs4p; no3K6Gmf2kst). Main changes src/long.txt after X was
    // judged, so on the bus's tree that file would not hold what X's release read: the bus passes X over for a check and
    // says so as a fact, passedForACheck. Y, released after X, rides. Z was submitted before X and released after the
    // bus left. Under the round-23 rule Y went first and then Z, which was submitted earlier, could drive a second bus
    // that passed X over again. Now X takes the lane next, and its scoped check starts at once.
    const main = mainCheckout('bus-for-a-check')
    const A = (await submitGit(main, 'bus-for-a-check-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' }))).entry
    const Z = (await submitGit(main, 'bus-for-a-check-z', (dir) => write(dir, { 'src/from-z.txt': 'z\n' }))).entry
    const X = (await submitGit(main, 'bus-for-a-check-x', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by X\n') }))).entry
    const Y = (await submitGit(main, 'bus-for-a-check-y', (dir) => write(dir, { 'src/from-y.txt': 'y\n' }))).entry
    for (const id of [A, Z, X, Y]) expect((await runTheTool(id)).code).toBe(0)
    await released(A)
    await released(X)
    // THE MARK IS STAMPED TO THE SECOND: Y is marked in a later second than X, so "marked after" is not a tie. The
    // wait ends as soon as the wall clock reads another second than it did once X was released.
    const markedX = localStamp(new Date())
    while (localStamp(new Date()) === markedX) await new Promise((done) => setTimeout(done, 10))
    await released(Y)
    write(main, { 'src/long.txt': long(main).replace('line 19\n', 'line 19 by main\n') })
    git(main, 'commit', '-q', '-am', 'Main changes src/long.txt under X')
    const first = await runTheTool(A, { MOLE_OFFICE_BUS_MOST_ENTRIES: '2', MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: '600' })
    expect(first.code, first.err + first.out).toBe(0)
    const testedWith = factsOf(first, 'tested')!['testedWith'] as { bus: { entry: string }[]; passedForACheck?: string[] }
    expect(testedWith.bus.map((one) => one.entry)).toEqual([Y])
    expect(testedWith.passedForACheck).toEqual([X])
    expect(readFileSync(first.log, 'utf8')).toContain(`the bus passes over merge entry ${X}: on this entry's result, src/long.txt of ${X} would not hold what its release read, so it would need a check`)
    expect(stateOf(A)).toBe('merged')
    await released(Z)

    // X GOES FIRST: the rider marked after it waits, and so does Z, which did not ride.
    const reading = (id: string) => queue.readMergeEntry(t.api.getRecord(id)!)
    const handedOn = () => [Z, X, Y].filter((id) => stateOf(id) === 'judged' && queue.whyTheMergeToolWaits(reading(id)) === null)
    expect(handedOn()).toEqual([X])
    for (const id of [Y, Z]) {
      expect(queue.whyTheMergeToolWaits(reading(id))).toContain(`The bus merge entry ${A} ran passed over merge entry ${X} because files its release read would change on that bus's tree, so ${X} takes the lane first`)
    }
    const said = await toolWaitsInTheQueue(main)
    for (const id of [Y, Z]) expect(said.get(id)).toMatchObject({ because: 'an-entry-passed-over-for-a-check-goes-first', first: X, driver: A })
    expect(said.has(X) && said.get(X) === undefined).toBe(true)

    // ITS SCOPED CHECK STARTS AT ONCE, and it lets the lane go while the check runs (wave 13u, item 53), so the rider
    // marked after it is handed on meanwhile, and Z, which did not ride, waits for the rider.
    const own = await runTheTool(X)
    expect(own.code, own.err + own.out).toBe(0)
    expect(stepsOf(own)).toEqual(['integrating', 'integrated'])
    expect(stateOf(X)).toBe('reinspecting')
    expect(readingOf(X)['machine']['reinspection']).toMatchObject({ only: ['src/long.txt'] })
    expect(readingOf(X)['occupies']).toBeNull()
    expect(handedOn()).toEqual([Y])
    expect(queue.whyTheMergeToolWaits(reading(Z))).toContain(`Merge entry ${Y} rode the bus merge entry ${A} ran, and merge entry ${Z} did not`)
    const meanwhile = await toolWaitsInTheQueue(main)
    expect(meanwhile.get(Z)).toMatchObject({ because: 'a-rider-goes-first', first: Y, driver: A })
    expect(meanwhile.has(Y) && meanwhile.get(Y) === undefined).toBe(true)

    // THE RIDER LANDS ON ITS BUS'S RESULT, and Z takes the lane. Z's bus does not wait for X: a check again can wait
    // more than an hour for somebody to start it, and a bus that waited for it would hold the lane on that check. If X
    // were released meanwhile, it would be judged again, and the bus's next look would try it like any judged entry.
    const rider = await runTheTool(Y)
    expect(rider.code, rider.err + rider.out).toBe(0)
    expect(stateOf(Y)).toBe('merged')
    expect(handedOn()).toEqual([Z])
    const leavesAfter = Math.ceil((Date.now() - releasedAtOf(Z)) / 1000) + 30
    const alone = await runTheTool(Z, { MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: String(leavesAfter) })
    expect(alone.code, alone.err + alone.out).toBe(0)
    const zSaid = readFileSync(alone.log, 'utf8')
    expect(zSaid).not.toContain(`It waits for merge entry ${X}`)
    expect(zSaid).toContain('the bus leaves now: no entry of the lane that it has not seen can still be judged')
    expect(stateOf(Z)).toBe('merged')
    expect(stateOf(X)).toBe('reinspecting')
  }, 600_000)

  it("boards an entry that changed a generated file only outside its marker pair, when the bus changed it only inside, and passes over the same change to a file nobody generates", async () => {
    // WAVE 13p ROUND 29: the board step of tools/merge-tool/pairs.mjs lets a generated file stand when the entry changed
    // only lines outside its marker pairs and the tip changed only lines inside them. A adds a test file, so regenerating
    // design/AUDIT.md on A's result moves the lines inside its pair. B changed a hand-written line of that file outside
    // the pair. C changed a hand-written line of src/notes.md outside a pair of the same markers, and main then changed
    // that file inside the pair; src/notes.md is generated by nothing, so the exception is not C's and it needs a check.
    const notes = (inside: string) => ['# Notes', '', 'A note line 1.', 'A note line 2.', 'A note line 3.', 'A note line 4.', '', startMarker('notes'), inside, endMarker('notes'), ''].join('\n')
    const main = mainCheckout('bus-generated-regions', { 'tools/audit.mjs': MARKED_AUDIT_SCRIPT, 'design/AUDIT.md': MARKED_AUDIT, 'src/notes.md': notes('Inside, as it was.') })
    const audit = (dir: string) => readFileSync(join(dir, 'design/AUDIT.md'), 'utf8')
    expect(audit(main)).toContain(`${startMarker(AUDIT_TABLE)}\n- tests/one.test.ts\n${endMarker(AUDIT_TABLE)}`)
    const A = (await submitGit(main, 'bus-generated-regions-a', (dir) => write(dir, { 'tests/two.test.ts': PASSING_TEST }))).entry
    const B = (await submitGit(main, 'bus-generated-regions-b', (dir) => write(dir, { 'design/AUDIT.md': audit(dir).replace('Written by hand, line 1.', 'Written by hand, line 1, changed by B.') }))).entry
    const C = (await submitGit(main, 'bus-generated-regions-c', (dir) => write(dir, { 'src/notes.md': readFileSync(join(dir, 'src/notes.md'), 'utf8').replace('A note line 1.', 'A note line 1, changed by C.') }))).entry
    for (const id of [A, B, C]) {
      expect((await runTheTool(id)).code).toBe(0)
      await released(id)
    }
    // THE GUARD ACCEPTED B's HAND-WRITTEN LINE: regenerating keeps the lines outside the pair, so B was judged, not bounced.
    expect(stateOf(B)).toBe('judged')
    write(main, { 'src/notes.md': notes('Inside, changed by main.') })
    git(main, 'commit', '-q', '-am', 'Main changes src/notes.md inside its marker pair, under C')

    const first = await runTheTool(A)
    expect(first.code, first.err + first.out).toBe(0)
    const said = readFileSync(first.log, 'utf8')
    const testedWith = factsOf(first, 'tested')!['testedWith'] as { bus: { entry: string; forTheOther?: Record<string, any> }[]; passedForACheck?: string[] } | undefined
    expect(testedWith?.bus.map((one) => one.entry), said).toEqual([B])
    expect(testedWith!.bus[0]!.forTheOther).toMatchObject({ green: true })
    expect(testedWith!.passedForACheck, said).toEqual([C])
    expect(said).not.toContain(`design/AUDIT.md of ${B} would not hold what its release read`)
    expect(said).toContain(`the bus passes over merge entry ${C}: on the bus's tree, src/notes.md of ${C} would not hold what its release read, so it would need a check`)
    expect(stateOf(A)).toBe('merged')
  }, 600_000)

  // WAVE 13p ROUND 27 (problem GS4-3r9FQQCv, agreed in message yf17WKvB1SCR, and the follow-up
  // KIzOszMBTi87): the bus waits only for entries that can still be judged, and a rider that leaves judged no longer
  // counts. MUTATION PROOFS are in the commit message.
  const releasedAtOf = (id: string) => parseStoredStamp(String(readingOf(id)['machine']['verdict']['at']))!
  const testedAtOf = (id: string) => parseStoredStamp(String(readingOf(id)['machine']['tested']['at']))!

  it('takes off a rider that leaves judged while it waits, and leaves at once when no rider is left', async () => {
    const main = mainCheckout('bus-rider-leaves')
    const [A, B] = await judgedInOrder(
      main,
      ['bus-rider-leaves-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' })],
      ['bus-rider-leaves-b', (dir) => write(dir, { 'src/from-b.txt': 'b\n' })],
    )
    await submitGit(main, 'bus-rider-leaves-w', (dir) => write(dir, { 'src/from-w.txt': 'w\n' }))
    const leavesAfter = Math.ceil((Date.now() - releasedAtOf(A!)) / 1000) + 240
    const run = startTheTool(A!, { MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: String(leavesAfter) })
    // THE OWNER'S EIGHT, under a decision, unset here; four before it, under another
    // one.
    await untilTheLogSays(A!, 'the bus waits for more riders: 2 of 8 aboard')
    const gone = await app.inject({ method: 'POST', url: `/api/merge-queue/${B!}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: the rider leaves the bus.' } })
    expect(gone.statusCode, gone.body).toBe(200)
    const ran = await run.done
    expect(ran.code, ran.err + ran.out).toBe(0)
    const said = readFileSync(ran.log, 'utf8')
    expect(said).toContain(`the bus takes merge entry ${B!} off: ${B!} left judged after it boarded (it is withdrawn), so it no longer rides`)
    expect(factsOf(ran, 'tested')!['testedWith']).toBeUndefined()
    expect(testedAtOf(A!), 'the bus waited with no rider aboard').toBeLessThan(releasedAtOf(A!) + leavesAfter * 1000)
  }, 420_000)

  it('builds its tree again without a rider that left, so the riders behind it still borrow its result', async () => {
    const main = mainCheckout('bus-rebuilt')
    const [A, B, C] = await judgedInOrder(
      main,
      ['bus-rebuilt-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' })],
      ['bus-rebuilt-b', (dir) => write(dir, { 'src/from-b.txt': 'b\n' })],
      ['bus-rebuilt-c', (dir) => write(dir, { 'src/from-c.txt': 'c\n' })],
    )
    // W IS SUBMITTED AND NEVER JUDGED, so the bus has an entry it can wait for while B leaves and C boards again.
    const { entry: W } = await submitGit(main, 'bus-rebuilt-w', (dir) => write(dir, { 'src/from-w.txt': 'w\n' }))
    const leavesAfter = Math.ceil((Date.now() - releasedAtOf(A!)) / 1000) + 240
    const run = startTheTool(A!, { MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS: String(leavesAfter) })
    // THE OWNER'S EIGHT, under a decision, unset here; four before it, under another
    // one.
    await untilTheLogSays(A!, 'the bus waits for more riders: 3 of 8 aboard')
    const gone = await app.inject({ method: 'POST', url: `/api/merge-queue/${B!}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: the first rider leaves the bus.' } })
    expect(gone.statusCode, gone.body).toBe(200)
    // THE BUS IS BUILT AGAIN WHILE IT WAITS: it takes B off, C boards again, and it still waits for W with two aboard.
    await untilTheLogSays(A!, `the bus takes merge entry ${B!} off: ${B!} left judged after it boarded (it is withdrawn)`)
    await untilTheLogSays(A!, `the bus waits for more riders: 2 of 8 aboard, counting only entries that can ride. It waits for merge entry ${W}`)
    // THEN W IS WITHDRAWN TOO, so nobody is left to wait for and the bus leaves at once, not when its time runs out. Until
    // 9 October 2026 the bus waited the whole 150 s for W here, the slowest wait of the suite, and nothing read it.
    const wGone = await app.inject({ method: 'POST', url: `/api/merge-queue/${W}/withdraw`, headers: asPerson, payload: { because: 'Synthetic: the entry the bus waited for leaves.' } })
    expect(wGone.statusCode, wGone.body).toBe(200)
    const ran = await run.done
    expect(ran.code, ran.err + ran.out).toBe(0)
    expect(readFileSync(ran.log, 'utf8')).toContain('the bus leaves now: no entry of the lane that it has not seen can still be judged')
    expect(testedAtOf(A!), 'the bus waited its time once nobody was left').toBeLessThan(releasedAtOf(A!) + leavesAfter * 1000)
    const bus = factsOf(ran, 'tested')!['testedWith']['bus'] as { entry: string; forTheOther?: Record<string, any> }[]
    expect(bus.map((one) => one.entry)).toEqual([C])
    expect(stateOf(A!)).toBe('merged')
    const rider = await runTheTool(C!)
    expect(rider.code, rider.err + rider.out).toBe(0)
    expect(factsOf(rider, 'tested')).toMatchObject({ green: true, borrowedFrom: { entry: A, tree: bus[0]!.forTheOther!['tree'] } })
    expect(suiteCallsOf(C!), 'the rider ran no suite').toEqual([])
    expect(existsSync(join(main, 'src/from-b.txt'))).toBe(false)
  }, 600_000)

  it('names the one entry whose landing turns a file red when the red comes from a file both entries change', async () => {
    // RED ONLY WITH BOTH LINES: main carries a test that is red when src/long.txt holds A's line and B's line. A lands
    // first, so the file turns red on B's tree, and the split names B alone; A lands.
    const main = mainCheckout('bus-shared-red')
    const BOTH = `import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
// SYNTHETIC: red only when src/long.txt carries both entries' lines.
it('is red only with both lines', () => { const text = readFileSync('src/long.txt', 'utf8'); expect(text.includes('line 2 by A') && text.includes('line 19 by B')).toBe(false) })
`
    write(main, { 'tests/both-lines.test.ts': BOTH })
    execFileSync(process.execPath, ['tools/audit.mjs'], { cwd: main })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Main carries a test the two entries collide in, in one file')
    const [A, B] = await judgedInOrder(
      main,
      ['bus-shared-red-a', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 2\n', 'line 2 by A\n') })],
      ['bus-shared-red-b', (dir) => write(dir, { 'src/long.txt': long(dir).replace('line 19\n', 'line 19 by B\n') })],
    )
    const first = await runTheTool(A!)
    expect(first.code, first.err + first.out).toBe(0)
    const tested = factsOf(first, 'tested')!
    expect(tested['green']).toBe(true)
    const bus = tested['testedWith']['bus'] as { entry: string; forTheOther?: Record<string, any> }[]
    expect(bus.map((one) => one.entry)).toEqual([B])
    expect(bus[0]!.forTheOther).toMatchObject({ green: false, redTests: ['tests/both-lines.test.ts'] })
    expect(stateOf(A!)).toBe('merged')

    const second = await runTheTool(B!)
    expect(second.code, second.err + second.out).toBe(0)
    await releasedAgain(B!)
    const third = await runTheTool(B!)
    expect(third.code, third.err + third.out).toBe(0)
    expect(factsOf(third, 'tested')).toMatchObject({ green: false, redTests: ['tests/both-lines.test.ts'], borrowedFrom: { entry: A } })
    expect(suiteCallsOf(B!)).toEqual([])
    const bounced = readingOf(B!)['machine']['bounced']
    expect(bounced['says']).toContain(`red on main plus ${A!} and this entry`)
    expect(bounced['says']).toContain(`not merge entry ${A!}'s`)
    expect(stateOf(B!)).toBe('bounced')
  }, 420_000)

  it('reads the bus cap within its technical bound, and uses the shipped eight', async () => {
    expect(BUS_ENTRIES_FALLBACK).toBe(8)
    expect(BUS_ENTRIES_BOUNDS).toEqual({ fewest: 1, most: 64 })
    const directory = scratch('bus-rules')
    const savedArgv = process.argv
    const savedCap = process.env['MOLE_OFFICE_BUS_MOST_ENTRIES']
    try {
      process.argv = ['node', 'the-merger.mjs', '--entry', 'a-made-up-entry', '--session', 'a-made-up-run', '--api', 'http://127.0.0.1:0', '--workspace', 'default', '--workdir', directory]
      const { theBusRules } = await import('../tools/merge-tool/pairs.mjs')
      const { THE_BUS_READS } = await import('../tools/merge-tool/arguments.mjs')
      process.env['MOLE_OFFICE_BUS_MOST_ENTRIES'] = '65'
      expect(theBusRules(THE_BUS_READS).most, 'a cap above the technical bound falls back to the shipped eight').toBe(BUS_ENTRIES_FALLBACK)
      expect(readFileSync(join(directory, 'the-merger.log'), 'utf8'), 'the cap it cannot use is said in words').toContain('MOLE_OFFICE_BUS_MOST_ENTRIES is "65", which it cannot use: the technical limit is 64 entries, so the bus uses 8.')
      process.env['MOLE_OFFICE_BUS_MOST_ENTRIES'] = '64'
      expect(theBusRules(THE_BUS_READS).most, 'the technical bound itself is a cap the bus can use').toBe(BUS_ENTRIES_BOUNDS.most)
      delete process.env['MOLE_OFFICE_BUS_MOST_ENTRIES']
      expect(theBusRules(THE_BUS_READS)).toMatchObject({ most: BUS_ENTRIES_FALLBACK, leavesAfterSeconds: 1800 })
    } finally {
      process.argv = savedArgv
      if (savedCap === undefined) delete process.env['MOLE_OFFICE_BUS_MOST_ENTRIES']
      else process.env['MOLE_OFFICE_BUS_MOST_ENTRIES'] = savedCap
    }
  }, 30_000)
})

describe('two entries that each add a migration ride one bus (wave 13v round 18)', () => {
  // EVERY MIGRATION ENTRY CHANGES drizzle/meta/_journal.json, so the bus used to keep the second off by file, decision R2.
  // The pair clone now joins the journal as an entry's own integration does, and the joined file is judged again by a
  // program (tools/merge-tool/journal-join.mjs): it holds every row of each side and no row disagrees. Each entry also
  // declares its table in a file of its own, as tests/migration-fixtures.ts asks, so no other file is shared. The
  // journal, the migrations and the declarations here are synthetic. MUTATION PROOFS are in the commit message.
  const JOURNAL = 'drizzle/meta/_journal.json'
  const row = (idx: number, tag: string) => ({ idx, version: '6', when: 1791368770100 + idx, tag, breakpoints: true })
  const journalText = (rows: ReturnType<typeof row>[]) => JSON.stringify({ version: '7', dialect: 'sqlite', entries: rows }, null, 2) + '\n'
  const START = row(0, '0000_synthetic_start')
  const ONE = row(1, '0001_synthetic_one')
  const TWO = row(2, '0002_synthetic_two')
  const read = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8')
  const declared = (tag: string) => `tests/what-each-migration-adds/${tag}.json`
  /** A migration added as a branch adds one: its journal row, its SQL, and the table it declares. */
  const adds = (added: ReturnType<typeof row>) => (dir: string) => {
    const rows = (JSON.parse(read(dir, JOURNAL)) as { entries: ReturnType<typeof row>[] }).entries
    write(dir, {
      [JOURNAL]: journalText([...rows, added]),
      [`drizzle/${added.tag}.sql`]: `CREATE TABLE \`${added.tag.slice(5)}_mark\` (\`id\` integer PRIMARY KEY);\n`,
      [declared(added.tag)]: JSON.stringify({ why: `Synthetic: the table ${added.tag} adds.`, tables: [`${added.tag.slice(5)}_mark`] }, null, 2) + '\n',
    })
  }
  function migrationsCheckout(name: string): string {
    return mainCheckout(name, { [JOURNAL]: journalText([START]), [`drizzle/${START.tag}.sql`]: 'CREATE TABLE `synthetic_start` (`id` integer PRIMARY KEY);\n' })
  }
  async function judgedInOrder(main: string, ...edits: [string, (dir: string) => void][]): Promise<string[]> {
    const ids: string[] = []
    for (const [name, edit] of edits) ids.push((await submitGit(main, name, edit)).entry)
    for (const id of ids) {
      expect((await runTheTool(id)).code).toBe(0)
      await released(id)
      // Every entry of this block adds a migration, which lands only after a press.
      await pressedToLand(id)
    }
    return ids
  }
  const suiteCallsOf = (entry: string) => sandboxCallsOf(entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).includes(`--maxWorkers=${SUITE_WORKERS}`))

  // 0002 THEN 0001 NO LONGER RIDES (wave 13v round 23): the rider's 0001 is behind the 0002 the bus carries, so it is kept
  // off and renumbered at its own integration. That case is the next test.
  for (const [order, first, second] of [
    ['0001 then 0002', ONE, TWO],
  ] as const) {
    it(`takes two entries that each add a migration, ${order}, on one bus, with no check again for the joined journal, and both land`, async () => {
      const main = migrationsCheckout(`journal-ride-${first.idx}`)
      const [A, B] = await judgedInOrder(main, [`journal-ride-${first.idx}-a`, adds(first)], [`journal-ride-${first.idx}-b`, adds(second)])
      const driving = await runTheTool(A!)
      expect(driving.code, driving.err + driving.out).toBe(0)
      const bus = factsOf(driving, 'tested')!['testedWith']['bus'] as { entry: string; forTheOther?: Record<string, any> }[]
      expect(bus.map((one) => one.entry)).toEqual([B])
      const said = readFileSync(driving.log, 'utf8')
      expect(said).toContain(`${B!} rides though an entry aboard also changes ${JOURNAL}: git put its commits on this entry's result without a conflict. On this bus's tree its files hold what its release read`)
      expect(said).toContain(
        `${B!} rides, and on this entry's result ${JOURNAL} holds every row of each side: (by join, wave 13v round 18: The joined journal holds all 2 rows it lands on and all 2 of the entry's, adding ${second.tag}, with no row changed, no row from neither side, and no tag or index twice.)`,
      )
      expect(stateOf(A!), JSON.stringify(readingOf(A!)['machine']?.['bounced'] ?? null)).toBe('merged')

      // AT ITS OWN TURN the journal differs from what its release read, and the program decides it, so no check is asked.
      const riding = await runTheTool(B!)
      expect(riding.code, riding.err + riding.out).toBe(0)
      expect(stepsOf(riding)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
      const decided = (factsOf(riding, 'integrated')!['checker'] as { decided: Record<string, unknown>[] }).decided
      expect(decided.filter((one) => one['path'] === JOURNAL)).toEqual([
        { path: JOURNAL, check: 'joins', ok: true, detail: `The joined journal holds all 2 rows it lands on and all 2 of the entry's, adding ${second.tag}, with no row changed, no row from neither side, and no tag or index twice.` },
      ])
      expect(factsOf(riding, 'tested')).toMatchObject({ green: true, borrowedFrom: { entry: A, tree: bus[0]!.forTheOther!['tree'] } })
      expect(suiteCallsOf(B!), 'the second entry ran no suite').toEqual([])
      expect(stateOf(B!), JSON.stringify(readingOf(B!)['machine']?.['bounced'] ?? null)).toBe('merged')

      // THE JOURNAL AND THE LIST ARE RIGHT on main: main's rows in their order, the rider's row after them, each once.
      expect(read(main, JOURNAL)).toBe(journalText([START, first, second]))
      for (const one of [first, second]) {
        expect(read(main, `drizzle/${one.tag}.sql`)).toContain(`${one.tag.slice(5)}_mark`)
        expect(JSON.parse(read(main, declared(one.tag)))).toEqual({ why: `Synthetic: the table ${one.tag} adds.`, tables: [`${one.tag.slice(5)}_mark`] })
      }
    }, 600_000)
  }

  it('keeps off the bus an entry whose migration is behind the one aboard, 0002 then 0001, and renumbers it at its own integration (wave 13v round 23)', async () => {
    const main = migrationsCheckout('journal-ride-behind')
    const [A, B] = await judgedInOrder(main, ['journal-ride-behind-a', adds(TWO)], ['journal-ride-behind-b', adds(ONE)])
    const driving = await runTheTool(A!)
    expect(driving.code, driving.err + driving.out).toBe(0)
    const said = readFileSync(driving.log, 'utf8')
    expect(said).toContain(`${B!} adds ${ONE.tag} behind the newest migration on`)
    expect(said).toContain('which its own integration renumbers, so it is tested alone')
    expect(stateOf(A!)).toBe('merged')

    const own = await runTheTool(B!)
    expect(stepsOf(own).slice(0, 2)).toEqual(['integrating', 'integrated'])
    expect(factsOf(own, 'integrated')!['renumberedMigrations']).toEqual([{ from: ONE.tag, to: '0003_synthetic_one' }])
    const integrated = JSON.parse(execFileSync('git', ['-C', factsOf(own, 'integrated')!['clone'] as string, 'show', `${factsOf(own, 'integrated')!['result'] as string}:${JOURNAL}`], { encoding: 'utf8' })) as { entries: ReturnType<typeof row>[] }
    expect(integrated.entries.map((one) => `${one.tag}@${one.idx}`)).toEqual([`${START.tag}@0`, `${TWO.tag}@2`, '0003_synthetic_one@3'])
    expect(integrated.entries[2]!.when).toBe(TWO.when + 1)
  }, 600_000)
})
