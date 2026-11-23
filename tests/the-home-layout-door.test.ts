// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR THAT KEEPS HOME'S LAYOUT FOR EACH PERSON. GET /api/home-layout answers the layout kept for the
 * person asking, and PUT /api/home-layout keeps a new one. Each person's layout is one runtime_settings
 * row named for that person, as the sidebar keeps its arrangement, and each change is written to the
 * changes table. Only the person writes their own row: an agent's write is refused and stores nothing.
 * The layout keeps the hidden parts and the projects Home shows, and a row kept in an older shape still
 * reads, with nothing it held lost and nothing refused.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import {
  HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C, THE_KEPT_LAYOUT_IS_NOT_JSON, applyMenuMove, chooseTheProject, homeLayoutSettingName,
  problemsWithTheHomeLayout, theHomeLayoutReadIn,
} from '../src/shared/home-layout.ts'

let db: TestDb, app: FastifyInstance
beforeEach(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); db.close() })

const SECOND_PERSON = 'made-up-second-person'
const asPerson = (id: string) => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': 'default' })
const asAgent = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-agent', 'x-mole-office-workspace': 'default' }
const owner = THE_TEST_OFFICES_OWNER.id

async function read(headers: Record<string, string>) {
  const reply = await app.inject({ url: '/api/home-layout', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  // Every plain answer says whether a permission narrowed it, and this one is never narrowed.
  const { narrowedByPermission, ...answer } = reply.json() as { layout: unknown; kept: string; problems: string[]; filledIn: string[]; narrowedByPermission: unknown }
  expect(narrowedByPermission).toBeNull()
  return answer
}
const keep = (headers: Record<string, string>, layout: unknown) => app.inject({ method: 'PUT', url: '/api/home-layout', headers, payload: { layout } })

function rows() {
  return db.client.sqlite.prepare("SELECT name, value FROM runtime_settings WHERE name LIKE 'home.layout%' ORDER BY name").all() as { name: string; value: string }[]
}
function changes() {
  return db.client.sqlite.prepare("SELECT record_id, actor_type, actor_id, new_value FROM changes WHERE record_id LIKE 'setting:home.layout%' ORDER BY rowid").all() as { record_id: string; actor_type: string; actor_id: string; new_value: string }[]
}
const stored = () => JSON.stringify({ rows: rows(), changes: changes() })

it('keeps a layout for the person who sends it, and a second person keeps one of their own', async () => {
  expect(await read(asPerson(owner))).toEqual({ layout: HOME_LAYOUT_A, kept: 'nothing-kept', problems: [], filledIn: [] })
  const first = await keep(asPerson(owner), HOME_LAYOUT_B)
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json()).toMatchObject({ layout: HOME_LAYOUT_B, written: true })
  expect(await read(asPerson(owner))).toEqual({ layout: HOME_LAYOUT_B, kept: 'kept', problems: [], filledIn: [] })
  // The second person has kept nothing yet, and sees A whatever the first one kept.
  expect(await read(asPerson(SECOND_PERSON))).toEqual({ layout: HOME_LAYOUT_A, kept: 'nothing-kept', problems: [], filledIn: [] })
  expect((await keep(asPerson(SECOND_PERSON), HOME_LAYOUT_C)).statusCode).toBe(200)
  expect((await read(asPerson(owner))).layout).toEqual(HOME_LAYOUT_B)
  expect((await read(asPerson(SECOND_PERSON))).layout).toEqual(HOME_LAYOUT_C)

  const kept = rows()
  expect(kept.map(row => row.name)).toEqual([homeLayoutSettingName(SECOND_PERSON), homeLayoutSettingName(owner)].sort())
  expect(JSON.parse(kept.find(row => row.name === homeLayoutSettingName(owner))!.value)).toEqual(HOME_LAYOUT_B)
  expect(JSON.parse(kept.find(row => row.name === homeLayoutSettingName(SECOND_PERSON))!.value)).toEqual(HOME_LAYOUT_C)
  const written = changes()
  expect(written.map(row => [row.record_id, row.actor_type, row.actor_id])).toEqual([
    [`setting:${homeLayoutSettingName(owner)}`, 'human', owner],
    [`setting:${homeLayoutSettingName(SECOND_PERSON)}`, 'human', SECOND_PERSON],
  ])
  expect(JSON.parse(written[0]!.new_value).layout).toEqual(HOME_LAYOUT_B)

  // The same layout again writes nothing and adds no change.
  const before = stored()
  const again = await keep(asPerson(owner), HOME_LAYOUT_B)
  expect(again.statusCode).toBe(200)
  expect(again.json()).toMatchObject({ layout: HOME_LAYOUT_B, written: false })
  expect(stored()).toBe(before)
})

it('refuses an agent with 403 and stores nothing, for itself or for the person', async () => {
  const refused = await keep(asAgent, HOME_LAYOUT_B)
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json()).toMatchObject({ code: 'homeLayoutRefused' })
  expect(refused.json().error).toMatch(/Nothing was changed\.$/)
  expect(rows()).toEqual([])
  expect(changes()).toEqual([])

  expect((await keep(asPerson(owner), HOME_LAYOUT_C)).statusCode).toBe(200)
  const before = stored()
  expect((await keep(asAgent, HOME_LAYOUT_B)).statusCode).toBe(403)
  expect((await keep(asAgent, HOME_LAYOUT_A)).statusCode).toBe(403)
  expect(stored()).toBe(before)
  expect((await read(asPerson(owner))).layout).toEqual(HOME_LAYOUT_C)
})

