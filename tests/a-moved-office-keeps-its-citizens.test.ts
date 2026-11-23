// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MOVED OFFICE KEEPS ITS CITIZENS.
 *
 * A move of the data folder gives the office a new database identity, and its old home becomes a dead
 * home of the same installation in the worlds table. Every agent and person registered before the move
 * still names the old home as its home world. Three readers compared a home world with this database's
 * own identity and nothing else, so after a move they treated the office's own citizens as foreigners.
 *
 * WHAT THIS FILE PROVES, on two databases of one installation:
 *
 *   1. `isThisOfficesHome` in src/server/lib/visits.ts answers true for this database's own identity and
 *      for a dead home of this installation, false for a home of another installation and for a home the
 *      worlds table has never heard of, and null for a home nobody recorded;
 *   2. an agent whose home world is this office's dead home may be proposed as a resident, while an agent
 *      of another installation's home, and an agent with no home recorded, are refused in the same words
 *      as before;
 *   3. both residents replies say whether the stored facts' home world is this office: an open proposal
 *      in the list, and a resident read on its own, each true for the dead home and false for a home of
 *      another installation;
 *   4. the Embassy counts a citizen whose home world is the dead home under this office's own world row,
 *      and the dead home's row counts none, while a citizen of another installation's home is still
 *      counted under that home; and
 *   5. the facts list on the page draws the home world from that answer: true draws "this office", false
 *      draws "another world", null draws the identity itself, and a home nobody recorded draws unknown.
 *
 * THE TWO DATABASES. `freshDb()` makes a throwaway database. `beforeAll` makes the first one, reads its
 * identity and installation, and closes it: that is the home the office had before the move. The file's
 * one database is the home now, and its installation row is set to the first one's, so the two are one
 * installation and the old home is a real database identity rather than an invented string. The worlds
 * table is then given three rows: this database's own home, live; the old home, closed, as a move leaves
 * it; and a home of another installation, closed.
 *
 * THE AGENTS. Each is registered through the door an agent's start uses, so its home world is this
 * database's own. The agents that stand for the ones registered before the move then have their stored
 * home world set to the old home by SQL, which is the row a move leaves behind; one agent is given the
 * other installation's home, and one is given none.
 *
 * FACTS POINTED ABROAD. No door files a proposal whose measured home world is another installation's,
 * because the propose door refuses such an agent. So two proposals are filed for agents at home, and
 * their stored facts' home world is then set to the other installation's home by SQL, which is the only
 * way such stored facts can be made here.
 *
 * THE PAGE CASE renders the component to a string, with the smallest stand-in for `window` the web
 * modules need when they load. The page's world is set to this database's identity, so a reader that
 * still compared the stored home world with the page's world would draw the dead home as another world.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { A_SLEEP_TIME, apiApp, freshDb, type TestDb } from './helpers.ts'
import { formatWorldHeader } from '../src/config/world-header.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { setWordLanguage, t as words } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { MeasuredFacts } from '../src/server/lib/residents.ts'
import type { RegisteredAgent } from '../src/server/lib/participants.ts'

type VisitsLib = typeof import('../src/server/lib/visits.ts')
type OfficeLib = typeof import('../src/server/lib/office.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')
type ResidentsLib = typeof import('../src/server/lib/residents.ts')
type ParticipantLib = typeof import('../src/server/db/read-participant.ts')

let db: TestDb
let app: FastifyInstance
let visits: VisitsLib
let office: OfficeLib
let world: WorldLib
let residents: ResidentsLib
let participant: ParticipantLib
/** The identity of the database this test's office answers from, which is home now. */
let here: string
/** The identity of the database that was home before the move. */
let oldHome: string
/** The installation both test databases belong to. */
let theInstallation: string

/** A home that belongs to another installation, so it is never read as this office's own. */
const HOME_OF_ANOTHER_INSTALLATION = 'eeeeeeeeeeeeeeee'
/** A home the worlds table has never heard of. */
const A_HOME_NOBODY_KNOWS = 'dddddddddddddddd'
const OTHER_INSTALLATION = 'another-installation'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

async function started(handle: string, role: string): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  agents.set(handle, { id, key })
}

const idOf = (handle: string): string => agents.get(handle)!.id

