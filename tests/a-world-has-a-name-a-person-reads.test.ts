// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C5: NAMES.
 *
 * `design/messages/ACCEPTANCE.md` section 8: the home world is called "my world" by default, and a person
 * may name it freely. So a home world is called "my world" until the owner renames it,
 * an agent-made world is "<agent handle>'s <purpose>", a test world is named after its test file,
 * and the hash stays the identity through all of it.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import {
  DEFAULT_HOME_WORLD_NAME,
  WORLD_NAME_MAX,
  agentMadeWorldName,
  isTheNameAServerGaveItself,
  testWorldName,
  whyWorldNameIsRefused,
  type World,
} from '../src/shared/worlds.ts'
import { worldKindWord, worldStandingWord } from '../src/shared/words.ts'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { worldNameOnThePage } from '../src/web/lib/server-sentences.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

type OfficeLib = typeof import('../src/server/lib/office.ts')
type RegisterLib = typeof import('../src/server/lib/register-this-server.ts')

let t: TestDb
let office: OfficeLib
let register: RegisterLib
let world: typeof import('../src/server/lib/world.ts')

const ACTOR = { type: 'agent', id: 'builder-au' } as const

/**
 * ONE OFFICE FOR THE FILE. A world is one office-wide row rather than a project, so a case must
 * start with no world: the reset after every case removes the rows it wrote and forgets the world
 * this process read. That is the state the first case measures and the state every case about a
 * naming, a renaming or a stopped and restarted world assumes.
 */
beforeAll(async () => {
  t = await freshDb()
  office = await import('../src/server/lib/office.ts')
  register = await import('../src/server/lib/register-this-server.ts')
  world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  world.forgetTheWorld()
})

afterEach(() => {
  t.client.sqlite.prepare('DELETE FROM worlds').run()
  world.forgetTheWorld()
})

describe('the names the criterion gives each kind of world', () => {
  it("names an agent-made world after the agent and what it came to do", () => {
    expect(agentMadeWorldName('builder-au', 'citizens')).toBe("builder-au's citizens")
  })

  it('names one after the agent alone when nothing said what it is for, rather than inventing a purpose', () => {
    expect(agentMadeWorldName('builder-au', null)).toBe("builder-au's world")
    expect(agentMadeWorldName('builder-au', '   ')).toBe("builder-au's world")
  })

  it('names a test world after its test', () => {
    expect(testWorldName('the-office-page')).toBe('the-office-page')
  })

  it('says a test with no name of its own is a test, rather than leaving the name empty', () => {
    expect(testWorldName('')).toBe('a test')
  })

  it('cuts a name at the length a row can draw, rather than letting one push every row apart', () => {
    const long = agentMadeWorldName('builder-au', 'x'.repeat(200))
    expect(long.length).toBe(WORLD_NAME_MAX)
  })
})

describe("an agent-made world's name is drawn in the page's language", () => {
  // PROBLEM E73Do6DbqZCH, ITEM 6. The agent page's 世界 line drew "mole-office/the-api-server's world" on a Chinese
  // page: the name is stored in English by `agentMadeWorldName`. The page draws it in its own language, Developer
  // mode draws what is stored, and a name the server did not make is drawn as it was written. Mutations: the page
  // drawing the stored name whatever the language turns the first case red; Developer mode drawn in the page's
  // language turns the second red.
  const SERVERS = "mole-office/the-api-server's world"
  afterEach(() => setWordLanguage('en'))

  it('says the stored English on an English page, and the same thing in Chinese on a Chinese page', () => {
    setWordLanguage('en')
    expect(worldNameOnThePage(SERVERS, 'agent-made', false)).toBe(SERVERS)
    expect(worldNameOnThePage("builder-au's citizens", 'agent-made', false)).toBe("builder-au's citizens")
    setWordLanguage('zh')
    expect(worldNameOnThePage(SERVERS, 'agent-made', false)).toBe('mole-office/the-api-server 的世界')
    // THE PURPOSE IS THE RUN'S OWN WORD and is drawn as it came; only the frame around it is the page's.
    expect(worldNameOnThePage("builder-au's citizens", 'agent-made', false)).toBe('builder-au 的 citizens')
  })

  it('draws the stored name in Developer mode, and any name the server did not make as it was written', () => {
    for (const language of ['en', 'zh'] as const) {
      setWordLanguage(language)
      expect(worldNameOnThePage(SERVERS, 'agent-made', true)).toBe(SERVERS)
      expect(worldNameOnThePage('the bench rig', 'agent-made', false)).toBe('the bench rig')
      expect(worldNameOnThePage(SERVERS, 'home', false)).toBe(SERVERS)
      expect(worldNameOnThePage(DEFAULT_HOME_WORLD_NAME, 'home', false)).toBe(DEFAULT_HOME_WORLD_NAME)
    }
  })
})

