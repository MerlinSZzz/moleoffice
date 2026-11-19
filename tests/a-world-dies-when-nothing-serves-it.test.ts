// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION P87, THIRD PART: A WORLD WHOSE ADDRESS ANSWERS NOTHING IS DEAD, AND THE ROW SAYS WHY.
 *
 * Criterion P87 of design/permissions/ACCEPTANCE.md: a world started by `tools/isolated-mole-office.mjs`
 * is one row in the office's worlds table, and *the row says it died when it is stopped or its
 * processes are gone*. Measured on the owner's office on 12 September 2026: row `ReRdV7xrih9G`, born
 * the previous afternoon, read `diedAt: null` and `ss -ltn` showed nothing listening on its port.
 *
 * The generic death check, `aWorldEndsWhenNothingIsServingIt` in lib/resources.ts, only fires for a
 * world whose process reached this office's ledger. A world whose process never did — the tool writes
 * process rows only with `--show-to-the-person` — stayed alive on the list for ever. This is the
 * reader that asks the address instead, from src/config/world-address.mjs. `tools/close-worlds-nobody-serves.mjs`
 * uses the same reader, but the tick and the tool do not reach the same verdict: the tick skips the
 * office's own world and needs two refusals in a row, while the tool is one-shot and still asks the
 * office's own address. Those two rules are the tick's alone.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIX OF 22 SEPTEMBER 2026, WHICH THE T CASES BELOW MEASURE
 * ---------------------------------------------------------------------------------------
 *
 * `closeTheWorldsNothingIsServing` used to ask every live world, INCLUDING THE OFFICE'S OWN, through
 * `whoIsAt` with a two-second timeout, and close any world that did not answer as itself. The office
 * is one process, so whenever something held its event loop for more than two seconds the fetch to
 * itself timed out and the office closed its OWN home row. It happened on 22 September 2026 at
 * 08:48:00 and again at 16:25:10: GET /api/office/worlds listed no live home world for the database
 * 417b2af5dd06c9ee, and every list that reads "the office's home world" read a dead home.
 *
 * The rules this file measures:
 *   T1  the office's own world is never fetched and never closed;
 *   T2  a timeout is a failure to read, so the world stays live and the caller gets the reason;
 *   T3  a refused connection closes the world only on the second tick in a row, and the sentence
 *       says it was refused twice;
 *   T4  something answering as a different database closes the world at once, as before;
 *   T5  a tick reopens the dead home row of the timeout sentence, keeps the name it had, and deletes
 *       no row;
 *   T6  the tick logs a repair with the row id and the reason, as it logs closes and left-alones.
 *
 * THE MUTATION THIS FILE WAS ORIGINALLY WRITTEN AGAINST: remove the death reader and the dead world
 * stays open. The T cases name their own mutation beside each one.
 */
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { whoIsAt, WORLD_ASKS } from '../src/config/world-address.mjs'
import { settingNamed } from '../src/config/settings.mjs'

