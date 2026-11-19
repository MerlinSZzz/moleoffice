// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C2: THE OFFICE, AND THE FILE THAT MIRRORS IT.
 *
 * `design/messages/ACCEPTANCE.md` section 8: a mechanism was missing, a bridge like a foreign affairs
 * office, which says which worlds there are; and a world appearing or disappearing should be
 * recorded. A desk that answers which worlds there are and records a world appearing and
 * disappearing.
 *
 * What is proved here:
 *
 *   1. the office holds a row per world with every fact C2 names;
 *   2. a second server on one database is the same world, not a second one;
 *   3. a world that died and started again gets a new row, so the history is kept;
 *   4. closing a world keeps the row and the reason, and a second close does not overwrite it;
 *   5. the office writes the mirror after every change, and only an office writes one;
 *   6. a world that is not the office reads the mirror, and says the list came from it.
 */
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { buildTheFirstOfficeInAHook, apiApp, freshDb, type TestDb } from './helpers.ts'
import type { Mirror, World } from '../src/shared/worlds.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

type OfficeLib = typeof import('../src/server/lib/office.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let office: OfficeLib
let world: WorldLib

beforeAll(async () => {
  t = await freshDb()
  office = await import('../src/server/lib/office.ts')
  world = await import('../src/server/lib/world.ts')
}, 60_000)

afterAll(() => {
  // The mirror is written beside the database, and `close()` removes that directory with it.
  t.close()
})

beforeEach(() => {
  // THE WORLD ROWS ARE THE WHOLE OFFICE THIS FILE READS, and each case counts them exactly. Taking
  // the table back to no rows and removing the mirror is what a fresh database gave each case
  // before, and every reading below still runs over every row that is there.
  t.client.sqlite.exec('DELETE FROM worlds')
  rmSync(office.mirrorBesideThisDatabase(), { force: true })
  world.forgetTheWorld()
})

/** What a world says about itself when it comes to register, with the parts a test does not vary. */
function aWorld(overrides: Partial<Parameters<OfficeLib['registerWorldHere']>[0]> = {}): Parameters<
  OfficeLib['registerWorldHere']
>[0] {
  return {
    name: 'my world',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    head: '905d1df',
    databaseIdentity: 'aaaaaaaaaaaaaaaa',
    address: 'http://127.0.0.1:41400',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'an-installation',
    ...overrides,
  }
}

describe('the office holds every world, with the facts the criterion names', () => {
  it('writes a row carrying all fifteen of them, and hands it back', () => {
    const registered = office.registerWorldHere(aWorld())
    expect(registered.name).toBe('my world')
    expect(registered.kind).toBe('home')
    expect(registered.startedBy).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })
    expect(registered.checkout).toBe(`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`)
    expect(registered.head).toBe('905d1df')
    expect(registered.databaseIdentity).toBe('aaaaaaaaaaaaaaaa')
    expect(registered.address).toBe('http://127.0.0.1:41400')
    expect(registered.standing).toBe('canonical')
    expect(registered.parentWorld).toBeNull()
    expect(registered.bornAt).not.toBe('')
    expect(registered.diedAt).toBeNull()
    expect(registered.diedBecause).toBeNull()
    expect(registered.installation).toBe('an-installation')
    expect(office.worldsHere().map((w) => w.id)).toEqual([registered.id])
  })

  it('treats a second server on one database as the same world, and brings its address up to date', () => {
    const first = office.registerWorldHere(aWorld())
    const second = office.registerWorldHere(aWorld({ address: 'http://127.0.0.1:41401', head: 'abcdef1' }))
    expect(second.id).toBe(first.id)
    expect(second.address).toBe('http://127.0.0.1:41401')
    expect(second.head).toBe('abcdef1')
    expect(office.worldsHere()).toHaveLength(1)
  })

  it('gives a world that died and started again a new row, so both appearances are kept', () => {
    const first = office.registerWorldHere(aWorld())
    office.closeWorldHere(first.id, 'the supervisor stopped its server')
    const second = office.registerWorldHere(aWorld())
    expect(second.id).not.toBe(first.id)
    expect(office.worldsHere()).toHaveLength(2)
    const dead = office.worldById(first.id)
    expect(dead?.diedAt).not.toBeNull()
    expect(dead?.diedBecause).toBe('the supervisor stopped its server')
  })

  it('refuses a world whose database has no identity, because nothing could find the row again', () => {
    expect(() => office.registerWorldHere(aWorld({ databaseIdentity: '   ' }))).toThrow(/identity of its database/)
  })

  it('keeps the reason the first thing to notice gave, when a second thing closes it again', () => {
    const born = office.registerWorldHere(aWorld())
    office.closeWorldHere(born.id, 'the supervisor stopped its server')
    office.closeWorldHere(born.id, 'the stray sweep found nothing on its port')
    expect(office.worldById(born.id)?.diedBecause).toBe('the supervisor stopped its server')
  })

  it('refuses to close a world with no reason, because a row saying only that it ended is a puzzle', () => {
    const born = office.registerWorldHere(aWorld())
    expect(() => office.closeWorldHere(born.id, '   ')).toThrow(/closes with a reason/)
  })

  it('renames a world without changing what it is', () => {
    const born = office.registerWorldHere(aWorld())
    const renamed = office.renameWorldHere(born.id, 'the machine under the desk')
    expect(renamed.name).toBe('the machine under the desk')
    expect(renamed.databaseIdentity).toBe(born.databaseIdentity)
    expect(renamed.id).toBe(born.id)
  })
})

