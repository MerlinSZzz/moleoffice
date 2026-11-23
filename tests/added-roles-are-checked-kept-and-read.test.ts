// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { RoleCard } from '../src/shared/roles.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb, governsTheWholeProject } from './helpers.ts'

let db: TestDb, app: FastifyInstance
/** Each case's own added role, so its history and its held cards are only the ones that case made. */
let theRole = 'archivist'
let caseNumber = 0
const owner = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const card = (name = theRole): RoleCard => ({ name, duties: 'Made-up role: reads the archive.', rung: null, powers: ['Reading everything'], appointedBy: 'the person', appoints: 'nobody', mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null }, reportsTo: 'The person.', whatEndsIt: 'When the archive is read.', workArea: { grain: 'folders', most: 'no limit', says: 'Name the archive folders.' } })
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app.close(); db.close() })
beforeEach(() => { caseNumber += 1; theRole = `archivist-case-${String(caseNumber)}` })
const send = (path: string, payload: unknown, headers = owner) => app.inject({ method: 'POST', url: '/api/roles/added' + path, headers, payload: payload as object })
async function rows() { const reply = await app.inject({ url: '/api/roles/added', headers: owner }); expect(reply.statusCode, reply.body).toBe(200); return reply.json() }
async function current(name = theRole) { const all = await rows(); return [...all.cards, ...all.leftOut].find((row: { name: string }) => row.name === name) }
async function apply(choice: RoleCard, extra = {}, headers = owner) { return send('', { version: (await current(choice.name))?.version ?? null, card: choice, because: 'Made-up card choice', ...extra }, headers) }
async function restore(name = theRole, from = 'shipped', headers = owner, extra = {}) { return send('/restore', { name, version: (await current(name))?.version ?? null, from, because: 'Made-up restoration', ...extra }, headers) }
async function snapshot() { const roles = await import('../src/server/lib/roles.ts'); return JSON.stringify({ row: db.client.sqlite.prepare("SELECT * FROM runtime_settings WHERE name LIKE 'office.role:%' ORDER BY name").all(), ledger: db.client.sqlite.prepare("SELECT * FROM changes WHERE record_id LIKE 'setting:role:%' ORDER BY rowid").all(), words: db.client.sqlite.prepare("SELECT id,data,deleted_at FROM records WHERE kind='role_card_words' ORDER BY id").all(), wordsHistory: db.client.sqlite.prepare("SELECT count(*) AS n FROM revisions WHERE kind='role_card_words'").get(), joined: roles.theRoleCards(), saved: await rows() }) }
async function agent(handle: string, role = 'worker') {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle, name: 'Made-up ' + handle, role, ...(role === 'worker' ? { workArea: ['archive'] } : {}) } })
  expect(made.statusCode, made.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts'), { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const row = agentByHandle(handle)!
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(row.id, null) }
}
async function appoint(handle: string, role: string) { const reply = await app.inject({ method: 'POST', url: '/api/roles/card/' + handle, headers: owner, payload: { role } }); expect(reply.statusCode, reply.body).toBe(201) }
async function readArchive(headers: ReturnType<typeof Object.assign>) { return app.inject({ url: '/api/open-loops', headers }) }

it('locks every shipped agent and person card on Apply, preview, restore and removal', async () => {
  const roles = await import('../src/server/lib/roles.ts')
  const shipped = JSON.stringify(roles.theShippedRoleCards()), file = readFileSync(roles.theRoleCardsFile(), 'utf8')
  for (const name of ['worker', 'supervisor', 'secretary', 'inspector', 'administrator']) {
    for (const [path, payload] of [['', { card: card(name), version: null, because: 'Made-up forbidden edit' }], ['/preview', { card: card(name) }], ['/restore', { name, version: null, from: 'made-up-change', because: 'Made-up forbidden restore' }], ['/restore', { name, version: null, from: 'shipped', because: 'Made-up forbidden removal' }]] as const) {
      const before = await snapshot(), refused = await send(path, payload)
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json()).toMatchObject({ code: 'addedRoleRefused' })
      expect(refused.json().error).toContain(`${name} is one of the office's own roles, and those are locked.`)
      expect(await snapshot()).toBe(before)
      expect(JSON.stringify(roles.theShippedRoleCards())).toBe(shipped)
      expect(readFileSync(roles.theRoleCardsFile(), 'utf8')).toBe(file)
    }
  }
})