type OfficeLib = typeof import('../src/server/lib/office.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let office: OfficeLib
let world: WorldLib
/**
 * The identity of THIS test's throwaway database. The office's own world is the world whose
 * database identity equals this one, so the tests about the office's own row need the real value
 * rather than an invented string.
 */
let here: string

beforeAll(async () => {
  t = await freshDb()
  office = await import('../src/server/lib/office.ts')
  world = await import('../src/server/lib/world.ts')
  const said = world.theWorldThisDatabaseIs()
  if (said === null) throw new Error('the test database has no identity, so the office cannot be placed in it')
  here = said
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // THE WORLDS TABLE STARTS EMPTY, as it did when each case made its own database. Every row here
  // is one a case registered, and the sweeps read every live row.
  t.client.sqlite.prepare('DELETE FROM worlds').run()
})

/** What a world says about itself when it comes to register, with the parts a test does not vary. */
function aWorld(overrides: Partial<Parameters<OfficeLib['registerWorldHere']>[0]> = {}): Parameters<
  OfficeLib['registerWorldHere']
>[0] {
  return {
    name: 'a test world',
    purpose: 'the check panel on a run that was refused',
    kind: 'agent-made',
    startedBy: { kind: 'agent', id: 'builder-cw' },
    checkout: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/c-worlds`,
    head: '546d00f',
    databaseIdentity: 'bbbbbbbbbbbbbbbb',
    address: 'http://127.0.0.1:46107',
    addressForOtherMachines: null,
    standing: 'scratch',
    parentWorld: null,
    installation: 'an-installation',
    ...overrides,
  }
}

/** The office's own address: the product's default port, read where src/config/settings.mjs declares it. */
const THE_OFFICES_OWN_ADDRESS = `http://127.0.0.1:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`

/** The office's own home row, on the address the office answers on. */
function theHomeRow(overrides: Partial<Parameters<OfficeLib['registerWorldHere']>[0]> = {}): Parameters<
  OfficeLib['registerWorldHere']
>[0] {
  return aWorld({
    kind: 'home',
    databaseIdentity: here,
    name: 'my world',
    address: THE_OFFICES_OWN_ADDRESS,
    ...overrides,
  })
}

/** A fetch that always fails as a refused connection, which is what nothing listening does. */
const nothingAnswers = (async () => {
  throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:46107'), { code: 'ECONNREFUSED' })
}) as unknown as typeof fetch

/** A fetch that fails the way a read that ran out of time fails. */
const aReadThatTimedOut = (async () => {
  throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'AbortError' })
}) as unknown as typeof fetch

/** A fetch that records every address it is asked and then refuses, so a test can see the asking. */
function recordingRefusals(seen: string[]): typeof fetch {
  return (async (url: string) => {
    seen.push(String(url))
    throw Object.assign(new Error(`connect ECONNREFUSED ${String(url)}`), { code: 'ECONNREFUSED' })
  }) as unknown as typeof fetch
}

/** A fetch that answers as the world whose identity it is given. */
function answersAs(identity: string): typeof fetch {
  return (async () =>
    new Response('{}', {
      status: 200,
      headers: {
        [WORLD_HEADER]: formatWorldHeader({
          database: identity,
          repository: '/somewhere',
          port: '46107',
          head: '546d00f',
          standing: 'scratch',
        }),
      },
    })) as unknown as typeof fetch
}

describe('a world whose address answers nothing is closed, with its sentence', () => {
  it('closes the row on the second refusal and says it was refused twice', async () => {
    const home = office.registerWorldHere(theHomeRow())
    const dead = office.registerWorldHere(aWorld())

    const first = await office.closeTheWorldsNothingIsServing({ fetchImpl: nothingAnswers })
    expect(first.closed).toEqual([])
    expect(first.leftAlone.some((one) => one.id === dead.id), JSON.stringify(first.leftAlone)).toBe(true)
    expect(office.worldById(dead.id)?.diedAt).toBeNull()

    const second = await office.closeTheWorldsNothingIsServing({ fetchImpl: nothingAnswers })
    expect(second.closed).toContain(dead.id)
    const read = office.worldById(dead.id)
    expect(read?.diedAt).not.toBeNull()
    expect(read?.diedBecause).toContain('refused twice')
    expect(read?.diedBecause).toContain('46107')
    expect(office.worldById(home.id)?.diedAt).toBeNull()
  })

  it('leaves a world that answers as itself exactly where it is', async () => {
    office.registerWorldHere(theHomeRow())
    const alive = office.registerWorldHere(aWorld())

    const closed = await office.closeTheWorldsNothingIsServing({ fetchImpl: answersAs('bbbbbbbbbbbbbbbb') })

    expect(closed.closed).toEqual([])
    expect(closed.leftAlone).toEqual([])
    expect(office.worldById(alive.id)?.diedAt).toBeNull()
  })

  it('says a port taken by another world ended this one, and names the other world', async () => {
    office.registerWorldHere(theHomeRow())
    const taken = office.registerWorldHere(aWorld())

    const closed = await office.closeTheWorldsNothingIsServing({ fetchImpl: answersAs('cccccccccccccccc') })

    expect(closed.closed).toContain(taken.id)
    const read = office.worldById(taken.id)
    expect(read?.diedBecause).toContain('cccccccccccccccc')
    expect(read?.diedBecause).toContain('bbbbbbbbbbbbbbbb')
  })

  it('leaves a world nobody gave an address alone, because there is nothing to ask', async () => {
    office.registerWorldHere(theHomeRow())
    const nowhere = office.registerWorldHere(aWorld({ address: null }))

    const closed = await office.closeTheWorldsNothingIsServing({ fetchImpl: nothingAnswers })

    expect(closed.closed).toEqual([])
    expect(office.worldById(nowhere.id)?.diedAt).toBeNull()
  })

  it('leaves a row that has already ended with the reason it already had', async () => {
    office.registerWorldHere(theHomeRow())
    const ended = office.registerWorldHere(aWorld())
    office.closeWorldHere(ended.id, 'the supervisor stopped its server')

    const closed = await office.closeTheWorldsNothingIsServing({ fetchImpl: nothingAnswers })

    expect(closed.closed).toEqual([])
    expect(office.worldById(ended.id)?.diedBecause).toBe('the supervisor stopped its server')
  })
})

describe('the tick never asks the office its own world, and a failure to read is not death', () => {
  /**
   * T1. The mutation this catches: take out the own-world skip in `closeTheWorldsNothingIsServing`
   * (the line `if (here !== null && world.databaseIdentity === here) continue`) — the recorder then
   * sees the office's own address, and the home row is fetched and can be closed.
   */
  it('T1 never fetches the office its own address, and leaves the home row live', async () => {
    const home = office.registerWorldHere(theHomeRow())
    const other = office.registerWorldHere(aWorld())
    const seen: string[] = []

    const done = await office.closeTheWorldsNothingIsServing({ fetchImpl: recordingRefusals(seen) })

    expect(seen.some((url) => url.startsWith(THE_OFFICES_OWN_ADDRESS)), `the office asked its own address: ${seen.join('; ')}`).toBe(false)
    expect(seen.some((url) => url.includes('46107')), `nothing was asked at all: ${seen.join('; ')}`).toBe(true)
    expect(office.worldById(home.id)?.diedAt).toBeNull()
    expect(office.worldById(other.id)?.diedAt).toBeNull()
  })

  /**
   * T2. The mutation this catches: close a world on any failure rather than leaving it alone, or
   * classify an abort as a refusal — either way the world ends up closed or the reason stops saying
   * the read timed out.
   */
  it('T2 leaves a world live when the read timed out, and reports the timeout reason', async () => {
    office.registerWorldHere(theHomeRow())
    const slow = office.registerWorldHere(aWorld())

    const done = await office.closeTheWorldsNothingIsServing({ fetchImpl: aReadThatTimedOut })

    expect(done.closed).not.toContain(slow.id)
    expect(office.worldById(slow.id)?.diedAt).toBeNull()
    const said = done.leftAlone.find((one) => one.id === slow.id)
    expect(said?.why, JSON.stringify(done.leftAlone)).toContain('timed out')
  })

  /**
   * T3. The mutation this catches: close on the first refusal instead of the second — the first
   * tick then closes the world and the "still live after one tick" assertion goes red.
   */
  it('T3 closes on the second refusal in a row and not the first', async () => {
    office.registerWorldHere(theHomeRow())
    const refused = office.registerWorldHere(aWorld())

    const first = await office.closeTheWorldsNothingIsServing({ fetchImpl: nothingAnswers })
    expect(first.closed).toEqual([])
    expect(office.worldById(refused.id)?.diedAt).toBeNull()
    expect(first.leftAlone.find((one) => one.id === refused.id)?.why).toContain('first refusal')

    const second = await office.closeTheWorldsNothingIsServing({ fetchImpl: nothingAnswers })
    expect(second.closed).toContain(refused.id)
    const read = office.worldById(refused.id)
    expect(read?.diedAt).not.toBeNull()
    expect(read?.diedBecause).toContain('refused twice in a row')
  })

  /**
   * T4. The mutation this catches: leave a world alone when something answers as another database —
   * the row then stays live and the assertion that it closed goes red.
   */
  it('T4 closes at once when something answers as a different database', async () => {
    office.registerWorldHere(theHomeRow())
    const taken = office.registerWorldHere(aWorld())

    const done = await office.closeTheWorldsNothingIsServing({ fetchImpl: answersAs('cccccccccccccccc') })

    expect(done.closed).toContain(taken.id)
    const read = office.worldById(taken.id)
    expect(read?.diedAt).not.toBeNull()
    expect(read?.diedBecause).toContain('answering for the database cccccccccccccccc')
    expect(read?.diedBecause).toContain('not bbbbbbbbbbbbbbbb')
  })

  /**
   * T5. The mutation this catches: append anything to the name when
   * `makeSureThisOfficesHomeRowIsAlive` reopens the row — the reopened name then stops being exactly
   * the name the person chose, and the equality below goes red. The name used here is longer than
   * the 27 characters the old marker left, so a truncating rename is caught too.
   */
  it('T5 reopens the dead home row of the timeout sentence, keeps its name, and deletes no row', async () => {
    const chosen = 'the name I chose for my own office world'
    const dead = office.registerWorldHere(theHomeRow({ name: chosen }))
    office.closeWorldHere(
      dead.id,
      `nothing serves this world any more: nothing answered at ${THE_OFFICES_OWN_ADDRESS} (The operation was aborted due to timeout)`,
    )
    const diedAt = office.worldById(dead.id)?.diedAt
    expect(office.liveWorldOf(here)).toBeNull()
    const rowsBefore = office.worldsHere().length

    const done = office.makeSureThisOfficesHomeRowIsAlive()

    expect(done.repaired).toBe(true)
    // THE ANSWER NAMES THE ROW, WHEN IT DIED AND WITH WHAT SENTENCE, so a caller can log the repair
    // without reading the table again.
    expect(done.why).toContain(dead.id)
    expect(done.why).toContain(String(diedAt))
    expect(done.why).toContain('The operation was aborted due to timeout')
    const live = office.liveWorldOf(here)
    expect(live?.kind).toBe('home')
    expect(live?.id).toBe(dead.id)
    expect(live?.name).toBe(chosen)
    expect(office.worldsHere().length).toBe(rowsBefore)
  })

  /**
   * T6. The mutation this catches: drop the repair log in `sweepTheWorldsAndSayWhatHappened` (the
   * line `if (repair.repaired) log(...)`) — the office reopens the row a person reads and says
   * nothing, so no log line names the row.
   */
  it('T6 logs the repair, with the row id and the reason', async () => {
    const reminders = await import('../src/server/lib/reminders.ts')
    const dead = office.registerWorldHere(theHomeRow())
    office.closeWorldHere(
      dead.id,
      `nothing serves this world any more: nothing answered at ${THE_OFFICES_OWN_ADDRESS} (The operation was aborted due to timeout)`,
    )
    const lines: string[] = []

    await reminders.sweepTheWorldsAndSayWhatHappened((line) => lines.push(line))

    expect(office.liveWorldOf(here)?.id).toBe(dead.id)
    const repairLine = lines.find((line) => line.includes(dead.id))
    expect(repairLine, `no log line named the repaired row: ${lines.join(' | ')}`).toBeDefined()
    expect(repairLine).toContain('timeout')
  })
})

describe('the reader asks a silent address twice, and takes a refusal at its word', () => {
  /**
   * THE TICK ABOVE THIS ALREADY REFUSES TO ACT ON ONE SILENCE. These cases are the same care one
   * level down, in the reader itself, and they are here for the caller that has no ticks:
   * `tools/close-worlds-nobody-serves.mjs` runs once, by hand, and whatever this reader hands it is
   * all it will ever know. On the night of 22 September 2026, with forty agents working, the live
   * office missed two-second reads of its own worlds.
   */
  it('asks again when the first read timed out, and answers on the second', async () => {
    const asked: string[] = []
    const missesOnce = (async (url: string) => {
      asked.push(String(url))
      if (asked.length === 1) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'AbortError' })
      return new Response('{}', {
        status: 200,
        headers: {
          [WORLD_HEADER]: formatWorldHeader({
            database: 'bbbbbbbbbbbbbbbb',
            repository: '/somewhere',
            port: '46107',
            head: '546d00f',
            standing: 'scratch',
          }),
        },
      })
    }) as unknown as typeof fetch

    const who = await whoIsAt('http://127.0.0.1:46107', { fetchImpl: missesOnce, gapMs: 0 })

    expect(asked, 'a silent address was asked only once').toHaveLength(2)
    expect(who.answering, 'a world that answered the second time was reported as silent').toBe(true)
  })

  it('hands a refused connection back on the first ask, so the tick counts ticks and not asks', async () => {
    const asked: string[] = []

    const who = await whoIsAt('http://127.0.0.1:46107', { fetchImpl: recordingRefusals(asked), gapMs: 0 })

    expect(asked, 'a refusal is an answer and must not be asked again').toHaveLength(1)
    expect(who.answering).toBe(false)
    expect(who.answering === false && who.failure).toBe('refused')
  })

  it('says how many times it asked when the silence stands', async () => {
    const asked: string[] = []
    const alwaysTimesOut = (async (url: string) => {
      asked.push(String(url))
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'AbortError' })
    }) as unknown as typeof fetch

    const who = await whoIsAt('http://127.0.0.1:46107', { fetchImpl: alwaysTimesOut, gapMs: 0 })

    expect(asked).toHaveLength(WORLD_ASKS)
    expect(who.answering).toBe(false)
    expect(who.why, 'the sentence does not say it was asked more than once').toContain('asked 2 times')
    expect(who.answering === false && who.failure, 'a silence that stands is still a timeout').toBe('timeout')
  })
})
