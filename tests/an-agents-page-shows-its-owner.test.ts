// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S PAGE SHOWS ITS OWNER (wave 13s round 281).
 *
 * The owner is kept on the agent's row, apart from whoever started the agent. `theRecordedOwner`
 * (src/server/lib/agent-owner.ts) reads it as one of three states, and the read of one agent and its
 * profile carry that state as `owner`:
 *
 *   absent   nobody recorded an owner;
 *   broken   the row holds an owner that cannot be read;
 *   held     the owner's kind, id and office name. The name is null when the id names nobody registered.
 *
 * The list of participants does not carry it, and the first case holds that.
 *
 * The page draws the owner as one fact. A held owner with a name is a link to the owner's page. Each other
 * state has its own short word, so a reader can tell them apart. The sixth case draws the page from a reply,
 * without a server, and reads the drawn elements and their words, never the markup's text: the markup holds
 * the page's style sheet.
 *
 * THE HAND-OVERS are kept as rows from the day the office began to keep them, and the page draws them by
 * their own read. They are tested by tests/an-agents-owner-hand-overs-are-kept-and-listed.test.ts.
 *
 * THE GUARD. The page draws no control that hands an agent over. The last case holds that no file of the web
 * app asks the hand-over door.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { drawnText } from './drawn.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { WordKey } from '../src/shared/i18n.ts'

type Agent = { id: string; key: string; handle: string; name: string }
type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
type Router = typeof import('../src/web/components/router.tsx')

let office: TestDb
let app: FastifyInstance
let personId: string
let secretaryRole: string
let pp: ProfileModule
let i18n: I18n
let router: Router
let first: Agent
let second: Agent
let worker: Agent

/** The four words of the owner's fact, read from the word lists. */
const OWNER_WORDS = ['label', 'none', 'unreadable', 'namesNobody'] as const
const word = (which: (typeof OWNER_WORDS)[number]): string => i18n.t(`profileOwner.${which}` as string as WordKey)

function headers(kind: 'human' | 'agent', id: string, key?: string) {
  return {
    'content-type': 'application/json', 'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': kind, 'x-mole-office-actor-id': id,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  }
}
const person = () => headers('human', personId)
const as = (agent: Agent) => headers('agent', agent.handle, agent.key)

async function register(handle: string, name: string, by: ReturnType<typeof headers>, role?: string): Promise<Agent> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: by,
    payload: { handle, name, runtime: 'claude-code', ...(role === undefined ? {} : { role }) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const body = reply.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  return { id: body.agent.id, key: body.whatToGiveIt.key, handle, name }
}