/** The stored home world of one agent, set by SQL, as the row a move leaves behind holds it. */
function giveTheHome(handle: string, home: string | null): void {
  db.client.sqlite.prepare('UPDATE agents SET home_world = ? WHERE id = ?').run(home, idOf(handle))
}

/** One registry row, read as the propose door reads it. */
function theAgent(handle: string): RegisteredAgent {
  const read = participant.readParticipant({ kind: 'agent', id: idOf(handle) })
  if (read === null) throw new Error(`${handle} has no registry row`)
  return read as RegisteredAgent
}

async function propose(handle: string): Promise<Reply> {
  return inject('POST', '/api/residents/proposals', asAgent('sec-moved', agents.get('sec-moved')!.key), {
    agentId: idOf(handle),
    because: 'It has done steady work here for weeks.',
    sleepTime: A_SLEEP_TIME,
  })
}

async function confirm(proposalId: string): Promise<void> {
  const confirmed = await inject('POST', `/api/residents/proposals/${proposalId}/confirm`, AS_THE_PERSON)
  expect(confirmed.status, confirmed.text).toBe(200)
}

/** The stored facts of one proposal, pointed at the other installation's home by SQL. */
function pointTheFactsAbroad(proposalId: string): void {
  db.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.extra.residency.facts.homeWorld', ?) WHERE id = ?")
    .run(HOME_OF_ANOTHER_INSTALLATION, proposalId)
}

/** A home in the worlds table: closed as a move leaves the old one, or live as this office's own. */
function aHome(databaseIdentity: string, belongsTo: string, closedBecause: string | null): void {
  const made = office.registerWorldHere({
    name: closedBecause === null ? 'the home now' : 'a home before the move',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: null,
    head: null,
    databaseIdentity,
    address: null,
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: belongsTo,
  })
  if (closedBecause !== null) office.closeWorldHere(made.id, closedBecause)
}

beforeAll(async () => {
  // THE OTHER DATABASE OF THE ONE INSTALLATION, made and closed before any case, so `oldHome` was a real
  // database the office answered from.
  const old = await freshDb()
  const first = await import('../src/server/lib/world.ts')
  first.forgetTheWorld()
  const said = first.theWorldThisDatabaseIs()
  if (said === null) throw new Error('the old test database has no identity')
  oldHome = said
  const belonged = first.theInstallationThisDatabaseBelongsTo()
  if (belonged === null || belonged === '') throw new Error('the old test database belongs to no installation')
  theInstallation = belonged
  old.close()
  db = await freshDb()
  visits = await import('../src/server/lib/visits.ts')
  office = await import('../src/server/lib/office.ts')
  world = await import('../src/server/lib/world.ts')
  residents = await import('../src/server/lib/residents.ts')
  participant = await import('../src/server/db/read-participant.ts')
  world.forgetTheWorld()
  // BOTH DATABASES ARE ONE INSTALLATION, which the old home row below is checked against.
  db.client.sqlite.prepare('UPDATE installation SET id = ? WHERE only_row = 1').run(theInstallation)
  app = (await apiApp()).app
  await app.ready()
  const thisHome = world.theWorldThisDatabaseIs()
  if (thisHome === null) throw new Error('this test database has no identity')
  here = thisHome
  aHome(here, theInstallation, null)
  aHome(oldHome, theInstallation, 'the office moved to a new database')
  aHome(HOME_OF_ANOTHER_INSTALLATION, OTHER_INSTALLATION, 'a home of another installation')
  await started('sec-moved', 'secretary')
  for (const handle of ['moved-one', 'moved-two', 'abroad-one', 'abroad-two', 'foreign-one', 'homeless-one']) {
    await started(handle, 'worker')
  }
  giveTheHome('moved-one', oldHome)
  giveTheHome('moved-two', oldHome)
  giveTheHome('foreign-one', HOME_OF_ANOTHER_INSTALLATION)
  giveTheHome('homeless-one', null)
})

afterAll(async () => {
  await app.close()
  db.close()
})