it('changes the real permission check, public role list, registry and census without a restart', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const acting = await agent('made-up-archivist')
  await appoint('made-up-archivist', theRole)
  expect((await readArchive(acting)).statusCode).toBe(200)
  const denied = await app.inject({ method: 'POST', url: '/api/records', headers: acting, payload: { kind: 'note', title: 'Made-up archive note', data: {} } })
  expect(denied.statusCode, denied.body).toBe(403)
  const list = (await app.inject({ url: '/api/roles', headers: owner })).json()
  expect(list.cards.find((one: RoleCard) => one.name === theRole)).toMatchObject({ source: 'added' })
  expect(list.cards.filter((one: { source: string }) => one.source === 'built-in')).toHaveLength(4)
  const census = (await app.inject({ url: '/api/roles/who-holds-them', headers: owner })).json()
  expect(census.cards.find((one: { card: string }) => one.card === theRole)).toMatchObject({ holds: 1, holders: [{ name: 'Made-up made-up-archivist' }] })
  const roles = await import('../src/server/lib/roles.ts'), shared = await import('../src/shared/roles.ts')
  expect(shared.theCardOffTheTree(roles.theRoleCards())?.name).toBe('inspector')
  expect((await apply({ ...card(), powers: [] })).statusCode).toBe(200)
  expect((await readArchive(acting)).statusCode).toBe(403)
  await appoint('made-up-archivist', 'worker')
  expect((await restore()).statusCode).toBe(200)
})

it('previews the complete stored difference, acts gained and lost, and holders without writing', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const holder = await agent('made-up-preview-holder'); await appoint('made-up-preview-holder', theRole)
  const before = await snapshot(), choice = { ...card(), duties: 'Made-up edited duties.', powers: ['Records'] }
  const preview = await send('/preview', { card: choice, name: theRole })
  expect(preview.statusCode, preview.body).toBe(200)
  const checked = preview.json()
  expect(checked.problems).toEqual([])
  expect(checked.difference).toEqual([{ field: 'duties', before: card().duties, after: choice.duties }, { field: 'powers', before: card().powers, after: choice.powers }])
  expect(checked.gained.map((one: { act: string }) => one.act)).toContain('record.write')
  expect(checked.lost.map((one: { act: string }) => one.act)).toContain('project.open-loops')
  expect(checked.holders[0].handle).toBe('made-up-preview-holder')
  expect(checked.reminders.join(' ')).toContain('Changes to its permissions take effect for them when Apply runs.')
  expect(await snapshot()).toBe(before)
  expect((await apply(choice, { version: checked.version })).statusCode).toBe(200)
  expect((await current()).card).toEqual(choice)
  const shared = await import('../src/shared/roles.ts'), roles = await import('../src/server/lib/roles.ts')
  expect(shared.powersOn(roles.theRoleCards(), choice).flatMap(power => power.acts)).toEqual(checked.acts)
  const afterActs = new Set(shared.powersOn(roles.theRoleCards(), choice).flatMap(power => power.acts.map(one => one.act)))
  for (const gained of checked.gained) expect(afterActs.has(gained.act)).toBe(true)
  for (const lost of checked.lost) expect(afterActs.has(lost.act)).toBe(false)
  const gainedWrite = await app.inject({ method: 'POST', url: '/api/records', headers: holder, payload: { kind: 'note', title: 'Made-up preview permission proof', data: {} } })
  expect(gainedWrite.statusCode, gainedWrite.body).toBe(201)
  expect((await readArchive(holder)).statusCode).toBe(403)
})

