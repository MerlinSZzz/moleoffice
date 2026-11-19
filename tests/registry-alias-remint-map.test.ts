// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { rawHistory } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); madeUpRegistry() })
afterEach(() => t?.close())

const map = () => import('../src/server/lib/registry-aliases/remint-map.ts')
const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const db = () => t.client.sqlite

// A made-up registry: the identity matrix of plan 10.1, case 1. Every row is invented.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const MINTED_RETIRED = { id: 'MintedGoneA2', handle: 'minted-gone' }
const REUSED = { retired: 'reused-kite', live: 'KiteMinted03' }
const UNCERTAIN = { id: 'abcdefghijkl', handle: 'plain-twelve' }
// Several retired bearers of one handle, which no live agent bears now: two renamed legacy agents and a minted one.
const RETIRED_BEARERS = { handle: 'swift-thrice', legacy: ['old-swift-one', 'old-swift-two'], minted: 'SwiftGone_B4' }

function anAgent(id: string, handle: string, retired = false): void {
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
}
function madeUpRegistry(): void {
  db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY_LIVE, LEGACY_LIVE)
  anAgent(LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(RENAMED.id, RENAMED.handle)
  anAgent(MINTED_LIVE.id, MINTED_LIVE.handle)
  anAgent(MINTED_RETIRED.id, MINTED_RETIRED.handle, true)
  anAgent(REUSED.retired, REUSED.retired, true)
  anAgent(REUSED.live, REUSED.retired)
}
const everyAgent = () => db().prepare('SELECT * FROM agents ORDER BY id').all()
const theOfficesRow = () => (db().prepare("SELECT id FROM agents WHERE handle = 'mole-office'").get() as { id: string } | undefined)?.id
/** A generator that gives these ids in turn, and fails the test when it runs out. */
function theseIds(...ids: string[]): () => string {
  let next = 0
  return () => {
    const id = ids[next++]
    if (id === undefined) throw new Error('The made-up generator ran out of ids.')
    return id
  }
}

describe('where each agent id came from', () => {
  it('reads an id that is its handle, or a handle the mint could not make, as legacy, and 12 characters a handle may not hold as minted', async () => {
    const { whereEachAgentsIdCameFrom } = await map()
    anAgent(UNCERTAIN.id, UNCERTAIN.handle)
    // The legacy row this case reads: put the office's own row back on its handle, as an office made before the change has it.
    const office = theOfficesRow()
    if (office !== undefined && office !== 'mole-office') db().prepare('UPDATE agents SET id = ? WHERE id = ?').run('mole-office', office)
    const read = Object.fromEntries(whereEachAgentsIdCameFrom(db()).map(one => [one.id, one.from]))
    expect(read).toMatchObject({
      [LEGACY_LIVE]: 'legacy', [LEGACY_RETIRED]: 'legacy', [RENAMED.id]: 'legacy', [REUSED.retired]: 'legacy',
      [MINTED_LIVE.id]: 'minted', [MINTED_RETIRED.id]: 'minted', [REUSED.live]: 'minted',
      [UNCERTAIN.id]: 'uncertain',
    })
    if (office !== undefined) expect(read['mole-office']).toBe('legacy')
  })
  it('reads every id the mint draws as 12 of its characters', async () => {
    const { hasTheMintsCharacters } = await map()
    const { anOfficeId } = await import('../src/server/lib/ids.ts')
    for (let i = 0; i < 200; i++) expect(hasTheMintsCharacters(anOfficeId())).toBe(true)
    expect(hasTheMintsCharacters('MintedLive_')).toBe(false)
    expect(hasTheMintsCharacters('MintedLive_1x')).toBe(false)
    expect(hasTheMintsCharacters('Minted Live1')).toBe(false)
  })
})