/** One agent as the read of one participant says it. */
async function readOf(agent: Agent): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${agent.id}`, headers: person() })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { participant: Record<string, unknown> }).participant
}

/** The whole profile reply of one agent, as its page reads it. */
async function profileOf(agent: Agent): Promise<Record<string, unknown>> {
  const url = `/api/participants/agent/${agent.id}/profile`
  const reply = await app.inject({ method: 'GET', url, headers: person() })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** The owner the read and the profile both say, after checking that they say the same. */
async function ownerOf(agent: Agent): Promise<unknown> {
  const read = (await readOf(agent))['owner']
  const profile = ((await profileOf(agent))['participant'] as Record<string, unknown>)['owner']
  expect(profile, `the profile of ${agent.handle} says the owner the read says`).toEqual(read)
  return read
}

/** The profile page's own half, drawn from a reply. */
function drawnProfile(said: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}

/**
 * The value element of the fact whose label is the owner's, as drawn, or null when no such fact is drawn.
 * The style sheet is taken out first, because its text names classes the page draws.
 */
function theOwnerValue(html: string): string | null {
  const drawn = html.replace(/<style\b[\s\S]*?<\/style>/g, ' ')
  const fact = /<dt\b[^>]*\bclass="[^"]*\bprof-label\b[^"]*"[^>]*>([^<]*)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g
  const facts = [...drawn.matchAll(fact)]
  const owners = facts.filter((fact) => fact[1] === word('label'))
  expect(owners.length, 'the owner is drawn at most once').toBeLessThan(2)
  return owners[0]?.[2] ?? null
}

/** The words a reader sees in one drawn element. */
const wordsIn = (html: string): string =>
  drawnText(html).split('\n').map((run) => run.trim()).filter((run) => run !== '').join(' ')

/** The profile reply with the owner replaced, and the kind it is drawn as. */
function withOwner(said: Record<string, unknown>, owner: unknown, kind = 'agent'): Record<string, unknown> {
  return { ...said, participant: { ...(said['participant'] as Record<string, unknown>), kind, owner } }
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  personId = (await import('../src/shared/person.ts')).THE_PERSON
  secretaryRole = (await import('../src/server/lib/roles.ts')).theRoleCards().elevation.onlyThisCardCanHoldIt
  first = await register('first-owner', 'First Owner', person(), secretaryRole)
  second = await register('second-owner', 'Second Owner', person(), secretaryRole)
  worker = await register('an-owned-worker', 'An Owned Worker', as(first))

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: personId }))
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  i18n = await import('../src/shared/i18n.ts')
  router = await import('../src/web/components/router.tsx')
}, 120_000)

afterAll(async () => {
  i18n?.setWordLanguage('en')
  await app?.close()
  office?.close()
})

describe('the read of one agent says its owner', () => {
  it('1: names a held owner by its kind, its id and its office name, on the read and the profile', async () => {
    expect(await ownerOf(worker)).toEqual({ state: 'held', kind: 'agent', id: first.id, name: first.name })
    const personsName = office.client.sqlite.prepare('SELECT name FROM people WHERE id = ?').pluck().get(personId)
    expect(typeof personsName, 'the person\'s row carries a name').toBe('string')
    expect(await ownerOf(first)).toEqual({ state: 'held', kind: 'person', id: personId, name: personsName })
    // AN OWNER WITH A BLANK NAME IS NAMED BY ITS HANDLE, the office name everywhere else in the office.
    const blank = await register('a-blank-named-owner', 'A Blank Named Owner', person())
    const ownedByBlank = await register('owned-by-a-blank-name', 'Owned By A Blank Name', person())
    office.client.sqlite.prepare('UPDATE agents SET name = ? WHERE id = ?').run('  ', blank.id)
    setFixtureOwner(office.client.sqlite, blank.id, ownedByBlank.id)
    expect(await ownerOf(ownedByBlank)).toEqual({ state: 'held', kind: 'agent', id: blank.id, name: blank.handle })
    // A PERSON HAS NO OWNER, and the list of participants carries none, for agents or people.
    const people = await app.inject({ method: 'GET', url: `/api/participants/person/${personId}`, headers: person() })
    expect(people.statusCode, people.body).toBe(200)
    expect(Object.keys((people.json() as { participant: Record<string, unknown> }).participant)).not.toContain('owner')
    const list = await app.inject({ method: 'GET', url: '/api/participants', headers: person() })
    expect(list.statusCode, list.body).toBe(200)
    const rows = list.json() as { people: Record<string, unknown>[]; agents: Record<string, unknown>[] }
    expect(rows.agents.length).toBeGreaterThan(0)
    expect([...rows.agents, ...rows.people].filter((row) => Object.hasOwn(row, 'owner'))).toEqual([])
  })

  it('2: names the new owner after a hand-over through the door', async () => {
    const handed = await app.inject({
      method: 'POST', url: `/api/agents/${worker.id}/owner`, headers: as(first),
      payload: { owner: { kind: 'agent', id: second.id }, because: 'A test hand-over' },
    })
    expect(handed.statusCode, handed.body).toBe(200)
    expect(await ownerOf(worker)).toEqual({ state: 'held', kind: 'agent', id: second.id, name: second.name })
  })

  it('3: says absent when the row holds no owner', async () => {
    const unowned = await register('an-unowned-agent', 'An Unowned Agent', person())
    setFixtureOwner(office.client.sqlite, null, unowned.id)
    expect(await ownerOf(unowned)).toEqual({ state: 'absent' })
  })

  it('4: says broken, and nothing more, when the stored kind is not a kind', async () => {
    const unreadable = await register('an-agent-with-an-unreadable-owner', 'An Unreadable Owner', person())
    office.client.sqlite.prepare('UPDATE agents SET owner_kind = ?, owner_id = ? WHERE id = ?')
      .run('no-such-kind', first.id, unreadable.id)
    expect(await ownerOf(unreadable)).toEqual({ state: 'broken' })
  })

  it('5: holds the owner with a null name when its id names nobody registered', async () => {
    const orphan = await register('an-agent-whose-owner-is-gone', 'An Orphaned Agent', person())
    const gone = 'nobody-registered-has-this-id'
    setFixtureOwner(office.client.sqlite, gone, orphan.id)
    expect(await ownerOf(orphan)).toEqual({ state: 'held', kind: 'agent', id: gone, name: null })
  })
})

describe('the agent\'s page draws its owner', () => {
  it('6: draws the owner as a fact: a link by name, or a word for each other state, in both languages', async () => {
    const said = await profileOf(worker)
    const owner = { state: 'held', kind: 'agent', id: first.id, name: first.name }
    for (const language of ['en', 'zh'] as const) {
      i18n.setWordLanguage(language)
      for (const which of OWNER_WORDS) {
        const key = `profileOwner.${which}`
        expect(Object.hasOwn(i18n.WORD_LISTS[language], key), `${language} has ${key}`).toBe(true)
      }
      // THE NAME, AS A LINK TO THE OWNER'S PAGE. Its class says it is a participant's name, which is content.
      const held = theOwnerValue(drawnProfile(withOwner(said, owner)))
      expect(held, `the owner is drawn in ${language}`).not.toBeNull()
      const links = [...(held as string).matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)]
      expect(links.length, 'the owner is one link').toBe(1)
      const [, attributes, text] = links[0] as RegExpMatchArray
      expect(text).toBe(first.name)
      expect(attributes).toMatch(/\bclass="[^"]*\bprof-owner-name\b[^"]*"/)
      expect(attributes).toContain(`href="${router.hrefOf(router.whoPath('agent', first.id))}"`)
      // EACH OTHER STATE HAS ITS OWN WORD, and none of them is drawn as a value.
      const drawnAs = {
        none: theOwnerValue(drawnProfile(withOwner(said, { state: 'absent' }))),
        unreadable: theOwnerValue(drawnProfile(withOwner(said, { state: 'broken' }))),
        namesNobody: theOwnerValue(drawnProfile(withOwner(said, { ...owner, name: null }))),
      }
      for (const [which, value] of Object.entries(drawnAs)) {
        expect(value, `the ${which} owner is drawn in ${language}`).not.toBeNull()
        expect(wordsIn(value as string), `the ${which} owner in ${language}`).toBe(word(which as keyof typeof drawnAs))
        expect(value as string).not.toMatch(/<a\b|<button\b|<form\b|<input\b|<select\b/)
      }
      const words = Object.keys(drawnAs).map((which) => word(which as keyof typeof drawnAs))
      expect(new Set(words).size, 'the three words differ').toBe(3)
      expect(held as string, 'the owner fact holds no control').not.toMatch(/<button\b|<form\b|<input\b|<select\b/)
      // A PERSON'S PAGE DRAWS NO OWNER, even from a reply that carries one.
      const onAPersonsPage = theOwnerValue(drawnProfile(withOwner(said, owner, 'person')))
      expect(onAPersonsPage, `no owner on a person's page in ${language}`).toBeNull()
    }
    i18n.setWordLanguage('en')
    const inEnglish = OWNER_WORDS.map(word)
    i18n.setWordLanguage('zh')
    const inChinese = OWNER_WORDS.map(word)
    i18n.setWordLanguage('en')
    expect(inChinese.filter((one, at) => one === inEnglish[at]), 'every owner word has its own Chinese').toEqual([])
  })
})

describe('no control hands an agent over', () => {
  it('guard: no file of the web app asks the door that hands an agent over', async () => {
    // THE DOOR IS THERE, and refuses the agent itself, so the scan below is about a door that exists.
    const refused = await app.inject({
      method: 'POST', url: `/api/agents/${worker.id}/owner`, headers: as(worker),
      payload: { owner: { kind: 'agent', id: first.id }, because: 'A test hand-over' },
    })
    expect(refused.statusCode, refused.body).toBe(403)
    const files = (readdirSync('src/web', { recursive: true }) as string[]).filter((one) => /\.tsx?$/.test(one))
    expect(files.length, 'the web app was read').toBeGreaterThan(100)
    const asking = files.flatMap((one) =>
      readFileSync(join('src/web', one), 'utf8').split('\n').flatMap((line, at) =>
        /\/agents\/\S*\/owner(?![\w.])|['"`]\/owner['"`]/.test(line) ? [`${one}:${at + 1}`] : []),
    )
    expect(asking).toEqual([])
  })
})
