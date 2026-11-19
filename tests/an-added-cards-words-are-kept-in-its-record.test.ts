// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD ADDED ON THE ROLES PAGE KEEPS ITS WORDS IN ITS role_card_words RECORD, and its stored row keeps only
 * the powers and the structure. This is wave 13r's added cards joined to wave 13w's words records.
 *
 * Proved here through the doors:
 * - Apply writes the row and the record as one change, and a refused or failed Apply writes neither.
 * - Removing the card removes its record, and a version put back from history files a new one.
 * - The record door cannot take an added card's only words away, and a change made there is the card's at once.
 * - A start on an office that stored an added card before its words moved files its record and strips its
 *   row, once. That needs the added cards read before the filing (src/server/index.ts, `buildApp`).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_WORDS_OF_A_CARD, theCardWithoutItsWords, theWordsOf, type RoleCard, type RolesDeclaration } from '../src/shared/roles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, apiServerArguments, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
let db: TestDb, app: FastifyInstance
let addedRoles: typeof import('../src/server/lib/added-roles.ts')
let words: typeof import('../src/server/lib/card-words.ts')
let roles: typeof import('../src/server/lib/roles.ts')
const owner = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const card = (name = 'archivist'): RoleCard => ({ name, duties: 'Made-up role: reads the archive.', rung: null, powers: ['Reading everything'], appointedBy: 'the person', appoints: 'nobody', mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null }, reportsTo: 'The person.', whatEndsIt: 'When the archive is read.', workArea: { grain: 'folders', most: 'no limit', says: 'Name the archive folders.' } })
const handbook = { howItWorks: { en: 'Made-up: the archivist reads the archive before anything else.', zh: '虚构：档案员先读档案。' } }
const theStructureOf = (choice: RoleCard): Record<string, unknown> => theCardWithoutItsWords(choice as unknown as Record<string, unknown>)
const wordsIn = (data: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(data).filter(([key]) => key === 'roleName' || (THE_WORDS_OF_A_CARD as readonly string[]).includes(key)))

/**
 * ONE OFFICE FOR THE FILE. An added card is one office-wide store rather than a project, so a case
 * must start with no added card and no card-words record: the reset below removes every row and
 * record a case leaves, and the next case applies the card it needs itself. That is the empty store
 * the first case measures, and the state the real start's filing needs.
 */
beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  addedRoles = await import('../src/server/lib/added-roles.ts')
  words = await import('../src/server/lib/card-words.ts')
  roles = await import('../src/server/lib/roles.ts')
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
})