describe('what is refused as a name, and why', () => {
  it('refuses an empty one, because a world with no name is a hash on a page', () => {
    expect(whyWorldNameIsRefused('   ')).toContain('needs a name')
  })

  it('refuses one longer than a row can draw, and says the number', () => {
    const said = whyWorldNameIsRefused('x'.repeat(WORLD_NAME_MAX + 1))
    expect(said).toContain(String(WORLD_NAME_MAX))
    expect(said).toContain(String(WORLD_NAME_MAX + 1))
  })

  it('accepts an ordinary one', () => {
    expect(whyWorldNameIsRefused('the machine under the desk')).toBeNull()
  })
})

describe('the hash stays the identity', () => {
  it('renames the world and changes nothing else about it', () => {
    const written = register.registerThisServer({
      workspaceId: 'default',
      sessionRecordId: t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: 'The run this test is',
        data: { state: 'running', runtime: 'vitest' },
        actor: ACTOR,
      }).id,
      actor: ACTOR,
    })
    const before = written.atTheOffice
    if (before === null) throw new Error('this server registered no world')

    const after = office.renameWorldHere(before.id, 'the machine under the desk')
    expect(after.name).toBe('the machine under the desk')
    expect(after.databaseIdentity).toBe(before.databaseIdentity)
    expect(after.kind).toBe(before.kind)
    expect(after.bornAt).toBe(before.bornAt)
    // And the world is still found by its database, which is what "the hash stays the identity" is.
    expect(office.liveWorldOf(before.databaseIdentity)?.id).toBe(before.id)
  })

  it('names an agent-made world from the agent that registered it and what it said it was doing', async () => {
    // Through the route, which is the path an agent's server takes: `detail` is what that caller
    // says the run is for, and it is the only word about a run's purpose this product has.
    const { apiApp } = await import('./helpers.ts')
    const app = (await apiApp()).app
    try {
      const filed = t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: 'The run this test is',
        data: { state: 'running', runtime: 'vitest' },
        actor: ACTOR,
      })
      const registered = await app.inject({
        method: 'POST',
        url: '/api/runtime/register',
        headers: {
          'x-mole-office-workspace': 'default',
          'x-mole-office-actor-type': 'agent',
          'x-mole-office-actor-id': 'builder-au',
          'x-mole-office-session': filed.id,
        },
        payload: { detail: 'citizens' },
      })
      expect(registered.statusCode).toBe(201)
      // This suite IS a test runner, so the world registers as a test world and takes the test's
      // name. What the agent-made naming does with the same input is asserted directly above.
      const live = office.worldsHere().find((one) => one.diedAt === null)
      expect(live?.kind).toBe('test')
      expect(live?.name).toBe(testWorldName('citizens'))
    } finally {
      await app.close()
    }
  })
})

describe('the words a person reads for a world', () => {
  it('reads every kind, and never hands back the stored word with a dash in it', () => {
    expect(worldKindWord('home').text).toBe('home')
    expect(worldKindWord('agent-made').text).toBe('an agent started it')
    expect(worldKindWord('test').text).toBe('a test started it')
    expect(worldKindWord('remote').text).toBe('on another machine')
  })

  it('names a kind nobody declared out loud rather than drawing it as one of the four', () => {
    const said = worldKindWord('a-kind-nobody-declared')
    expect(said.standing).toBe('unknown')
    expect(said.text).toContain('a-kind-nobody-declared')
  })

  it('reads both standings, and says when nothing was stored', () => {
    expect(worldStandingWord('canonical').text).toBe('the one you work in')
    expect(worldStandingWord('scratch').text).toBe('a scratch stack')
    expect(worldStandingWord(null).standing).toBe('absent')
  })
})

