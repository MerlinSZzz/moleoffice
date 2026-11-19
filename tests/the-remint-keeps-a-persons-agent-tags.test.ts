// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT KEEPS A PERSON'S AGENT TAGS ON THE AGENTS THEY MARK. Wave 13y round 171.
 *
 * people.agent_tags holds a person's own tags as one JSON list, and each tag lists the agents it marks by their registry
 * ids. The census reads the list by its writer's type, and the re-mint's plain rewrite
 * (src/server/db/registry-aliases/remint-plain.ts) gives each old id in it the new id the map gives. Here a throwaway
 * office holds a made-up legacy agent, whose id is its handle, and a made-up minted one. The person tags both through the
 * tags door. A second made-up person's tag holds an id no agent has, and a third person's list is text that is not JSON,
 * both written by SQL, as the door would refuse them. A map is planned with a fixed generator and written by
 * writeTheRemint. Cases:
 *   1. before the re-mint the census counts the person's two ids at AgentTag.agents. The re-mint rewrites the person's
 *      row alone. After it the stored list, the tags door and the legacy agent's profile name the legacy agent by its new
 *      id, the minted agent keeps its id, and the list sent back unchanged is kept as it was;
 *   2. the id no agent has and the text that is not JSON are kept byte for byte. The census counts the first, under no
 *      alias, before and after, and blocks the second as not JSON.
 *
 * Proof by two mutations, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-keeps-a-persons-agent-tags.test.ts
 * After a green control, copy src/server/db/registry-aliases/remint-plain.ts, then in thePlainSites delete the line that
 * adds the stored columns the re-mint rewrites: the list keeps the old id, and case 1 goes red. Restore it with cp, check
 * it with sha256sum, and run the command again for green. Then copy src/server/db/registry-aliases/identity-positions.ts
 * and delete its AgentTag.agents position: the census counts nothing there, and the cases go red. Restore it the same
 * way, and run the command again for green.
 * Every id, name and tag here is made up, in a throwaway office.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AnIdentityAt } from '../src/server/lib/registry-aliases/census.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const db = () => t.client.sqlite

const LEGACY = 'made-up-legacy-lark'
const MINTED = { id: 'MintedLark_1', handle: 'made-up-minted-lark' }
const NO_AGENT = 'made-up-visitor'
const SECOND = 'made-up-second-person'
const THIRD = 'made-up-third-person'
const NOT_JSON = '{'
const NEW_IDS = ['NewIdOne_001', 'NewIdTwo_002', 'NewIdThree03', 'NewIdFour_04', 'NewIdFive_05', 'NewIdSix__06', 'NewIdSeven07', 'NewIdEight08']
const tag = (agents: string[]) => ({ name: 'Made-up review', colour: '#7860a8', agents })
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

function anAgent(id: string, handle: string): void {
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, 0)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00')
}
function aPerson(id: string, tags: string): void {
  db().prepare('INSERT INTO people (id, name, handle, avatar_asset_id, created_at, agent_tags) SELECT ?, ?, ?, avatar_asset_id, created_at, ? FROM people WHERE id = ?').run(id, `Made-up ${id}`, id, tags, THE_PERSON)
}
const theStoredTags = (person: string) => (db().prepare('SELECT agent_tags FROM people WHERE id = ?').get(person) as { agent_tags: string | null }).agent_tags

/** A generator that gives these ids in turn, and fails the test when it runs out. */
function theseIds(ids: readonly string[]): () => string {
  let next = 0
  return () => {
    const id = ids[next++]
    if (id === undefined) throw new Error('The made-up generator ran out of ids.')
    return id
  }
}