describe('a moved office keeps its citizens', () => {
  it('1: this office’s home is its own identity or a dead home of its installation, and nothing else', () => {
    expect(visits.isThisOfficesHome(here)).toBe(true)
    expect(visits.isThisOfficesHome(oldHome)).toBe(true)
    expect(visits.isThisOfficesHome(HOME_OF_ANOTHER_INSTALLATION)).toBe(false)
    expect(visits.isThisOfficesHome(A_HOME_NOBODY_KNOWS)).toBe(false)
    expect(visits.isThisOfficesHome(null)).toBeNull()
  })

  it('2: an agent of the dead home may be proposed, and the others are refused in the same words', () => {
    expect(residents.whyThisAgentMayNotBeProposed(theAgent('moved-one'))).toBeNull()
    const tail = 'Only a citizen of this world may be a resident here, and never an agent of a scratch or test world. Nothing was written.'
    expect(residents.whyThisAgentMayNotBeProposed(theAgent('foreign-one'))).toBe(
      `foreign-one is not a citizen of this office's world: its home world is ${HOME_OF_ANOTHER_INSTALLATION}. ${tail}`,
    )
    expect(residents.whyThisAgentMayNotBeProposed(theAgent('homeless-one'))).toBe(
      `homeless-one is not a citizen of this office's world: its home world is not recorded. ${tail}`,
    )
  })

  it('3: both residents replies say whether the stored home world is this office', async () => {
    const movedOne = await propose('moved-one')
    expect(movedOne.status, movedOne.text).toBe(201)
    expect(movedOne.json['proposal'].facts.homeWorld).toBe(oldHome)
    await confirm(String(movedOne.json['proposal'].id))
    const movedTwo = await propose('moved-two')
    expect(movedTwo.status, movedTwo.text).toBe(201)
    const abroadOne = await propose('abroad-one')
    expect(abroadOne.status, abroadOne.text).toBe(201)
    await confirm(String(abroadOne.json['proposal'].id))
    pointTheFactsAbroad(String(abroadOne.json['proposal'].id))
    const abroadTwo = await propose('abroad-two')
    expect(abroadTwo.status, abroadTwo.text).toBe(201)
    pointTheFactsAbroad(String(abroadTwo.json['proposal'].id))

    const listed = await inject('GET', '/api/residents', AS_THE_PERSON)
    expect(listed.status, listed.text).toBe(200)
    const open = listed.json['openProposals'] as { agentId: string; facts: MeasuredFacts; homeWorldIsThisOffice: boolean | null }[]
    const ofMovedTwo = open.find((one) => one.agentId === idOf('moved-two'))
    const ofAbroadTwo = open.find((one) => one.agentId === idOf('abroad-two'))
    expect(ofMovedTwo?.facts.homeWorld).toBe(oldHome)
    expect(ofMovedTwo?.homeWorldIsThisOffice).toBe(true)
    expect(ofAbroadTwo?.facts.homeWorld).toBe(HOME_OF_ANOTHER_INSTALLATION)
    expect(ofAbroadTwo?.homeWorldIsThisOffice).toBe(false)

    const movedResident = await inject('GET', `/api/residents/${idOf('moved-one')}`, AS_THE_PERSON)
    expect(movedResident.status, movedResident.text).toBe(200)
    expect(movedResident.json['resident'].factsAtProposal.homeWorld).toBe(oldHome)
    expect(movedResident.json['resident'].homeWorldIsThisOffice).toBe(true)
    const abroadResident = await inject('GET', `/api/residents/${idOf('abroad-one')}`, AS_THE_PERSON)
    expect(abroadResident.status, abroadResident.text).toBe(200)
    expect(abroadResident.json['resident'].factsAtProposal.homeWorld).toBe(HOME_OF_ANOTHER_INSTALLATION)
    expect(abroadResident.json['resident'].homeWorldIsThisOffice).toBe(false)
  })

  it('4: the Embassy counts a citizen of the dead home under this office’s own world', async () => {
    const citizensOf = async (): Promise<Map<string, number>> => {
      const reply = await inject('GET', '/api/office/embassy', AS_THE_PERSON)
      expect(reply.status, reply.text).toBe(200)
      const rows = reply.json['worlds'] as { world: { databaseIdentity: string }; isThisWorld: boolean; citizens: number }[]
      return new Map(rows.map((one) => [one.world.databaseIdentity, one.citizens]))
    }
    const before = await citizensOf()
    expect(before.get(oldHome)).toBe(0)
    expect(before.get(HOME_OF_ANOTHER_INSTALLATION)).toBe(1)
    // THE SAME COUNT WHEN ONE MOVED AGENT IS GIVEN THIS DATABASE'S OWN HOME, which proves it was counted here.
    giveTheHome('moved-two', here)
    try {
      const after = await citizensOf()
      expect(after.get(here)).toBe(before.get(here))
      expect(after.get(oldHome)).toBe(0)
    } finally {
      giveTheHome('moved-two', oldHome)
    }
  })

  it('5: the page draws the home world from the answer the reply carries', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const held = globalThis as unknown as { window?: unknown }
    const before = held.window
    // src/web/api.ts reads window.localStorage when it is imported. Nothing in this stand-in is under test.
    held.window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    let page: typeof import('../src/web/lib/world.ts') | null = null
    try {
      page = await import('../src/web/lib/world.ts')
      const proposals = await import('../src/web/components/ResidentProposals.tsx')
      setWordLanguage('en')
      page.theWorldThatAnswered(
        formatWorldHeader({
          database: here,
          repository: `${THE_TEST_FIXTURE_ROOT}/a-moved-office`,
          port: String(settingNamed('MOLE_OFFICE_PORT').fallback),
          head: '905d1df',
          standing: 'canonical',
        }),
      )
      const facts: MeasuredFacts = {
        measuredAt: '2026-11-22 10:00:00',
        citizenSince: null,
        daysSinceCitizen: null,
        daysWithARun: 3,
        runs: 4,
        recordsWritten: 9,
        retired: false,
        homeWorld: oldHome,
      }
      const label = words('resident.facts.homeWorld')
      const drawn = (shown: MeasuredFacts, homeWorldIsThisOffice: boolean | null): string | null => {
        const markup = renderToStaticMarkup(h(proposals.ResidentFactsList, { facts: shown, homeWorldIsThisOffice }))
        const found = new RegExp(`<dt class="resident-fact-label">${label}</dt><dd class="resident-fact-value">([^<]*)</dd>`).exec(markup)
        return found?.[1] ?? null
      }
      expect(drawn(facts, true)).toBe(words('resident.facts.thisOffice'))
      expect(drawn(facts, false)).toBe(words('resident.facts.anotherWorld'))
      expect(drawn(facts, null)).toBe(oldHome)
      expect(drawn({ ...facts, homeWorld: null }, null)).toBe(words('resident.unknown'))
    } finally {
      page?.forgetTheWorldOnThisPage()
      if (before === undefined) delete held.window
      else held.window = before
    }
  })

  // THE KIND IS THE OTHER HALF OF THE DEAD HOME: a dead home of this installation is this office's home,
  // and a dead test or agent-made world of this installation is no home at all, in a foreign home's words.
  it('6: an agent of a dead test or agent-made world of this installation is refused', async () => {
    const tail = 'Only a citizen of this world may be a resident here, and never an agent of a scratch or test world. Nothing was written.'
    const madeUpWorlds = [
      { kind: 'test' as const, identity: 'cccccccccccccccc', name: 'a made-up test world', handle: 'test-world-one' },
      { kind: 'agent-made' as const, identity: 'bbbbbbbbbbbbbbbb', name: 'a made-up agent-made world', handle: 'agent-made-one' },
    ]
    for (const one of madeUpWorlds) {
      const made = office.registerWorldHere({
        name: one.name,
        kind: one.kind,
        startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
        checkout: null,
        head: null,
        databaseIdentity: one.identity,
        address: null,
        addressForOtherMachines: null,
        standing: 'canonical',
        parentWorld: null,
        installation: theInstallation,
      })
      office.closeWorldHere(made.id, 'it was made up for this case')
    }
    for (const one of madeUpWorlds) {
      await started(one.handle, 'worker')
      giveTheHome(one.handle, one.identity)
    }
    for (const one of madeUpWorlds) expect(visits.isThisOfficesHome(one.identity)).toBe(false)
    for (const one of madeUpWorlds) {
      const refused = await propose(one.handle)
      expect(refused.status, refused.text).toBe(409)
      expect(refused.json['error']).toBe(
        `${one.handle} is not a citizen of this office's world: its home world is ${one.identity}. ${tail}`,
      )
    }
    const listed = await inject('GET', '/api/residents', AS_THE_PERSON)
    expect(listed.status, listed.text).toBe(200)
    const open = listed.json['openProposals'] as { agentId: string }[]
    for (const one of madeUpWorlds) expect(open.find((proposal) => proposal.agentId === idOf(one.handle))).toBeUndefined()
  })
})