afterEach(() => {
  const sqlite = db.client.sqlite
  // A CASE THAT BREAKS THE WORDS DOOR LEAVES A TEMPORARY TRIGGER, which used to die with its own
  // connection. In a shared office it would refuse every later write, so both names are dropped.
  sqlite.exec('DROP TRIGGER IF EXISTS refuse_new_words')
  sqlite.exec('DROP TRIGGER IF EXISTS refuse_changed_words')
  sqlite.prepare("DELETE FROM runtime_settings WHERE name LIKE 'office.role:%'").run()
  sqlite.prepare("DELETE FROM changes WHERE record_id LIKE 'setting:role:%'").run()
  const held = sqlite.prepare("SELECT id FROM records WHERE kind = 'role_card_words'").all() as { id: string }[]
  for (const { id } of held) {
    sqlite.prepare('DELETE FROM links WHERE from_id = ? OR to_id = ?').run(id, id)
    sqlite.prepare('DELETE FROM changes WHERE record_id = ?').run(id)
    sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(id)
    sqlite.prepare('DELETE FROM records WHERE id = ?').run(id)
  }
  addedRoles.loadAddedRoles()
})
const sql = () => db.client.sqlite
const send = (path: string, payload: unknown, headers = owner) => app.inject({ method: 'POST', url: '/api/roles/added' + path, headers, payload: payload as object })
async function rows() { const reply = await app.inject({ url: '/api/roles/added', headers: owner }); expect(reply.statusCode, reply.body).toBe(200); return reply.json() }
async function current(name = 'archivist') { const all = await rows(); return [...all.cards, ...all.leftOut].find((row: { name: string }) => row.name === name) }
async function apply(choice: RoleCard, extra = {}) { return send('', { version: (await current(choice.name))?.version ?? null, card: choice, because: 'Made-up card choice', ...extra }) }
async function restore(name = 'archivist', from = 'shipped') { return send('/restore', { name, version: (await current(name))?.version ?? null, from, because: 'Made-up restoration' }) }
/** The card as GET /api/roles serves it, or undefined when the office does not hold it. */
async function theCard(name = 'archivist'): Promise<RoleCard | undefined> { const reply = await app.inject({ url: '/api/roles', headers: owner }); expect(reply.statusCode, reply.body).toBe(200); return (reply.json().cards as RoleCard[]).find(one => one.name === name) }
function storedRow(name = 'archivist'): unknown { const row = sql().prepare('SELECT value FROM runtime_settings WHERE name=?').get('office.role:' + name) as { value: string } | undefined; return row === undefined ? undefined : JSON.parse(row.value) }
function wordsRecords(name = 'archivist', live = true) {
  const found = sql().prepare(`SELECT id, data, deleted_at AS deletedAt FROM records WHERE kind='role_card_words' AND json_extract(data,'$.roleName')=?${live ? ' AND deleted_at IS NULL' : ''} ORDER BY rowid`).all(name) as { id: string; data: string; deletedAt: string | null }[]
  return found.map(one => ({ ...one, data: JSON.parse(one.data) as Record<string, unknown> }))
}
/** Where an added card is kept: its rows and every words record. */
const theStore = () => JSON.stringify({ rows: sql().prepare("SELECT * FROM runtime_settings WHERE name LIKE 'office.role:%' ORDER BY name").all(), words: sql().prepare("SELECT id,data,deleted_at,updated_at FROM records WHERE kind='role_card_words' ORDER BY id").all() })
/** The store, and how many change and revision rows the office holds, so "wrote nothing" is measured. */
const everything = () => JSON.stringify({ store: theStore(), changes: sql().prepare('SELECT count(*) AS n FROM changes').get(), revisions: sql().prepare('SELECT count(*) AS n FROM revisions').get() })

it('keeps the powers and the structure in the row and the words in one record, and an edit changes that record', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  expect(storedRow()).toEqual(theStructureOf(card()))
  expect(JSON.stringify(storedRow())).not.toContain(card().duties)
  const [held, ...more] = wordsRecords()
  expect(more).toEqual([])
  expect(wordsIn(held!.data)).toEqual({ roleName: 'archivist', ...theWordsOf(card()) })
  expect(held!.data['copiedFrom'], 'the Roles page wrote it, so nothing was copied').toBeUndefined()
  expect(sql().prepare('SELECT op, actor_type AS type, actor_id AS id FROM revisions WHERE record_id=? ORDER BY seq').all(held!.id)).toEqual([{ op: 'create', type: 'human', id: THE_TEST_OFFICES_OWNER.id }])
  expect(theWordsOf((await theCard())!)).toEqual(theWordsOf(card()))
  expect((await current()).card).toEqual(card())

  const edited = { ...card(), duties: 'Made-up edited duties.', ...handbook }
  expect((await apply(edited, { because: 'Made-up handbook added' })).statusCode).toBe(200)
  expect(storedRow()).toEqual(theStructureOf(card()))
  const [same] = wordsRecords()
  expect(same!.id).toBe(held!.id)
  expect(wordsIn(same!.data)).toEqual({ roleName: 'archivist', ...theWordsOf(edited) })
  expect(same!.data).toMatchObject({ howItWorks: handbook.howItWorks.en, howItWorksZh: handbook.howItWorks.zh })
  expect(sql().prepare('SELECT op, note FROM revisions WHERE record_id=? ORDER BY seq DESC LIMIT 1').get(held!.id)).toEqual({ op: 'update', note: 'Made-up handbook added' })
  expect((await current()).card).toEqual(edited)
  expect(theWordsOf((await theCard())!)).toEqual(theWordsOf(edited))

  expect((await apply(card())).statusCode).toBe(200)
  expect(wordsIn(wordsRecords()[0]!.data), 'a handbook the card no longer has is taken out of the record').toEqual({ roleName: 'archivist', ...theWordsOf(card()) })

  const written = () => sql().prepare('SELECT count(*) AS n FROM revisions WHERE record_id=?').get(held!.id)
  const before = written()
  expect((await apply({ ...card(), powers: ['Records'] })).statusCode).toBe(200)
  expect(storedRow()).toEqual(theStructureOf({ ...card(), powers: ['Records'] }))
  expect(written(), 'a change of powers alone does not write the words').toEqual(before)
})