/**
 * AND SOMETHING FINALLY HANDS THE PURPOSE OVER.
 *
 * `agentMadeWorldName` has always been able to make `<handle>'s <purpose>`; nothing in the running
 * product ever gave it one. A server names its own world on the way up and has no purpose to give,
 * so every agent-made world was `<handle>'s world`, and the only caller that CAN give one —
 * `POST /api/runtime/register`, with `detail` — arrives after the row exists, where
 * `registerWorldHere` never renames a live row. The citizens verifier measured a register call
 * carrying `{"detail":"checking the citizens work"}` changing nothing at all. Problem
 * `0wPbeU5pdYW5`.
 *
 * THE WORLD IS HANDED IN RATHER THAN READ. Under a test runner every world this process registers
 * is a `test` world — the guard problem `JTdajUUs23_M` needed — so the agent-made path cannot be
 * reached through `registerThisServer` from inside the suite at all.
 */
describe('an agent-made world is named after what it was started for', () => {
  const AGENT = { type: 'agent', id: 'builder-au' } as const

  function aWorldStartedByAnAgent() {
    return {
      repository: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
      database: `${THE_TEST_FIXTURE_ROOT}/px-citizens/data/panelx.db`,
      databaseIdentity: 'eeeeeeeeeeeeeeee',
      port: 29841,
      head: '905d1df',
      standing: { kind: 'scratch' as const, because: ['its database is not the canonical one'] },
      readAt: '2026-09-04 12:00:00',
      saidBy: 'this test',
    }
  }

  it('takes the purpose from the registration that carries one', () => {
    const first = register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT })
    expect(first?.kind).toBe('agent-made')
    expect(first?.name, 'a server naming its own world has no purpose to give').toBe("builder-au's world")

    const said = register.registerThisWorld(aWorldStartedByAnAgent(), {
      actor: AGENT,
      detail: 'checking the citizens work',
    })
    expect(said?.id, 'the same database is the same world').toBe(first?.id)
    expect(said?.name).toBe("builder-au's checking the citizens work")
    expect(office.worldById(said?.id ?? '')?.name).toBe("builder-au's checking the citizens work")
  })

  it('leaves a name somebody chose alone, however many registrations carry a purpose', () => {
    const first = register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT })
    office.renameWorldHere(first?.id ?? '', 'the machine under the desk')
    const said = register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT, detail: 'something else' })
    expect(said?.name).toBe('the machine under the desk')
  })

  it('does not change the name again when a second registration carries a different purpose', () => {
    // OTHERWISE THE NAME MOVES UNDER A READER every time anything registers, which is a list that
    // cannot be read twice and got the same answer.
    register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT })
    register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT, detail: 'the first thing' })
    const said = register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT, detail: 'the second thing' })
    expect(said?.name).toBe("builder-au's the first thing")
  })

  it('gives a test world its test name and never a purpose', () => {
    const inATest = {
      ...aWorldStartedByAnAgent(),
      standing: { kind: 'scratch' as const, because: ['it was started by a test runner'] },
    }
    const said = register.registerThisWorld(inATest, { actor: AGENT, detail: 'a-test-file' })
    expect(said?.kind).toBe('test')
    expect(said?.name).toBe('a-test-file')
  })

  it('leaves the name alone when the registration carries nothing but spaces', () => {
    const first = register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT })
    const said = register.registerThisWorld(aWorldStartedByAnAgent(), { actor: AGENT, detail: '   ' })
    expect(said?.name).toBe(first?.name)
  })
})

/**
 * A NAME A PERSON GAVE SURVIVES THE STACK BEING STOPPED AND STARTED.
 *
 * The rule is that a person may name a world freely. `registerWorldHere` never renames a LIVE row, and that was the whole
 * of it until C3 gave a world a death: the row is closed on the way down, so the next start found no
 * live row, inserted a fresh one, and wrote the default name over the person's. The citizens
 * verifier measured it twice — `jamies world` and then `jamies own world`, both back to `my world`
 * after a stop and a start. Problem `RRC8NNCUl0jo`.
 *
 * AND THE ROWS ARE STILL ONE PER APPEARANCE, which is the other half of the rule:
 * every appearance and disappearance of a world is recorded. Reopening the closed row would have fixed the name and thrown the
 * history away.
 */