it('refuses incomplete, tree, permanent person powers, unknown references, renames, stale versions and held removal atomically', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const original = await current()
  const { workArea: _removed, ...withoutArea } = card()
  const cases = [
    [withoutArea, 'workArea'], [{ ...card(), rung: 1 }, 'rung'], [{ ...card(), appointedBy: 'the tree' }, 'appointedBy'],
    [{ ...card(), powers: ["The person's own acts"] }, 'Chapter 8'], [{ ...card(), powers: ['Made-up unknown power'] }, 'power'],
    [{ ...card(), powers: Array(10).fill('Records') }, 'at most'], [{ ...card(), mustRead: { chapters: [{ chapter: 99, level: 'full' }] } }, 'chapter 99'],
    [card('worker'), 'locked'], [card('renamed-archivist'), 'name cannot change'],
  ] as const
  for (const [choice, why] of cases) {
    const before = await snapshot()
    const refused = await send('', { card: choice, version: original.version, because: 'Made-up invalid card', ...(choice.name === 'renamed-archivist' ? { name: theRole } : {}) })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json().error).toContain(why)
    expect(refused.json()).toMatchObject({ code: 'addedRoleRefused' })
    expect(await snapshot()).toBe(before)
  }
  expect((await apply({ ...card(), powers: ['Records'] })).statusCode).toBe(200)
  const beforeStale = await snapshot(), stale = await send('', { card: card(), version: original.version, because: 'Made-up stale card' })
  expect(stale.statusCode).toBe(409); expect(stale.json().error).toContain('changed after you read'); expect(await snapshot()).toBe(beforeStale)
  await agent('made-up-held-card'); await appoint('made-up-held-card', theRole)
  const beforeRemoval = await snapshot(), refused = await restore()
  expect(refused.statusCode, refused.body).toBe(400); expect(refused.json().error).toContain('made-up-held-card'); expect(refused.json().error).toContain('Give them another card first.'); expect(await snapshot()).toBe(beforeRemoval)
  for (const name of ['never-added-archive', 'removed-archive']) {
    if (name === 'removed-archive') {
      expect((await apply(card(name))).statusCode).toBe(200)
      expect((await restore(name)).statusCode).toBe(200)
    }
    const before = await snapshot(), reason = `There is no added card called ${name}, so there is nothing to remove.`
    const preview = await send('/preview', { card: null, name, from: 'shipped' })
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json().problems).toContain(reason)
    expect(await snapshot()).toBe(before)
    const removal = await restore(name)
    expect(removal.statusCode, removal.body).toBe(400)
    expect(removal.json()).toMatchObject({ code: 'addedRoleRefused', error: reason + ' Nothing was changed.' })
    expect(await snapshot()).toBe(before)
  }
})