it('writes neither the row nor the record on a preview or a refused Apply', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const before = everything(), changed = { ...card(), duties: 'Made-up previewed duties.', ...handbook }
  const preview = await send('/preview', { card: changed, name: 'archivist' })
  expect(preview.statusCode, preview.body).toBe(200)
  expect(preview.json().problems).toEqual([])
  expect(everything()).toBe(before)
  const { duties: _gone, ...withoutDuties } = changed
  for (const refused of [withoutDuties as RoleCard, { ...changed, powers: ['Made-up unknown power'] }]) {
    const reply = await apply(refused)
    expect(reply.statusCode, reply.body).toBe(400)
    expect(everything()).toBe(before)
  }
  const stale = await send('', { card: changed, version: 'made-up-old-version', because: 'Made-up stale Apply' })
  expect(stale.statusCode, stale.body).toBe(409)
  expect(everything()).toBe(before)
})

it('stores neither the row nor the record when the words record cannot be written', async () => {
  const empty = everything()
  sql().exec("CREATE TEMP TRIGGER refuse_new_words BEFORE INSERT ON records WHEN NEW.kind='role_card_words' BEGIN SELECT RAISE(ABORT,'made-up words failure'); END")
  const failed = await apply(card())
  expect(failed.statusCode).toBe(409); expect(failed.body).toContain('made-up words failure')
  expect(everything()).toBe(empty)
  expect(await current()).toBeUndefined()
  sql().exec('DROP TRIGGER refuse_new_words')

  expect((await apply(card())).statusCode).toBe(200)
  const kept = everything(), read = await current()
  sql().exec("CREATE TEMP TRIGGER refuse_changed_words BEFORE UPDATE ON records WHEN OLD.kind='role_card_words' BEGIN SELECT RAISE(ABORT,'made-up words failure'); END")
  const edit = await apply({ ...card(), duties: 'Made-up duties that are never kept.', powers: ['Records'] })
  expect(edit.statusCode).toBe(409); expect(edit.body).toContain('made-up words failure')
  expect(everything()).toBe(kept)
  expect(storedRow()).toEqual(theStructureOf(card()))
  expect(await current()).toEqual(read)
})

it('removes the record with the card, and a version put back from history files a new one', async () => {
  const first = { ...card(), ...handbook }
  expect((await apply(first)).statusCode).toBe(200)
  const [held] = wordsRecords()
  expect((await restore()).statusCode).toBe(200)
  expect(storedRow()).toBeUndefined()
  expect(wordsRecords()).toEqual([])
  expect(wordsRecords('archivist', false)).toMatchObject([{ id: held!.id, deletedAt: expect.any(String) }])
  expect(await theCard()).toBeUndefined()

  const history = (await app.inject({ url: '/api/roles/added/history?name=archivist', headers: owner })).json()
  const added = history.versions.find((one: { before: { card: unknown } }) => one.before.card === null)
  expect(added.after.card, 'the history keeps the whole card, words and all').toEqual(first)
  expect((await restore('archivist', added.id)).statusCode).toBe(200)
  const [again, ...more] = wordsRecords()
  expect(more).toEqual([])
  expect(again!.id).not.toBe(held!.id)
  expect(wordsIn(again!.data)).toEqual({ roleName: 'archivist', ...theWordsOf(first) })
  expect(storedRow()).toEqual(theStructureOf(first))
  expect(theWordsOf((await theCard())!)).toEqual(theWordsOf(first))
})