describe('the mirror is written by the office, after every change', () => {
  it('writes nothing at all until this database holds the home world', () => {
    expect(office.theOfficeIsInThisDatabase()).toBe(false)
    office.registerWorldHere(aWorld({ kind: 'agent-made', databaseIdentity: 'bbbbbbbbbbbbbbbb' }))
    expect(office.theOfficeIsInThisDatabase()).toBe(false)
    expect(existsSync(office.mirrorBesideThisDatabase())).toBe(false)
  })

  it('writes the file the moment a home world is registered, and again on every change', () => {
    const born = office.registerWorldHere(aWorld())
    expect(office.theOfficeIsInThisDatabase()).toBe(true)
    const path = office.mirrorBesideThisDatabase()
    expect(existsSync(path)).toBe(true)
    const first = JSON.parse(readFileSync(path, 'utf8')) as Mirror
    expect(first.worlds.map((w) => w.name)).toEqual(['my world'])
    expect(first.writtenAt).not.toBe('')

    office.renameWorldHere(born.id, 'the machine under the desk')
    const second = JSON.parse(readFileSync(path, 'utf8')) as Mirror
    expect(second.worlds.map((w) => w.name)).toEqual(['the machine under the desk'])

    office.closeWorldHere(born.id, 'the supervisor stopped its server')
    const third = JSON.parse(readFileSync(path, 'utf8')) as Mirror
    expect(third.worlds[0]?.diedBecause).toBe('the supervisor stopped its server')
  })

  it('says which world wrote it, so a reader knows whose list this is', () => {
    office.registerWorldHere(aWorld())
    const mirror = JSON.parse(readFileSync(office.mirrorBesideThisDatabase(), 'utf8')) as Mirror
    expect(mirror.writtenBy).toBe(world.theWorldThisDatabaseIs())
  })
})