it('keeps complete history and puts back earlier permissions through the doors alone', async () => {
  const { actsRefusedTo } = await import('../src/shared/roles.ts'), { theRoleCards } = await import('../src/server/lib/roles.ts')
  expect((await apply(card())).statusCode).toBe(200)
  const first = await current()
  expect(actsRefusedTo(theRoleCards(), theRole).has('record.write')).toBe(true)
  expect((await apply({ ...card(), powers: ['Records'] })).statusCode).toBe(200)
  expect(actsRefusedTo(theRoleCards(), theRole).has('record.write')).toBe(false)
  const history = (await app.inject({ url: `/api/roles/added/history?name=${theRole}`, headers: owner })).json()
  expect(history.versions).toHaveLength(2)
  expect(history.versions[1]).toMatchObject({ before: { card: null }, after: { card: card(), because: 'Made-up card choice' }, by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  expect((await restore(theRole, history.versions[1].id)).statusCode).toBe(200)
  expect((await current()).card).toEqual(first.card)
  expect((await current()).version).not.toBe(first.version)
  expect(actsRefusedTo(theRoleCards(), theRole).has('record.write')).toBe(true)
  expect((await restore()).statusCode).toBe(200)
  expect(await current()).toBeUndefined()
  expect(theRoleCards().cards.some(one => one.name === theRole)).toBe(false)
  expect(actsRefusedTo(theRoleCards(), theRole).has('record.read')).toBe(true)
  expect((await app.inject({ url: `/api/roles/added/history?name=${theRole}`, headers: owner })).json().versions).toHaveLength(4)
})

it('requires the person or owner authority, or a secretary with words bound to the exact sorted card that a decision of the owner\'s rests on', async () => {
  const worker = await agent('made-up-role-worker'), secretary = await agent(THE_TEST_OFFICES_SECRETARY.handle, 'secretary')
  const { sortedRoleCard } = await import('../src/server/lib/added-roles.ts')
  const said = 'Please keep this made-up archive role.'
  const words = (choice: unknown, name = typeof choice === 'object' && choice !== null && 'name' in choice ? String(choice.name) : theRole, where = 'terminal') => ({ saidBy: THE_TEST_OFFICES_OWNER.id, words: said, where, when: '2026-09-26 10:00', for: ['office.set-role:' + JSON.stringify({ name, card: sortedRoleCard(choice) })] })
  const fileAsTheOwner = async (kind: string, title: string, data: Record<string, unknown>) => { const made = await app.inject({ method: 'POST', url: '/api/records', headers: owner, payload: { kind, title, data } }); expect(made.statusCode, made.body).toBe(theAnswerToAWriteInATestOffice(owner, { kind, data })); return String(made.json().record.id) }
  // A card's words are the owner's words, so the secretary's act on an added card's words record also needs a live
  // decision of the owner's resting on a message of the person's that holds the warrant's words (wave 13w's rule).
  const ON_THEIR_DECISION = "An agent changes a role card's words only on the person's words, where a decision of the owner's rests on them"
  async function refusedOnTheWords(request: () => Promise<{ statusCode: number; body: string; json: () => { error: string } }>, because: string) {
    const before = await snapshot(), refused = await request()
    expect(refused.statusCode, refused.body).toBe(403); expect(refused.json().error).toContain(ON_THEIR_DECISION); expect(refused.json().error).toContain(because)
    expect(await snapshot()).toBe(before)
  }
  for (const [acting, warrant] of [[worker, undefined], [worker, words(card())], [secretary, undefined], [secretary, words(card('another-card'))]] as const) {
    const before = await snapshot(), denied = await apply(card(), warrant ? { warrant } : {}, acting)
    expect(denied.statusCode, denied.body).toBe(403); expect(denied.json()).toMatchObject({ code: 'addedRoleRefused' }); expect(await snapshot()).toBe(before)
  }
  await refusedOnTheWords(() => apply(card(), { warrant: words(card()) }, secretary), "Mole Office cannot check that the warrant's words are the person's")
  const message = await fileAsTheOwner('message', 'Made-up words about the archive role', { body: `Made-up first line.\n\n${said}\n\nMade-up last line.`, to: [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }] })
  const onIt = `message:${message}`
  await refusedOnTheWords(() => apply(card(), { warrant: words(card(), theRole, onIt) }, secretary), `No live decision of the owner's rests on message ${message}.`)
  await fileAsTheOwner('decision', 'Made-up decision on the archive role', { ...governsTheWholeProject(), replaces: [], decided_by: 'the owner', authority: 'the owner said so', authority_reference: message, option_taken: 'Made-up.', because: 'Made-up.' })
  expect((await apply(card(), { warrant: words(card(), theRole, onIt) }, secretary)).statusCode).toBe(200)
  const audit = db.client.sqlite.prepare('SELECT warrant,actor_id FROM changes WHERE record_id=?').get(`setting:role:${theRole}`) as { warrant: string; actor_id: string }
  expect(JSON.parse(audit.warrant).for).toEqual(words(card()).for)
  expect(audit.actor_id).toBe(THE_TEST_OFFICES_SECRETARY.handle)
  const reworded = { ...card(), duties: 'Made-up role: reads the archive twice.' }
  await refusedOnTheWords(() => apply(reworded, { warrant: words(reworded) }, secretary), "Mole Office cannot check that the warrant's words are the person's")
  expect((await apply(reworded, { warrant: words(reworded, theRole, onIt) }, secretary)).statusCode).toBe(200)
  expect((await apply({ ...card(), powers: ['Records'] }, {}, owner)).statusCode).toBe(200)
  expect((await apply(card('librarian'))).statusCode).toBe(200)
  const beforeRemoval = await snapshot()
  const wrongRemoval = await restore('librarian', 'shipped', secretary, { warrant: words(null, theRole, onIt) })
  expect(wrongRemoval.statusCode, wrongRemoval.body).toBe(403); expect(await snapshot()).toBe(beforeRemoval)
  await refusedOnTheWords(() => restore(theRole, 'shipped', secretary, { warrant: words(null, theRole) }), "Mole Office cannot check that the warrant's words are the person's")
  expect((await restore(theRole, 'shipped', secretary, { warrant: words(null, theRole, onIt) })).statusCode).toBe(200)
  const authority = await import('../src/server/lib/worldauthority.ts')
  const previousStarter = process.env.MOLE_OFFICE_WORLD_STARTED_BY
  try {
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'made-up-role-worker'; authority.forgetTheWorldsOwnAuthority()
    const underAuthority = await apply(card('world-archivist'), {}, worker)
    expect(underAuthority.statusCode, underAuthority.body).toBe(200)
  } finally {
    if (previousStarter === undefined) delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    else process.env.MOLE_OFFICE_WORLD_STARTED_BY = previousStarter
    authority.forgetTheWorldsOwnAuthority()
  }
})

it('leaves out a saved invalid card, names its problems, and restores a checked history version', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const history = (await app.inject({ url: `/api/roles/added/history?name=${theRole}`, headers: owner })).json()
  db.client.sqlite.prepare('UPDATE runtime_settings SET value=? WHERE name=?').run(JSON.stringify({ ...card(), powers: ['Made-up missing power'] }), `office.role:${theRole}`)
  const store = await import('../src/server/lib/added-roles.ts'), roles = await import('../src/server/lib/roles.ts')
  store.loadAddedRoles()
  expect(roles.theRoleCards().cards.some(one => one.name === theRole)).toBe(false)
  const listed = (await app.inject({ url: '/api/roles', headers: owner })).json()
  expect(listed.leftOut[0].problems.join(' ')).toContain('Made-up missing power')
  expect((await rows()).leftOut).toHaveLength(1)
  expect((await restore(theRole, history.versions[0].id)).statusCode).toBe(200)
  expect((await rows()).leftOut).toEqual([])
  expect(roles.theRoleCards().cards.find(one => one.name === theRole)).toEqual(card())
  db.client.sqlite.prepare('UPDATE runtime_settings SET value=? WHERE name=?').run('{ broken JSON', `office.role:${theRole}`)
  store.loadAddedRoles(); expect((await rows()).leftOut[0].problems[0]).toContain('not JSON')
  expect((await restore()).statusCode).toBe(200)
  db.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run(`office.role:${theRole}`, JSON.stringify({ ...card(), mustRead: null }))
  store.loadAddedRoles(); expect((await rows()).leftOut[0].problems.join(' ')).toContain('mustRead')
  expect((await restore(theRole, history.versions[0].id)).statusCode).toBe(200)
})