it('reads a change on the record page as the card’s words at once, and refuses an Apply made before it', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const read = await current(), [held] = wordsRecords()
  const patched = await app.inject({ method: 'PATCH', url: `/api/records/${held!.id}`, headers: owner, payload: { dataPatch: { duties: 'Made-up duties from the record page.' } } })
  expect(patched.statusCode, patched.body).toBe(200)
  expect((await current()).card.duties).toBe('Made-up duties from the record page.')
  expect((await theCard())!.duties).toBe('Made-up duties from the record page.')
  expect((await current()).version).not.toBe(read.version)
  const before = everything()
  const stale = await send('', { card: { ...card(), powers: ['Records'] }, version: read.version, because: 'Made-up Apply read before the record changed' })
  expect(stale.statusCode, stale.body).toBe(409)
  expect(everything()).toBe(before)
})

it('refuses a record write that would take an added card’s only words away, and writes nothing', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const [held] = wordsRecords(), before = everything()
  const cases = [
    ['PATCH', { dataPatch: { duties: null } }, 400, 'These words would take the "archivist" card out of use.'],
    ['PATCH', { dataPatch: { roleName: 'worker' } }, 409, `${held!.id} holds the only words of the "archivist" card`],
    ['DELETE', undefined, 409, `${held!.id} holds the only words of the "archivist" card`],
  ] as const
  for (const [method, payload, status, says] of cases) {
    const reply = await app.inject({ method, url: `/api/records/${held!.id}`, headers: owner, ...(payload === undefined ? {} : { payload }) })
    expect(reply.statusCode, reply.body).toBe(status)
    expect(reply.json().error).toContain(says)
    expect(everything()).toBe(before)
  }
  expect(theWordsOf((await theCard())!)).toEqual(theWordsOf(card()))
})

it('does not restore the words of a removed card, which come back only with the card', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const [held] = wordsRecords()
  expect((await restore()).statusCode).toBe(200)
  const before = everything()
  const reply = await app.inject({ method: 'POST', url: `/api/records/${held!.id}/restore`, headers: owner })
  expect(reply.statusCode, reply.body).toBe(409)
  expect(reply.json().error).toContain(`${held!.id} cannot be restored, because the office holds no "archivist" card now.`)
  expect(everything()).toBe(before)
})

it('names two live words records as the card’s problem, refuses an Apply, and lets one be deleted', async () => {
  expect((await apply(card())).statusCode).toBe(200)
  const [held] = wordsRecords()
  // A SECOND RECORD NO DOOR WOULD WRITE, as an older release or a hand edit could leave it.
  sql().exec(`CREATE TEMP TABLE made_up_copy AS SELECT * FROM records WHERE id='${held!.id}'`)
  sql().exec("UPDATE made_up_copy SET id='made-up-second-words', data=json_set(data,'$.duties','Made-up second duties.')")
  sql().exec('INSERT INTO records SELECT * FROM made_up_copy; DROP TABLE made_up_copy')
  addedRoles.loadAddedRoles()
  const named = (await rows()).leftOut.find((row: { name: string }) => row.name === 'archivist')
  expect(named.problems[0]).toContain('kept in 2 live records')
  expect(named.problems[0]).toContain(held!.id); expect(named.problems[0]).toContain('made-up-second-words')
  expect(roles.theRoleCards().cards.some(one => one.name === 'archivist'), 'the office does not pick one of the two').toBe(false)
  const listed = await app.inject({ url: '/api/roles', headers: owner })
  expect(listed.statusCode, listed.body).toBe(409)
  expect(listed.json().error).toContain(`The "archivist" card has two live words records, ${held!.id} and made-up-second-words`)

  const before = everything()
  const refused = await apply({ ...card(), duties: 'Made-up duties for one record.' })
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.json()).toMatchObject({ code: 'addedRoleRefused' })
  expect(refused.json().error).toContain('kept in two live records')
  expect(everything()).toBe(before)

  const deleted = await app.inject({ method: 'DELETE', url: '/api/records/made-up-second-words', headers: owner })
  expect(deleted.statusCode, deleted.body).toBe(200)
  expect(theWordsOf((await theCard())!)).toEqual(theWordsOf(card()))
})

