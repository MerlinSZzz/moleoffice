// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR THAT KEEPS EACH PERSON'S PAGES IN FRONT OF THE SIDEBAR. GET /api/sidebar-pins answers the pages kept
 * for the person asking, and PUT /api/sidebar-pins keeps a new list. Each person's list is one runtime_settings
 * row named for that person, as Home's layout is kept, and each change is written to the changes table. Only the
 * person writes their own row: an agent's write is refused and stores nothing.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { SHIPPED_SIDEBAR } from '../src/shared/sidebar-arrangement.ts'
import { PINNABLE_PAGES, SHIPPED_PINS, THE_KEPT_PINS_ARE_NOT_JSON, problemsWithThePins, sidebarPinsSettingName } from '../src/shared/sidebar-pins.ts'

let db: TestDb, app: FastifyInstance
beforeEach(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); db.close() })

const SECOND_PERSON = 'made-up-second-person'
const asPerson = (id: string) => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': 'default' })
const asAgent = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-agent', 'x-mole-office-workspace': 'default' }
const owner = THE_TEST_OFFICES_OWNER.id
// Two lists a person might choose: the owner's own examples, a project page among them, and one with Home taken out.
const SCHEDULE_PLANS_TERMINALS = ['home', 'schedule', 'plans', 'terminals', 'modules']
const WITHOUT_HOME = ['decisions', 'notes']

async function read(headers: Record<string, string>) {
  const reply = await app.inject({ url: '/api/sidebar-pins', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  // Every plain answer says whether a permission narrowed it, and this one is never narrowed.
  const { narrowedByPermission, ...answer } = reply.json() as { pins: unknown; kept: string; problems: string[]; narrowedByPermission: unknown }
  expect(narrowedByPermission).toBeNull()
  return answer
}
const keep = (headers: Record<string, string>, pins: unknown) => app.inject({ method: 'PUT', url: '/api/sidebar-pins', headers, payload: { pins } })

function rows() {
  return db.client.sqlite.prepare("SELECT name, value FROM runtime_settings WHERE name LIKE 'sidebar.pins%' ORDER BY name").all() as { name: string; value: string }[]
}
function changes() {
  return db.client.sqlite.prepare("SELECT record_id, actor_type, actor_id, old_value, new_value FROM changes WHERE record_id LIKE 'setting:sidebar.pins%' ORDER BY rowid").all() as { record_id: string; actor_type: string; actor_id: string; old_value: string | null; new_value: string }[]
}
const stored = () => JSON.stringify({ rows: rows(), changes: changes() })

it('may pin every page of the shipped sidebar, and the shipped pins are among them', () => {
  expect([...PINNABLE_PAGES].sort()).toEqual(SHIPPED_SIDEBAR.groups.flatMap(group => group.keys).sort())
  for (const key of SHIPPED_PINS) expect(PINNABLE_PAGES).toContain(key)
  expect(problemsWithThePins([...PINNABLE_PAGES])).toEqual([])
  expect(problemsWithThePins([])).toEqual([])
})

it('keeps a list for the person who sends it, and a second person keeps one of their own', async () => {
  expect(await read(asPerson(owner))).toEqual({ pins: [...SHIPPED_PINS], kept: 'nothing-kept', problems: [] })
  const first = await keep(asPerson(owner), SCHEDULE_PLANS_TERMINALS)
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json()).toMatchObject({ pins: SCHEDULE_PLANS_TERMINALS, written: true })
  expect(await read(asPerson(owner))).toEqual({ pins: SCHEDULE_PLANS_TERMINALS, kept: 'kept', problems: [] })
  // The second person has kept nothing yet, and sees the shipped pins whatever the first one kept.
  expect(await read(asPerson(SECOND_PERSON))).toEqual({ pins: [...SHIPPED_PINS], kept: 'nothing-kept', problems: [] })
  expect((await keep(asPerson(SECOND_PERSON), WITHOUT_HOME)).statusCode).toBe(200)
  expect((await read(asPerson(owner))).pins).toEqual(SCHEDULE_PLANS_TERMINALS)
  expect((await read(asPerson(SECOND_PERSON))).pins).toEqual(WITHOUT_HOME)

  const kept = rows()
  expect(kept.map(row => row.name)).toEqual([sidebarPinsSettingName(SECOND_PERSON), sidebarPinsSettingName(owner)].sort())
  expect(JSON.parse(kept.find(row => row.name === sidebarPinsSettingName(owner))!.value)).toEqual(SCHEDULE_PLANS_TERMINALS)
  expect(JSON.parse(kept.find(row => row.name === sidebarPinsSettingName(SECOND_PERSON))!.value)).toEqual(WITHOUT_HOME)
  const written = changes()
  expect(written.map(row => [row.record_id, row.actor_type, row.actor_id])).toEqual([
    [`setting:${sidebarPinsSettingName(owner)}`, 'human', owner],
    [`setting:${sidebarPinsSettingName(SECOND_PERSON)}`, 'human', SECOND_PERSON],
  ])
  expect(JSON.parse(written[0]!.new_value).pins).toEqual(SCHEDULE_PLANS_TERMINALS)

  // The same list again writes nothing and adds no change. The same pages in another order are a new list.
  const before = stored()
  const again = await keep(asPerson(owner), SCHEDULE_PLANS_TERMINALS)
  expect(again.statusCode).toBe(200)
  expect(again.json()).toMatchObject({ pins: SCHEDULE_PLANS_TERMINALS, written: false })
  expect(stored()).toBe(before)
  const reordered = [...SCHEDULE_PLANS_TERMINALS].reverse()
  expect((await keep(asPerson(owner), reordered)).json()).toMatchObject({ pins: reordered, written: true })
  expect((await read(asPerson(owner))).pins).toEqual(reordered)

  // A person may unpin every page, and that is kept as it is, not taken for nothing kept.
  expect((await keep(asPerson(owner), [])).statusCode).toBe(200)
  expect(await read(asPerson(owner))).toEqual({ pins: [], kept: 'kept', problems: [] })
})

it('refuses an agent with 403 and stores nothing, for itself or for the person', async () => {
  const refused = await keep(asAgent, SCHEDULE_PLANS_TERMINALS)
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json()).toMatchObject({ code: 'sidebarPinsRefused' })
  expect(refused.json().error).toMatch(/Nothing was changed\.$/)
  expect(rows()).toEqual([])
  expect(changes()).toEqual([])

  expect((await keep(asPerson(owner), WITHOUT_HOME)).statusCode).toBe(200)
  const before = stored()
  expect((await keep(asAgent, SCHEDULE_PLANS_TERMINALS)).statusCode).toBe(403)
  expect((await keep(asAgent, [...SHIPPED_PINS])).statusCode).toBe(403)
  expect(stored()).toBe(before)
  expect((await read(asPerson(owner))).pins).toEqual(WITHOUT_HOME)
})