describe('a world keeps its name when it stops and starts again', () => {
  function aServerStarting(overrides: Partial<Parameters<OfficeLib['registerWorldHere']>[0]> = {}) {
    return {
      name: 'my world',
      kind: 'home' as const,
      startedBy: { kind: 'person' as const, id: THE_TEST_OFFICES_OWNER.id },
      checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      head: '905d1df',
      databaseIdentity: 'aaaaaaaaaaaaaaaa',
      address: 'http://127.0.0.1:41400',
      addressForOtherMachines: null,
      standing: 'canonical' as const,
      parentWorld: null,
      installation: 'this-installation',
      ...overrides,
    }
  }

  it('gives the new row the name the last one had, and keeps both rows', () => {
    const first = office.registerWorldHere(aServerStarting())
    office.renameWorldHere(first.id, `${THE_TEST_OFFICES_OWNER.id}s own world`)
    office.closeWorldHere(first.id, 'the dev supervisor was told to stop')

    const second = office.registerWorldHere(aServerStarting())
    expect(second.id, 'a world that died and started again gets a new row').not.toBe(first.id)
    expect(second.name).toBe(`${THE_TEST_OFFICES_OWNER.id}s own world`)
    expect(office.worldsHere()).toHaveLength(2)
    expect(office.worldById(first.id)?.diedAt, 'the appearance that ended must still say so').not.toBeNull()
  })

  it('keeps the second name when it has been renamed twice', () => {
    const first = office.registerWorldHere(aServerStarting())
    office.renameWorldHere(first.id, 'the machine under the desk')
    office.closeWorldHere(first.id, 'stopped')
    const second = office.registerWorldHere(aServerStarting())
    office.renameWorldHere(second.id, `${THE_TEST_OFFICES_OWNER.id}s own world`)
    office.closeWorldHere(second.id, 'stopped')
    const third = office.registerWorldHere(aServerStarting())
    expect(third.name).toBe(`${THE_TEST_OFFICES_OWNER.id}s own world`)
  })

  it('takes the name the registration gives when this database has never had a world', () => {
    const said = office.registerWorldHere(aServerStarting({ databaseIdentity: 'bbbbbbbbbbbbbbbb', name: 'a new one' }))
    expect(said.name).toBe('a new one')
  })

  it('keeps a name belonging to this database and not to another', () => {
    const mine = office.registerWorldHere(aServerStarting())
    office.renameWorldHere(mine.id, `${THE_TEST_OFFICES_OWNER.id}s own world`)
    office.closeWorldHere(mine.id, 'stopped')
    const theirs = office.registerWorldHere(aServerStarting({ databaseIdentity: 'cccccccccccccccc', name: 'my world' }))
    expect(theirs.name, 'one world took another world’s name').toBe('my world')
  })
})

/**
 * AND THE OFFICE IS TOLD WHAT THE WORLD IS FOR, because its own row is not a list anybody reads.
 *
 * The first fix wrote the purpose into the world's own `worlds` table and stopped there. A world
 * that is not the office answers `GET /api/office/worlds` from the mirror, so the citizens verifier
 * found the world's own table saying `mole-office/the-api-server's checking the citizens work` while
 * the office, and that world's own reply, both said `mole-office/the-api-server's world`. Every
 * agent-made world on every list a person reads was still `<handle>'s world`. Problem
 * `0wPbeU5pdYW5`, reopened.
 */