describe('the map', () => {
  it('keeps every minted id, gives each legacy row one new id, and writes nothing', async () => {
    const { planTheRemint, whatStopsTheMap, whereEachAgentsIdCameFrom, hasTheMintsCharacters } = await map()
    const agents = everyAgent(), history = rawHistory(t)
    const plan = planTheRemint(db())
    if (!('map' in plan)) throw new Error(plan.refused.join(' '))
    const { entries } = plan.map
    const rows = whereEachAgentsIdCameFrom(db())
    expect(entries.map(one => one.oldId)).toEqual(rows.map(one => one.id))
    for (const entry of entries) {
      const row = rows.find(one => one.id === entry.oldId)!
      expect(entry, entry.oldId).toMatchObject({ handle: row.handle, retired: row.retired, from: row.from })
      expect(entry.fingerprint, entry.oldId).toMatch(/^[0-9a-f]{64}$/)
      if (entry.from === 'minted') expect(entry.newId).toBe(entry.oldId)
      else {
        expect(entry.newId).not.toBe(entry.oldId)
        expect(hasTheMintsCharacters(entry.newId), entry.newId).toBe(true)
        expect(entry.newId, entry.newId).toMatch(/[A-Z_]/)
        expect(rows.some(one => one.id === entry.newId || one.handle === entry.newId), entry.newId).toBe(false)
      }
    }
    expect(new Set(entries.map(one => one.newId)).size).toBe(entries.length)
    expect(plan.map.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(whatStopsTheMap(db(), plan.map)).toEqual([])
    expect(everyAgent()).toEqual(agents)
    expect(rawHistory(t)).toEqual(history)
  })
  it('refuses the whole map while any row cannot be classified, and names that row', async () => {
    const { planTheRemint } = await map()
    anAgent(UNCERTAIN.id, UNCERTAIN.handle)
    const plan = planTheRemint(db(), theseIds())
    expect(plan).toEqual({ refused: [expect.stringContaining(`"${UNCERTAIN.id}"`)] })
  })
  it('draws again only for an id that is taken or could be a handle, and refuses every other fault', async () => {
    const { planTheRemint, whereEachAgentsIdCameFrom, DRAWS_FOR_ONE_ROW } = await map()
    db().prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', 'AnOldAlias_1', ?)").run(MINTED_LIVE.id)
    const legacy = whereEachAgentsIdCameFrom(db()).filter(one => one.from === 'legacy').length
    const firstLegacy = whereEachAgentsIdCameFrom(db()).find(one => one.from === 'legacy')!.id
    const fresh = Array.from({ length: legacy }, (_, i) => `FreshNewId_${String(i)}`)
    const [first, ...rest] = fresh
    // An agent's id, a string a handle could be, an old id an alias names, then a new id drawn twice.
    const plan = planTheRemint(db(), theseIds(MINTED_LIVE.id, 'aaaaaaaaaaaa', 'AnOldAlias_1', first!, first!, ...rest))
    if (!('map' in plan)) throw new Error(plan.refused.join(' '))
    expect(plan.map.entries.filter(one => one.from === 'legacy').map(one => one.newId)).toEqual(fresh)
    expect(planTheRemint(db(), theseIds('not an id'))).toEqual({ refused: [expect.stringContaining('"not an id"')] })
    expect(planTheRemint(db(), theseIds('_NotFirst_12'))).toEqual({ refused: [expect.stringContaining('"_NotFirst_12"')] })
    expect(planTheRemint(db(), () => MINTED_LIVE.id)).toEqual({ refused: [expect.stringContaining(`${String(DRAWS_FOR_ONE_ROW)} ids for the agent with id "${firstLegacy}"`)] })
  })
  it('draws again for an id that another table holds as its key', async () => {
    const { planTheRemint, whereEachAgentsIdCameFrom } = await map()
    db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('AnAssetsId_1', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
    const firstLegacy = whereEachAgentsIdCameFrom(db()).find(one => one.from === 'legacy')!.id
    expect(planTheRemint(db(), () => 'AnAssetsId_1')).toEqual({ refused: [expect.stringContaining(`for the agent with id "${firstLegacy}", and each was taken`)] })
  })
})

describe('a map against the store it was made from', () => {
  it('refuses a map whose rows changed, were added or are missing, or whose entries were altered', async () => {
    const { planTheRemint, whatStopsTheMap } = await map()
    const plan = planTheRemint(db())
    if (!('map' in plan)) throw new Error(plan.refused.join(' '))
    const made = plan.map
    const altered = (change: (entries: typeof made.entries) => void) => {
      const copy = structuredClone(made)
      change(copy.entries)
      return copy
    }
    const legacy = made.entries.find(one => one.oldId === LEGACY_LIVE)!
    const legacyAt = made.entries.indexOf(legacy)
    const mintedAt = made.entries.findIndex(one => one.oldId === MINTED_LIVE.id)
    const stops = (one: typeof made) => whatStopsTheMap(db(), one).join(' ')
    expect(stops(altered(entries => { entries[legacyAt]!.newId = RENAMED.id }))).toMatch(/digest[\s\S]*another agent's id/)
    for (const handleOrNotMinted of [RENAMED.handle, 'aaaaaaaaaaab', '_NotFirst_12']) {
      expect(stops(altered(entries => { entries[legacyAt]!.newId = handleOrNotMinted })), handleOrNotMinted).toContain(`"${handleOrNotMinted}" for the agent with id "${LEGACY_LIVE}" could not have come from the mint, or could be a handle`)
    }
    expect(stops(altered(entries => { entries[mintedAt]!.newId = 'FreshNewId_9' }))).toContain(`minted agent "${MINTED_LIVE.id}" a new id`)
    expect(stops(altered(entries => { entries.push(entries[legacyAt]!) }))).toContain(`old id "${LEGACY_LIVE}" more than once`)
    expect(stops(altered(entries => { entries.splice(legacyAt, 1) }))).toContain(`"${LEGACY_LIVE}" is not in the map`)
    expect(stops(altered(entries => { entries[legacyAt]!.from = 'minted' }))).toContain('the map has it as minted')
    db().prepare('UPDATE agents SET name = ? WHERE id = ?').run('Made-up renamed', LEGACY_LIVE)
    expect(stops(made)).toContain(`"${LEGACY_LIVE}" has changed since the map was made`)
    anAgent('later-lark', 'later-lark')
    expect(stops(made)).toContain('"later-lark" is not in the map')
  })
})

describe('a stored name, read before it is mapped', () => {
  it('names one agent by its id, an old id or a handle, and says which, or says it names none or more than one', async () => {
    const { planTheRemint, whomAStoredNameNames } = await map()
    db().prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', 'AnOldAlias_1', ?)").run(MINTED_LIVE.id)
    const plan = planTheRemint(db())
    if (!('map' in plan)) throw new Error(plan.refused.join(' '))
    const newIdOf = (id: string) => plan.map.entries.find(one => one.oldId === id)!.newId
    const named = (stored: string) => whomAStoredNameNames(db(), plan.map, stored)
    expect(named(LEGACY_LIVE)).toEqual({ names: 'one agent', agent: LEGACY_LIVE, by: ['id', 'live handle'], becomes: newIdOf(LEGACY_LIVE) })
    expect(named(LEGACY_RETIRED)).toEqual({ names: 'one agent', agent: LEGACY_RETIRED, by: ['id', 'retired handle'], becomes: newIdOf(LEGACY_RETIRED) })
    expect(named(RENAMED.id)).toEqual({ names: 'one agent', agent: RENAMED.id, by: ['id'], becomes: newIdOf(RENAMED.id) })
    expect(named(RENAMED.handle)).toEqual({ names: 'one agent', agent: RENAMED.id, by: ['live handle'], becomes: newIdOf(RENAMED.id) })
    expect(named(MINTED_LIVE.id)).toEqual({ names: 'one agent', agent: MINTED_LIVE.id, by: ['id'], becomes: MINTED_LIVE.id })
    expect(named('AnOldAlias_1')).toEqual({ names: 'one agent', agent: MINTED_LIVE.id, by: ['old id'], becomes: MINTED_LIVE.id })
    expect(named(REUSED.retired)).toEqual({ names: 'more than one agent', agents: [REUSED.live, REUSED.retired].sort() })
    expect(named('nobody-made-up')).toEqual({ names: 'no agent' })
    expect(named('mole-office/the-api-server')).toEqual({ names: "one of the office's own writers" })
  })
  it('reads a handle that several retired agents bore as naming each of them, and maps each agent by its own row', async () => {
    const { planTheRemint, whomAStoredNameNames } = await map()
    for (const id of RETIRED_BEARERS.legacy) anAgent(id, RETIRED_BEARERS.handle, true)
    anAgent(RETIRED_BEARERS.minted, RETIRED_BEARERS.handle, true)
    const plan = planTheRemint(db())
    if (!('map' in plan)) throw new Error(plan.refused.join(' '))
    const entryOf = (id: string) => plan.map.entries.find(one => one.oldId === id)!
    // EACH BEARER IS ITS OWN ENTRY: each legacy one gets a new id of its own, and the minted one keeps its id.
    for (const id of RETIRED_BEARERS.legacy) expect(entryOf(id), id).toMatchObject({ handle: RETIRED_BEARERS.handle, retired: true, from: 'legacy' })
    expect(entryOf(RETIRED_BEARERS.minted)).toMatchObject({ handle: RETIRED_BEARERS.handle, retired: true, from: 'minted', newId: RETIRED_BEARERS.minted })
    const bearers = [...RETIRED_BEARERS.legacy, RETIRED_BEARERS.minted]
    expect(new Set(bearers.map(id => entryOf(id).newId)).size).toBe(bearers.length)
    // THE HANDLE NAMES ALL THREE, so nothing is moved under it; each id names its own agent.
    const named = (stored: string) => whomAStoredNameNames(db(), plan.map, stored)
    expect(named(RETIRED_BEARERS.handle)).toEqual({ names: 'more than one agent', agents: [...bearers].sort() })
    for (const id of bearers) expect(named(id), id).toEqual({ names: 'one agent', agent: id, by: ['id'], becomes: entryOf(id).newId })
  })
})

describe('the register before the re-mint', () => {
  it("reads a fix notice's recipients as registry ids, and the notebook writer and the asked-of handle as stamps", async () => {
    const { readRecordIdentities } = await reader()
    const problem = readRecordIdentities(db(), 'problem', { mainSuiteFix: { notices: [{ sendId: 'made-up-send', phase: 'made-up', to: [MINTED_LIVE.id, LEGACY_LIVE] }] } })
    expect(problem.blocks).toEqual([])
    expect(problem.found.map(one => [one.path, one.stored, one.site, one.parse])).toEqual([
      ['data.mainSuiteFix.notices[0].to[0]', MINTED_LIVE.id, 'MainSuiteFixNotice.to', 'registry-id'],
      ['data.mainSuiteFix.notices[0].to[1]', LEGACY_LIVE, 'MainSuiteFixNotice.to', 'registry-id'],
    ])
    const entry = (writtenByKind: string, writtenById: string) => ({ id: 'made-up-entry', writtenByKind, writtenById, at: '2026-01-01T00:00:00Z' })
    const notebook = readRecordIdentities(db(), 'notebook', { entries: [entry('agent', RENAMED.handle), entry('person', LEGACY_LIVE), entry('agent', REUSED.retired)] })
    expect(notebook.found.map(one => [one.path, one.stored, one.site, one.parse])).toEqual([['data.entries[0].writtenById', RENAMED.handle, 'NotebookEntry.writtenById', 'stamp']])
    expect(notebook.blocks.map(one => [one.path, one.reason])).toEqual([['data.entries[2].writtenById', 'cannot-tell']])
    const session = readRecordIdentities(db(), 'session', { theCheck: { askedOf: MINTED_RETIRED.handle } })
    expect(session.found.map(one => [one.path, one.stored, one.site, one.parse])).toEqual([['data.theCheck.askedOf', MINTED_RETIRED.handle, 'TheCheckTheOfficeAskedFor.askedOf', 'stamp']])
    expect(readRecordIdentities(db(), 'session', { theCheck: { askedOf: 'nobody-made-up' } }).blocks.map(one => one.reason)).toEqual(['names-no-agent'])
  })
})