/** The census of the whole office: what it counted at each position, what it found in people, and its blocks in people. */
async function theCensus() {
  const { takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
  const found: AnIdentityAt[] = []
  const census = takeIdentityCensus(db(), undefined, undefined, found)
  const inPeople = <T extends { table: string }>(list: T[]) => list.filter((one) => one.table === 'people')
  return {
    counted: census.positions['AgentTag.agents'] ?? 0,
    found: inPeople(found).map(({ row, path, stored, canonical, site }) => ({ row, path, stored, canonical, site })),
    aliases: inPeople(census.aliases),
    blocks: inPeople(census.blocks).map(({ row, path, reason }) => ({ row, path, reason })),
  }
}

let before: Awaited<ReturnType<typeof theCensus>>
let after: Awaited<ReturnType<typeof theCensus>>
let storedBefore: Record<string, string | null>
let newIdOf: Map<string, string>
let plainWritten: Record<string, number>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY, LEGACY)
  anAgent(MINTED.id, MINTED.handle)
  const kept = await app.inject({ method: 'PUT', url: '/api/agent-tags', headers, payload: { tags: [tag([LEGACY, MINTED.id])] } })
  expect(kept.statusCode, kept.body).toBe(200)
  aPerson(SECOND, JSON.stringify([tag([NO_AGENT])]))
  aPerson(THIRD, NOT_JSON)
  storedBefore = Object.fromEntries([THE_PERSON, SECOND, THIRD].map((person) => [person, theStoredTags(person)]))
  before = await theCensus()

  const { planTheRemint } = await import('../src/server/lib/registry-aliases/remint-map.ts')
  const { writeTheRemint } = await import('../src/server/lib/registry-aliases/remint-write.ts')
  const plan = planTheRemint(db(), theseIds(NEW_IDS))
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  newIdOf = new Map(plan.map.entries.map((entry) => [entry.oldId, entry.newId]))
  const written = writeTheRemint(db(), plan.map)
  if (!('written' in written)) throw new Error(written.refused.join(' '))
  plainWritten = written.written.plain
  after = await theCensus()
}, 120_000)
afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the re-mint keeps a person's agent tags on the agents they mark", () => {
  it('names a legacy agent by its new id in the stored list, the tags door and its profile, and keeps the list sent back', async () => {
    // THE FIXTURE HAS WHAT THE CASE NEEDS: the legacy agent gets a new id, and the minted one keeps its own.
    const lark = newIdOf.get(LEGACY)!
    expect(lark).not.toBe(LEGACY)
    expect(newIdOf.get(MINTED.id)).toBe(MINTED.id)
    expect(JSON.parse(storedBefore[THE_PERSON]!)).toEqual([tag([LEGACY, MINTED.id])])
    // The census counts the person's two ids and the second person's one, before the re-mint and after it.
    expect(before.counted).toBe(3)
    expect(after.counted).toBe(3)

    // The re-mint rewrites the person's row and no other, and leaves no old id under an alias.
    expect(plainWritten['people.agent_tags']).toBe(1)
    expect(after.aliases).toEqual([])
    expect(JSON.parse(theStoredTags(THE_PERSON)!)).toEqual([tag([lark, MINTED.id])])
    const read = await app.inject({ method: 'GET', url: '/api/agent-tags', headers })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().tags).toEqual([tag([lark, MINTED.id])])
    const profile = await app.inject({ method: 'GET', url: `/api/participants/agent/${lark}/profile`, headers })
    expect(profile.statusCode, profile.body).toBe(200)
    expect(profile.json().participant.personalTags).toEqual([{ name: tag([]).name, colour: tag([]).colour }])

    // The list sent back as the door gave it is kept, and the stored text does not change.
    const stored = theStoredTags(THE_PERSON)
    const sentBack = await app.inject({ method: 'PUT', url: '/api/agent-tags', headers, payload: { tags: read.json().tags } })
    expect(sentBack.statusCode, sentBack.body).toBe(200)
    expect(theStoredTags(THE_PERSON)).toBe(stored)
  })

  it('keeps an id no agent has and text that is not JSON byte for byte, and the census says what it read there', () => {
    expect(theStoredTags(SECOND)).toBe(storedBefore[SECOND])
    expect(theStoredTags(THIRD)).toBe(NOT_JSON)
    const theVisitor = { row: SECOND, path: 'agent_tags[0].agents[0]', stored: NO_AGENT, canonical: NO_AGENT, site: 'AgentTag.agents' }
    for (const census of [before, after]) {
      expect(census.found.filter((one) => one.row === SECOND)).toEqual([theVisitor])
      expect(census.blocks).toEqual([{ row: THIRD, path: 'agent_tags', reason: 'not-json' }])
    }
  })
})