describe('the office learns what an agent-made world is for', () => {
  const AGENT = { type: 'agent', id: 'builder-au' } as const

  function theOfficesRow(name: string, over: Partial<World> = {}): World {
    return {
      id: 'the-office-row',
      name,
      kind: 'agent-made',
      startedBy: { kind: 'agent', id: 'builder-au' },
      checkout: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
      head: '905d1df',
      databaseIdentity: 'eeeeeeeeeeeeeeee',
      address: 'http://127.0.0.1:29841',
      addressForOtherMachines: null,
      standing: 'scratch',
      parentWorld: null,
      bornAt: '2026-09-04 12:00:00',
      diedAt: null,
      diedBecause: null,
      installation: 'this-installation',
      ...over,
    }
  }

  it('tells it when the office still holds the name the server gave itself', () => {
    const said = office.whetherTheOfficeShouldBeToldTheName(
      theOfficesRow("builder-au's world"),
      'eeeeeeeeeeeeeeee',
      "builder-au's checking the citizens work",
      AGENT.id,
    )
    expect(said.tell).toBe('the-office-row')
  })

  it('leaves a name somebody chose at the office alone, and says whose it is', () => {
    const said = office.whetherTheOfficeShouldBeToldTheName(
      theOfficesRow('the machine under the desk'),
      'eeeeeeeeeeeeeeee',
      "builder-au's checking the citizens work",
      AGENT.id,
    )
    expect(said.tell).toBeNull()
    expect(said.why).toContain('the machine under the desk')
    expect(said.why).toContain('nothing here may write over')
  })

  it('says nothing when the office already calls it that', () => {
    const said = office.whetherTheOfficeShouldBeToldTheName(
      theOfficesRow("builder-au's checking the citizens work"),
      'eeeeeeeeeeeeeeee',
      "builder-au's checking the citizens work",
      AGENT.id,
    )
    expect(said.tell).toBeNull()
    expect(said.why).toContain('already calls this world that')
  })

  it('says so when the office holds no open row for this world', () => {
    const said = office.whetherTheOfficeShouldBeToldTheName(
      undefined,
      'eeeeeeeeeeeeeeee',
      "builder-au's checking the citizens work",
      AGENT.id,
    )
    expect(said.tell).toBeNull()
    expect(said.why).toContain('no open row')
    expect(said.why).toContain('eeeeeeeeeeeeeeee')
  })

  it('asks the same question of the office’s row as of its own', () => {
    // ONE RULE, TWO TABLES. Two copies of "is this the name a server gave itself" could drift apart
    // with nothing failing, which is the defect CLAUDE.md names at the top of the file.
    expect(isTheNameAServerGaveItself("builder-au's world", 'builder-au')).toBe(true)
    expect(isTheNameAServerGaveItself("builder-au's citizens", 'builder-au')).toBe(false)
    expect(isTheNameAServerGaveItself('my world', 'builder-au')).toBe(false)
    // And it is what the local half asks: a world whose row already says a purpose keeps it.
    const mine = register.registerThisWorld(
      {
        repository: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
        database: `${THE_TEST_FIXTURE_ROOT}/px-citizens/data/panelx.db`,
        databaseIdentity: 'eeeeeeeeeeeeeeee',
        port: 29841,
        head: '905d1df',
        standing: { kind: 'scratch' as const, because: ['its database is not the canonical one'] },
        readAt: '2026-09-04 12:00:00',
        saidBy: 'this test',
      },
      { actor: AGENT, detail: 'the first thing' },
    )
    expect(isTheNameAServerGaveItself(mine?.name ?? '', AGENT.id)).toBe(false)
  })

  it('goes to the office by the same rule, and gives the office’s refusal back word for word', async () => {
    // WHAT NO TEST HERE CAN REACH is the request itself: the reporting is refused before it opens a
    // socket whenever a test runner started the process, which is the guard of `JTdajUUs23_M` and
    // the point of it. What can be held is that this really asks — the sentence it hands back is the
    // office library's own, not one of its own making.
    const mine = register.registerThisWorld(
      {
        repository: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
        database: `${THE_TEST_FIXTURE_ROOT}/px-citizens/data/panelx.db`,
        databaseIdentity: 'eeeeeeeeeeeeeeee',
        port: 29841,
        head: '905d1df',
        standing: { kind: 'scratch' as const, because: ['its database is not the canonical one'] },
        readAt: '2026-09-04 12:00:00',
        saidBy: 'this test',
      },
      { actor: AGENT, detail: 'checking the citizens work' },
    )
    expect(mine?.name).toBe("builder-au's checking the citizens work")
    const said = await register.tellTheOfficeWhatThisWorldIsFor(mine as NonNullable<typeof mine>, AGENT)
    expect(said.told).toBe(false)
    expect(said.why).toBe(office.whyTheDeclaredOfficeIsNotThisWorlds())
  })

  it('refuses to tell an office that is not this world’s, and says why', async () => {
    const said = await office.tellTheOfficeThisWorldIsCalled('eeeeeeeeeeeeeeee', 'a name', 'builder-au')
    expect(said.told).toBe(false)
    expect(said.why).toBe(office.whyTheDeclaredOfficeIsNotThisWorlds())
  })
})