it('refuses a made-here name in another project, and the old project door writes nothing', async () => {
  db.api.createRecord({ kind: 'role_card', title: 'Made-up unenforced card', data: { roleName: theRole, card: card(), madeHere: true }, workspaceId: 'made-up-another-project', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  const before = await snapshot(), reply = await apply(card())
  expect(reply.statusCode, reply.body).toBe(400); expect(reply.json().error).toContain('One word means one thing'); expect(await snapshot()).toBe(before)
  // Switched off in wave 13r round 5: the door refuses every write and sends the writer here.
  const old = await app.inject({ method: 'POST', url: '/api/roles/cards', headers: owner, payload: { card: card('made-up-project-card') } })
  expect(old.statusCode, old.body).toBe(410); expect(old.json().error).toContain('Add an office role on the Role cards page')
  expect(db.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='role_card' AND json_extract(data,'$.roleName')='made-up-project-card'").get()).toEqual({ n: 0 })
  const roles = await import('../src/server/lib/roles.ts')
  expect(roles.theRoleCards().cards.some(one => one.name === 'made-up-project-card')).toBe(false)
})

it('pages history ten at a time and refuses a change from another card’s history', async () => {
  for (let count = 0; count < 12; count++) expect((await apply({ ...card(), duties: 'Made-up archive duties ' + count })).statusCode).toBe(200)
  const first = (await app.inject({ url: `/api/roles/added/history?name=${theRole}&offset=0`, headers: owner })).json()
  const second = (await app.inject({ url: `/api/roles/added/history?name=${theRole}&offset=10`, headers: owner })).json()
  expect(first.versions).toHaveLength(10); expect(first.next).toBe(10); expect(second.versions).toHaveLength(2); expect(second.next).toBeNull()
  expect((await apply(card('librarian'))).statusCode).toBe(200)
  const before = await snapshot(), denied = await restore('librarian', first.versions[0].id)
  expect(denied.statusCode).toBe(404); expect(await snapshot()).toBe(before)
})

it('rolls back the row if the ledger refuses its insert', async () => {
  const before = await snapshot()
  db.client.sqlite.exec(`CREATE TEMP TRIGGER refuse_role_ledger BEFORE INSERT ON changes WHEN NEW.record_id='setting:role:${theRole}' BEGIN SELECT RAISE(ABORT,'made-up ledger failure'); END`)
  try {
    const failed = await apply(card())
    expect(failed.statusCode).toBe(409); expect(failed.json().error).toContain('made-up ledger failure')
    expect(await snapshot()).toBe(before)
  } finally {
    // A TEMPORARY TRIGGER BELONGS TO THE CONNECTION, so it is dropped here rather than closed away
    // with a database of this case's own: the office is shared, and a later case writes this ledger.
    db.client.sqlite.exec('DROP TRIGGER IF EXISTS refuse_role_ledger')
  }
})

it('keeps forgetTheRoleCards and a test’s own declaration file working', async () => {
  const roles = await import('../src/server/lib/roles.ts'), guards = await import('../src/server/lib/records.ts')
  const shipped = roles.theShippedRoleCards(), custom = { ...shipped, cards: shipped.cards.map(one => ({ ...one, duties: 'Made-up test declaration duties.' })) }
  const file = join(db.file, '..', 'made-up-roles.json'); writeFileSync(file, JSON.stringify(custom))
  roles.forgetTheRoleCards(); expect(() => roles.theRoleCards()).toThrow('Nothing has read')
  roles.readTheRoleCards({ file, guardActKeys: guards.GOVERNANCE_GUARDS.flatMap(one => [one.actKey, one.personAct]) })
  expect(roles.theShippedRoleCards()).toEqual(custom)
  expect((await apply(card())).statusCode).toBe(200)
  expect(roles.theRoleCards().cards[0]!.duties).toBe('Made-up test declaration duties.')
  expect(roles.theShippedRoleCards().cards.some(one => one.name === theRole)).toBe(false)
})