it('refuses a list with a problem in words and changes nothing', async () => {
  // A page pinned twice, the chat's entry, All pages, Settings, a made-up page and a list that is not a list.
  for (const bad of [['home', 'notes', 'home'], ['messages'], ['allPages'], ['settings'], ['made-up-page'], { pins: ['home'] }, 'home']) {
    const problems = problemsWithThePins(bad)
    expect(problems, JSON.stringify(bad)).not.toEqual([])
    const refused = await keep(asPerson(owner), bad)
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json()).toMatchObject({ code: 'sidebarPinsRefused' })
    expect(refused.json().error).toBe(`${problems.join(' ')} Nothing was changed.`)
  }
  expect(rows()).toEqual([])
  expect(changes()).toEqual([])
})

it('draws the shipped pins from a kept row it cannot read, says that it could not read it, and leaves the row as it was', async () => {
  const name = sidebarPinsSettingName(owner)
  db.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(name, 'made-up words that are not a list')
  expect(await read(asPerson(owner))).toEqual({ pins: [...SHIPPED_PINS], kept: 'unreadable', problems: [THE_KEPT_PINS_ARE_NOT_JSON] })

  const twice = ['plans', 'plans']
  db.client.sqlite.prepare('UPDATE runtime_settings SET value = ? WHERE name = ?').run(JSON.stringify(twice), name)
  const answer = await read(asPerson(owner))
  expect(answer.pins).toEqual([...SHIPPED_PINS])
  expect(answer.kept).toBe('unreadable')
  expect(answer.problems).toEqual(problemsWithThePins(twice))
  expect(answer.problems).not.toEqual([])
  expect(rows()).toEqual([{ name, value: JSON.stringify(twice) }])
  // The second person's own sidebar is untouched by the first person's broken row.
  expect(await read(asPerson(SECOND_PERSON))).toEqual({ pins: [...SHIPPED_PINS], kept: 'nothing-kept', problems: [] })

  // Keeping a new list writes the unreadable row down whole in the change, so nothing of it is lost.
  expect((await keep(asPerson(owner), WITHOUT_HOME)).statusCode).toBe(200)
  const change = JSON.parse(changes().at(-1)!.old_value ?? 'null')
  expect(change).toEqual({ pins: [...SHIPPED_PINS], kept: 'unreadable', unreadableRow: JSON.stringify(twice) })
})