it('refuses a layout with a problem in words and changes nothing', async () => {
  const bad = { band: [], first: ['needs', 'needs', 'schedule'], second: [] }
  const refused = await keep(asPerson(owner), bad)
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.json()).toMatchObject({ code: 'homeLayoutRefused' })
  expect(refused.json().error).toContain(problemsWithTheHomeLayout(bad)[0])
  expect(rows()).toEqual([])
  expect(changes()).toEqual([])
})

it('draws A from a kept row it cannot read, says that it could not read it, and leaves the row as it was', async () => {
  const name = homeLayoutSettingName(owner)
  db.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(name, 'made-up words that are not a layout')
  expect(await read(asPerson(owner))).toEqual({ layout: HOME_LAYOUT_A, kept: 'unreadable', problems: [THE_KEPT_LAYOUT_IS_NOT_JSON], filledIn: [] })

  const broken = { band: [], first: ['needs', 'made-up-part'], second: [] }
  db.client.sqlite.prepare('UPDATE runtime_settings SET value = ? WHERE name = ?').run(JSON.stringify(broken), name)
  const answer = await read(asPerson(owner))
  expect(answer.layout).toEqual(HOME_LAYOUT_A)
  expect(answer.kept).toBe('unreadable')
  expect(answer.problems).toEqual(theHomeLayoutReadIn(broken).problems)
  expect(answer.problems).not.toEqual([])
  expect(rows()).toEqual([{ name, value: JSON.stringify(broken) }])
  // The second person's own Home is untouched by the first person's broken row.
  expect(await read(asPerson(SECOND_PERSON))).toEqual({ layout: HOME_LAYOUT_A, kept: 'nothing-kept', problems: [], filledIn: [] })
})

it('reads a row kept in the older shape into today\'s, with every part it held where it was, and keeps the new shape at the next move', async () => {
  const name = homeLayoutSettingName(owner)
  const old = { band: ['agents'], first: ['schedule'], second: ['needs'] }
  db.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(name, JSON.stringify(old))
  const answer = await read(asPerson(owner))
  const readIn = theHomeLayoutReadIn(old)
  expect(answer).toEqual({ layout: readIn.layout, kept: 'kept', problems: [], filledIn: readIn.filledIn })
  expect(readIn.filledIn).not.toEqual([])
  expect(problemsWithTheHomeLayout(answer.layout)).toEqual([])
  // Reading writes nothing: the row is as it was until the person moves something.
  expect(rows()).toEqual([{ name, value: JSON.stringify(old) }])
  // Keeping the layout as read writes it in today's shape, even with no move, because the row was in the older one.
  const same = await keep(asPerson(owner), readIn.layout)
  expect(same.statusCode, same.body).toBe(200)
  expect(same.json()).toMatchObject({ layout: readIn.layout, written: true })
  expect(JSON.parse(rows()[0]!.value)).toEqual(readIn.layout)
  expect(await read(asPerson(owner))).toEqual({ layout: readIn.layout, kept: 'kept', problems: [], filledIn: [] })
})

it('keeps the hidden parts and one chosen project for the person, and the second person still sees every project', async () => {
  const chosen = chooseTheProject(applyMenuMove(HOME_LAYOUT_B, 'agents', 'hidden'), 'made-up-project')
  const kept = await keep(asPerson(owner), chosen)
  expect(kept.statusCode, kept.body).toBe(200)
  expect(await read(asPerson(owner))).toEqual({ layout: chosen, kept: 'kept', problems: [], filledIn: [] })
  expect((await read(asPerson(owner))).layout).toMatchObject({ project: 'made-up-project', hidden: [...HOME_LAYOUT_B.hidden, 'agents'] })
  expect((await read(asPerson(SECOND_PERSON))).layout).toEqual(HOME_LAYOUT_A)
  // A layout with no project is refused by the door, which keeps only a whole layout.
  const { project: _left, ...noProject } = chosen
  expect((await keep(asPerson(owner), noProject)).statusCode).toBe(400)
  expect((await read(asPerson(owner))).layout).toEqual(chosen)
})