describe('a world that is not the office says where its list came from', () => {
  /**
   * THE MIRROR THIS TEST READS IS ONE IT WROTE ITSELF, in the directory `freshDb` already makes and
   * deletes, and the reading is asked for by hand.
   *
   * IT USED TO BE THE FILE `mirrorBesideTheCanonicalDatabase()` NAMES, and in the live checkout
   * that is the owner's own `data/worlds.json`: this test wrote over it and then deleted it, and
   * the only reason it never did is that the assertion above the write failed first. A test that
   * reaches for the declaration's canonical path is a test reaching into whatever installation it
   * happens to be run in. Problem `JTdajUUs23_M`.
   */
  it('reads the mirror when it is handed one, and names the moment it was written', async () => {
    // The office writes its mirror beside its own database. This test takes a real mirror off an
    // office, then works in a database that never held a home world — which is exactly what a
    // scratch world beside a canonical stack is.
    office.registerWorldHere(aWorld())
    const written = readFileSync(office.mirrorBesideThisDatabase(), 'utf8')
    rmSync(office.mirrorBesideThisDatabase(), { force: true })
    t.client.sqlite.prepare('DELETE FROM worlds').run()
    const mine = office.registerWorldHere(aWorld({ kind: 'agent-made', name: "builder-au's citizens" }))

    const { whatTheOfficeSays } = await import('../src/server/api/office.ts')
    const alone = whatTheOfficeSays()
    expect(alone.isTheOffice).toBe(false)
    expect(alone.from).toBe('this world alone')
    // Its own rows, not an empty list: a world always knows about itself.
    expect(alone.worlds.map((w) => w.id)).toEqual([mine.id])

    const { writeFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const where = join(dirname(office.mirrorBesideThisDatabase()), 'the-office-mirror.json')
    writeFileSync(where, written, 'utf8')
    const fromMirror = whatTheOfficeSays({ file: where, why: 'this test handed the reading its own file' })
    expect(fromMirror.from).toBe('the mirror')
    expect(fromMirror.mirrorWrittenAt).not.toBeNull()
    expect(fromMirror.worlds.map((w) => w.name)).toEqual(['my world'])
    expect(fromMirror.mirrorFile).toBe(where)
    expect(fromMirror.mirrorNote).toContain('its own file')
  })
})

/**
 * A WORLD A TEST RUNNER STARTED READS NO LIST BUT ITS OWN, and this is the half of that rule on the
 * reading side. The writing side has said it since C3: `reportThisWorldToTheOffice` refuses to tell
 * the declared office anything. Until 4 September 2026 the reading side said nothing, so a server
 * the suite started in the live checkout answered `GET /api/office/worlds` with the ten worlds of
 * the person using the machine — read straight out of their `data/worlds.json`.
 */
describe('a world a test runner started has no business with the office the declaration names', () => {
  it('looks for no mirror at all, and says that is why', () => {
    const may = office.theMirrorThisWorldMayRead()
    expect(may.file).toBeNull()
    expect(may.why).toContain('test runner')
    expect(may.why).toContain('own')
  })

  it('gives the same reason to a world reporting itself as to a world reading the list', async () => {
    // ONE RULE, ASKED TWICE, AND BOTH ANSWERS HELD HERE. Two copies of it could drift apart with
    // nothing failing, which is the defect CLAUDE.md names at the top of the file — and the first
    // version of this test held only the reading side, so a mutation that rewrote the reporting
    // side's sentence went through green.
    const said = office.whyTheDeclaredOfficeIsNotThisWorlds()
    expect(said).not.toBeNull()
    expect(office.theMirrorThisWorldMayRead().why).toBe(said)
    const mine = office.registerWorldHere(aWorld({ kind: 'test', name: 'a test world' }))
    const reported = await office.reportThisWorldToTheOffice(mine)
    expect(reported.told).toBe(false)
    expect(reported.why).toBe(said)
  })

  it('answers from its own table, naming no file, however the declaration is set up', async () => {
    const mine = office.registerWorldHere(aWorld({ kind: 'test', name: 'a test world' }))
    const { whatTheOfficeSays } = await import('../src/server/api/office.ts')
    const said = whatTheOfficeSays()
    expect(said.from).toBe('this world alone')
    expect(said.mirrorFile).toBeNull()
    expect(said.mirrorNote).toContain('test runner')
    expect(said.worlds.map((w) => w.id)).toEqual([mine.id])
  })

  it('reads nothing when it is handed no file, rather than falling back to a path of its own', () => {
    expect(office.readTheMirror(null)).toBeNull()
  })

  /**
   * AND THE DEATH IS REFUSED BY THE SAME RULE AS THE BIRTH.
   *
   * A world tells the office it has ended on the way down — problem `JTdajUUs23_M`, where nine
   * worlds that had reported their birth and never their death were sitting open in the owner's
   * office. Under a test runner that report is refused for exactly the reason the birth report is,
   * and this holds the two answers against one sentence so they cannot drift apart.
   *
   * WHAT THIS CANNOT REACH, said rather than papered over: the report itself. Both functions are
   * refused before they open a socket whenever a test runner is what started the process, which is
   * the point of them, so no test in this suite can watch one succeed. What IS driven end to end is
   * the pair of routes they use — `POST /api/office/worlds` handing back the id, and
   * `POST /api/office/worlds/:id/close` closing that id — in
   * tests/the-tools-read-the-office.test.ts, against a real server over a real socket.
   */
  it('refuses to report a death for the same reason it refuses to report a birth', async () => {
    const mine = office.registerWorldHere(aWorld({ kind: 'test', name: 'a test world' }))
    const said = office.whyTheDeclaredOfficeIsNotThisWorlds()
    const death = await office.reportThisWorldsDeathToTheOffice(mine.id, 'the server was stopped')
    expect(death.told).toBe(false)
    expect(death.why).toBe(said)
  })
})

/**
 * A COPY OF THE MAIN WORLD'S DATABASE IS NOT A SECOND WORLD, AND THE OFFICE SAYS SO.
 *
 * A world is a database, and a database's identity is its path and its birthtime, so a copy is a
 * different world. But a copy carries the original's rows — home row included — so it opens
 * believing it is the office and answers about worlds none of which is itself. This happened
 * once: a copy of a live database could not serve as a second world, and nothing on any screen
 * said why. An empty one had to be started instead.
 *
 * THE READING IS THE TWO IDENTITIES SIDE BY SIDE and nothing else: which database the home row is
 * about, and which database is answering.
 */
describe('a database that holds another database’s home row', () => {
  it('says which database that home row is about', () => {
    const here = world.theWorldThisDatabaseIs()
    if (here === null) throw new Error('this test database has no identity')
    // EXACTLY WHAT A COPY HOLDS: the original's home row, naming the original's database.
    office.registerWorldHere(aWorld({ kind: 'home', name: 'my world', databaseIdentity: 'ffffffffffffffff' }))
    expect(office.theHomeRowOfAnotherDatabase()).toBe('ffffffffffffffff')
    // AND IT STILL BELIEVES IT IS THE OFFICE, which is the whole trouble.
    expect(office.theOfficeIsInThisDatabase()).toBe(true)
  })

  it('says nothing when the home row is this database’s own', () => {
    const here = world.theWorldThisDatabaseIs()
    if (here === null) throw new Error('this test database has no identity')
    office.registerWorldHere(aWorld({ kind: 'home', name: 'my world', databaseIdentity: here }))
    expect(office.theHomeRowOfAnotherDatabase()).toBeNull()
  })

  it('says nothing when there is no home row at all', () => {
    office.registerWorldHere(aWorld({ kind: 'agent-made', databaseIdentity: 'cccccccccccccccc' }))
    expect(office.theHomeRowOfAnotherDatabase()).toBeNull()
  })

  it('puts it on the office’s own reply, beside the database that is answering', async () => {
    const here = world.theWorldThisDatabaseIs()
    office.registerWorldHere(aWorld({ kind: 'home', name: 'my world', databaseIdentity: 'ffffffffffffffff' }))
    const { whatTheOfficeSays } = await import('../src/server/api/office.ts')
    const said = whatTheOfficeSays()
    expect(said.theHomeRowBelongsTo).toBe('ffffffffffffffff')
    expect(said.thisWorld).toBe(here)
    expect(said.thisWorld, 'a reader cannot compare the two if they are the same field').not.toBe(
      said.theHomeRowBelongsTo,
    )
  })
})

/**
 * A WORLD SAYS BOTH ITS ADDRESSES, AND THE OFFICE KEEPS BOTH.
 *
 * A world binds loopback always, and a second door when it declares
 * `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES`. The office held only the first, so a person opening
 * Mole Office from another machine read a list of worlds every one of which said 127.0.0.1 — an
 * address that means "this computer", and on another machine it is a different computer. Enter
 * answered "Failed to fetch". Problem `5mG-KxUAXObJ`.
 */
describe('the two addresses a world has', () => {
  it('keeps the one another machine reaches beside the loopback one', () => {
    const said = office.registerWorldHere(
      aWorld({ address: 'http://127.0.0.1:29840', addressForOtherMachines: 'http://192.0.2.10:29840' }),
    )
    expect(said.address).toBe('http://127.0.0.1:29840')
    expect(said.addressForOtherMachines).toBe('http://192.0.2.10:29840')
    expect(office.worldById(said.id)?.addressForOtherMachines).toBe('http://192.0.2.10:29840')
  })

  it('says null for a world that opens no door another machine can reach', () => {
    const said = office.registerWorldHere(aWorld({ address: 'http://127.0.0.1:29840' }))
    expect(said.addressForOtherMachines).toBeNull()
  })

  it('brings both up to date when the same world registers again', () => {
    const first = office.registerWorldHere(aWorld({ address: 'http://127.0.0.1:29840' }))
    const again = office.registerWorldHere(
      aWorld({ address: 'http://127.0.0.1:29841', addressForOtherMachines: 'http://192.0.2.10:29841' }),
    )
    expect(again.id, 'the same database is the same world').toBe(first.id)
    expect(again.address).toBe('http://127.0.0.1:29841')
    expect(again.addressForOtherMachines).toBe('http://192.0.2.10:29841')
  })

  it('takes both through the door a world registers at', async () => {
    const built = await apiApp()
    try {
      const made = await built.app.inject({
        method: 'POST',
        url: '/api/office/worlds',
        headers: {
          'content-type': 'application/json',
          'x-mole-office-workspace': 'default',
          'x-mole-office-actor-type': 'agent',
          'x-mole-office-actor-id': 'mole-office/the-api-server',
        },
        payload: {
          name: `${THE_TEST_OFFICES_SECRETARY.name}'s visiting test 11`,
          kind: 'agent-made',
          databaseIdentity: 'dddddddddddddddd',
          address: 'http://127.0.0.1:29840',
          addressForOtherMachines: 'http://192.0.2.10:29840',
          standing: 'scratch',
          installation: 'this-installation',
        },
      })
      expect(made.statusCode).toBe(201)
      expect((made.json() as { world: World }).world.addressForOtherMachines).toBe('http://192.0.2.10:29840')

      const listed = await built.app.inject({
        method: 'GET',
        url: '/api/office/worlds',
        headers: { 'x-mole-office-workspace': 'default' },
      })
      const mine = (listed.json() as { worlds: World[] }).worlds.find((one) => one.databaseIdentity === 'dddddddddddddddd')
      expect(mine?.addressForOtherMachines, 'the office lists only one of the two').toBe('http://192.0.2.10:29840')
    } finally {
      await built.app.close()
    }
  })
})