it('removes a row stored under one of the office’s own names, and keeps that card’s words record', async () => {
  words.fileTheCardWordsOnce({ full: 'abcdef0123456789abcdef0123456789abcdef01' })
  const [shipped] = wordsRecords('worker'), served = await theCard('worker')
  expect(shipped).toBeDefined()
  sql().prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.role:worker', JSON.stringify(card('worker')))
  addedRoles.loadAddedRoles()
  expect((await current('worker')).problems.join(' ')).toContain("worker is one of the office's own roles, and those are locked")
  expect(await theCard('worker')).toEqual(served)

  const removed = await restore('worker')
  expect(removed.statusCode, removed.body).toBe(200)
  expect(storedRow('worker')).toBeUndefined()
  expect(await current('worker')).toBeUndefined()
  expect(wordsRecords('worker')).toEqual([shipped])
  expect(await theCard('worker')).toEqual(served)
})

/** A port nothing is listening on, from the operating system. */
async function aFreePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>(done => probe.listen(0, '127.0.0.1', done))
  const address = probe.address()
  await new Promise<void>(done => probe.close(() => done()))
  if (address === null || typeof address === 'string') throw new Error('The operating system gave no port.')
  return address.port
}

/**
 * START THE REAL SERVER ON THIS TEST'S DATABASE, as tests/a-cards-words-are-the-offices-record.test.ts does. It
 * waits for the whole line the start prints about the card words, stops the server by the process group this
 * test started, and answers with that line.
 */
async function aRealStart(home: string): Promise<string> {
  const port = await aFreePort()
  const child: ChildProcess = spawn(process.execPath, apiServerArguments(['--import', 'tsx']), {
    cwd: REPO,
    detached: true,
    env: { ...process.env, HOME: home, MOLE_OFFICE_DB: db.file, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const group = child.pid
  if (group === undefined) throw new Error('The server did not start.')
  const theLine = /[^\n]*(role card words were filed|Filed the words of)[^\n]*\n/u
  let out = '', err = ''
  const ended = once(child, 'close')
  const stop = (): void => {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  const timer = setTimeout(stop, 45_000)
  child.stdout?.on('data', (part: Buffer) => { out += String(part); if (theLine.test(out)) stop() })
  child.stderr?.on('data', (part: Buffer) => { err += String(part) })
  await ended
  clearTimeout(timer)
  const line = theLine.exec(out)?.[0]
  expect(line, `the start printed no line about the card words. Its output:\n${out}\n${err}`).toBeDefined()
  return line!.trim()
}

it('files the words of a card stored before they moved, on the start, and strips its row once', async () => {
  const legacy = { ...card(), ...handbook }
  // THE ONE WRITE BEFORE THE START: a row as wave 13r stored an added card before its words had a record.
  sql().prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.role:archivist', JSON.stringify(legacy))
  addedRoles.loadAddedRoles()
  const read = await current()
  expect(read).toMatchObject({ card: legacy, problems: [] })

  const declared = JSON.parse(readFileSync(join(REPO, 'src/config/roles.json'), 'utf8')) as RolesDeclaration
  const names = [...declared.cards, ...declared.personCards].map(one => one.name)
  const head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const home = mkdtempSync(join(tmpdir(), 'mole-office-added-card-words-home-'))
  expect(await aRealStart(home)).toBe(
    `Filed the words of ${String(names.length)} role cards (${names.join(', ')}) as records in the "default" project, copied from src/config/roles.json at commit ${head}. ` +
      'Filed the words of 1 card added on the Roles page (archivist) as records in the "default" project, moved from its row, which now keeps only the powers and the structure.',
  )
  const [held, ...more] = wordsRecords()
  expect(more).toEqual([])
  expect(wordsIn(held!.data)).toEqual({ roleName: 'archivist', ...theWordsOf(legacy) })
  expect(held!.data).toMatchObject({ copiedFrom: 'runtime_settings office.role:archivist', copiedAt: expect.any(String) })
  expect(held!.data['copiedFromCommit']).toBeUndefined()
  expect(storedRow()).toEqual(theStructureOf(legacy))
  expect(sql().prepare("SELECT count(*) AS n FROM changes WHERE record_id='setting:role:archivist'").get(), 'the card is the same card, so its history on the Roles page gets no entry').toEqual({ n: 0 })
  addedRoles.loadAddedRoles()
  expect(await current(), 'the same card, so the same version').toEqual(read)

  const before = theStore()
  expect(await aRealStart(home)).toBe('No role card words were filed: every card already has, or once had, a words record.')
  expect(theStore()).toBe(before)
}, 120_000)
