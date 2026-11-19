// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORED WORDS THAT CALLED THE PERSON BY A GENDERED PRONOUN ARE RENAMED FOR NEW WRITES, AND THE OLD ONES ARE STILL READ.
 * Decision vONGYRfXV-UF, and wave 13s round 5b.
 *
 * Each family is one list, old word to new word, in src/shared/renamed-words.ts. The readers read an old word as
 * the new one; the writers write only the new one. NOTHING REWRITES A STORED ROW: the owner's office keeps its
 * history in the words it was written with, so an old row keeps its old word for ever, and a migrate changes no
 * cell of it.
 *
 * WHAT IS PROVED HERE, each on a throwaway database:
 *   1. On a fresh database the doors write the new words, an older client that sends an old word gets the new one
 *      stored, and a migrate then changes nothing.
 *   2. On a database holding every old word, the way an older office stored them: every reader answers as with the
 *      new words; a migrate changes no cell of any table; and a new write meeting an old row stores the new word.
 *   3. Each list's new word is still a word its home declares.
 *
 * MUTATION PROOFS, each after a control, recorded in the commit message.
 *
 * Every row here is synthetic and nothing reaches the live server.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NOTEBOOK_ENTRY_KIND_KEYS } from '../src/shared/notebook.ts'
import {
  ADDRESS_NAME_WORDS_RENAMED,
  KEY_MINT_WORDS_RENAMED,
  NOTEBOOK_KINDS_RENAMED,
  SYSTEM_ACTOR_IDS_RENAMED,
  THE_PERSONS_NAME_FOR_THE_ADDRESS,
} from '../src/shared/renamed-words.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_PRODUCT_BY_ITS_EARLIER_NAME = {
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'system',
  'x-mole-office-actor-id': 'panelx',
}

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(join(process.cwd(), 'src', 'config', 'roles.json'), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

let t: TestDb
let app: FastifyInstance

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.body, json: (reply.body === '' ? {} : reply.json()) as Record<string, any> }
}

async function aSecretary(handle: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: `Synthetic ${handle}`, role: theSecretaryCard() })
  expect(made.status, made.body).toBe(201)
}

const row = (sql: string, ...args: unknown[]) => t.client.sqlite.prepare(sql).get(...args) as Record<string, any>
const rows = (sql: string, ...args: unknown[]) => t.client.sqlite.prepare(sql).all(...args) as Record<string, any>[]
const dataOf = (id: string): Record<string, any> => JSON.parse(row('SELECT data FROM records WHERE id = ?', id).data)

/** The hash a record's newest revision must hold for the record to stay writable. */
function versionNow(id: string): string {
  const r = row('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?', id)
  return versionOf(contentOf({ kind: r.kind, title: r.title, summary: r.summary, data: JSON.parse(r.data), deletedAt: r.deleted_at }))
}

/**
 * PUT A RECORD BACK TO WHAT MAIN WROTE: `change` applied to its data and to every revision of it, each revision's
 * hash recomputed. A fixture edit in SQL, because no door writes an old word any more.
 */
function asMainWroteIt(id: string, change: (data: Record<string, any>) => void): void {
  const sqlite = t.client.sqlite
  const data = dataOf(id)
  change(data)
  sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
  for (const one of rows('SELECT id, kind, title, summary, data, deleted_at FROM revisions WHERE record_id = ?', id)) {
    const held = JSON.parse(one.data) as Record<string, any>
    change(held)
    const content = contentOf({ kind: one.kind, title: one.title, summary: one.summary, data: held, deletedAt: one.deleted_at })
    sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ? WHERE id = ?').run(JSON.stringify(content.data), versionOf(content), one.id)
  }
}

/**
 * Every cell of every table, by table and rowid. A table WITHOUT ROWID has no rowid, so its rows go by their primary key:
 * two of the full-text index's own tables are such tables.
 */
function everyCell(): Map<string, Record<string, unknown>> {
  const cells = new Map<string, Record<string, unknown>>()
  const tables = rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((one) => String(one.name))
  for (const table of tables) {
    if (row("SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?", table).wr === 1) {
      const key = rows('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk', table).map((one) => String(one.name))
      for (const one of rows(`SELECT * FROM "${table}"`)) cells.set(`${table}#${JSON.stringify(key.map((column) => one[column]))}`, one)
      continue
    }
    for (const one of rows(`SELECT rowid AS __rowid, * FROM "${table}"`)) cells.set(`${table}#${String(one.__rowid)}`, one)
  }
  return cells
}

/** Which cells moved between two pictures, and which rows were added. */
function whatMoved(before: Map<string, Record<string, unknown>>, after: Map<string, Record<string, unknown>>) {
  const changed: string[] = []
  const added: string[] = []
  for (const [key, now] of after) {
    const was = before.get(key)
    if (was === undefined) {
      added.push(key)
      continue
    }
    for (const column of Object.keys(now)) if (JSON.stringify(now[column]) !== JSON.stringify(was[column])) changed.push(`${key}.${column}`)
  }
  const gone = [...before.keys()].filter((key) => !after.has(key))
  return { changed: changed.sort(), added: added.sort(), gone }
}

// ============================================================ 1. a fresh database

describe('on a fresh database', () => {
  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    await aSecretary('secretary-1')
  })
  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('writes the new words, stores the new word for an older client that sends an old one, and a migrate then changes nothing', async () => {
    const plain = await call('POST', '/api/agents/secretary-1/notebook/entries', AS_THE_PERSON, { entryKind: 'the-persons-preferences', text: 'Short answers.' })
    expect(plain.status, plain.body).toBe(201)
    // AN OLDER CLIENT sends the word renamed since: the door stores the new one.
    const older = await call('POST', '/api/agents/secretary-1/notebook/entries', AS_THE_PERSON, { entryKind: 'how-he-wants-answers', text: 'Conclusion first.' })
    expect(older.status, older.body).toBe(201)
    const id = String(older.json['recordId'])
    expect(dataOf(id)['entries'].map((one: { entryKind: string }) => one.entryKind)).toEqual(['the-persons-preferences', 'how-they-want-answers'])

    // AN OLDER PAGE that writes as the product under its earlier name: the write is stored under the office's own id.
    const filed = await call('POST', '/api/records', AS_THE_PRODUCT_BY_ITS_EARLIER_NAME, { kind: 'note', title: 'Written by an older page as the product' })
    expect(filed.status, filed.body).toBe(201)
    const written = String(filed.json['record']?.id ?? filed.json['id'])
    expect(rows('SELECT actor_type, actor_id FROM changes WHERE record_id = ?', written)).toEqual([{ actor_type: 'system', actor_id: theOfficesOwnId(t) }])
    expect(rows('SELECT actor_type, actor_id FROM revisions WHERE record_id = ?', written)).toEqual([{ actor_type: 'system', actor_id: theOfficesOwnId(t) }])

    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const before = everyCell()
    migrateInPlace(t.client.sqlite)
    expect(whatMoved(before, everyCell())).toEqual({ changed: [], added: [], gone: [] })
  })
})

// ============================================================ 2. a database at main

describe('on a database at main that holds every old word', () => {
  const ids = { notebook: '', message: '', bySystem: '', byAgentPanelx: '', seal: '', link: '', agent: '' }
  let sealedRevision = ''

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    await aSecretary('secretary-2')

    // A NOTEBOOK whose entries hold two old kinds and one kind that was never renamed.
    for (const [entryKind, text] of [['the-persons-preferences', 'Reads the timetable first.'], ['the-persons-to-do', 'Appointing a secretary.'], ['its-character', 'Careful.']] as const) {
      const said = await call('POST', '/api/agents/secretary-2/notebook/entries', AS_THE_PERSON, { entryKind, text })
      expect(said.status, said.body).toBe(201)
      ids.notebook = String(said.json['recordId'])
    }
    const oldKind: Record<string, string> = { 'the-persons-preferences': 'his-preferences', 'the-persons-to-do': 'his-to-do' }
    asMainWroteIt(ids.notebook, (data) => {
      for (const entry of data['entries'] ?? []) entry.entryKind = oldKind[entry.entryKind] ?? entry.entryKind
    })

    // A MESSAGE written from an address the person had named, as main stored it.
    ids.message = t.api.createRecord({
      kind: 'message',
      title: 'From the named machine',
      workspaceId: 'default',
      data: { body: 'From the named machine.', to: [{ kind: 'agent', id: 'secretary-2' }] },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    asMainWroteIt(ids.message, (data) => {
      data['writtenFrom'] = { machine: 'greenhouse', how: 'his name for the address', address: '192.0.2.7', program: 'Chrome' }
    })

    // WRITES BY THE PRODUCT UNDER ITS EARLIER NAME, and by an AGENT that happens to be called panelx.
    ids.bySystem = t.api.createRecord({ kind: 'note', title: 'The product wrote this', workspaceId: 'default', actor: { type: 'system', id: 'panelx' } }).id
    t.api.patchRecord(ids.bySystem, { summary: 'and changed it' }, { type: 'system', id: 'panelx' })
    ids.byAgentPanelx = t.api.createRecord({ kind: 'note', title: 'An agent called panelx wrote this', workspaceId: 'default', actor: { type: 'agent', id: 'panelx' } }).id
    ids.link = t.api.createLink({ fromId: ids.bySystem, toId: ids.byAgentPanelx, type: 'relates_to', actor: { type: 'system', id: 'panelx' } }).id

    // A SEAL that names the first revision of the product's record, so that revision must keep its row as it was.
    sealedRevision = String(row('SELECT id FROM revisions WHERE record_id = ? AND seq = 1', ids.bySystem).id)
    const template = row('SELECT * FROM records WHERE id = ?', ids.byAgentPanelx)
    ids.seal = 'seal-fixture1'
    const seal = { ...template, id: ids.seal, kind: 'sealed_tip', title: 'Submitted work for a synthetic run', data: JSON.stringify({ seal: { kind: 'records', records: { workspace: 'default', baseline: null, records: [{ id: ids.bySystem, before: null, after: { record: ids.bySystem, id: sealedRevision, seq: 1, hash: 'synthetic' } }], dependencies: [], says: 'synthetic' } } }) }
    const columns = Object.keys(seal)
    t.client.sqlite.prepare(`INSERT INTO records (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => (seal as Record<string, unknown>)[c]))
    // The seal's own baseline revision, as the ledger pass gives every record that has none, so the picture taken
    // before the step below is of a ledger the pass has nothing to add to.
    const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
    migrateRevisions(t.client.sqlite)

    // KEYS made the two old ways, and one made a way that was never renamed.
    ids.agent = String(row("SELECT id FROM agents WHERE handle = 'secretary-2'").id)
    t.client.sqlite.prepare('DELETE FROM held_keys WHERE whose_id = ?').run(ids.agent)
    const key = t.client.sqlite.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, mint_proved_by) VALUES (?, 'agent', ?, ?, '2026-09-20 10:00:00', ?)")
    key.run('key-press', ids.agent, 'a'.repeat(64), 'his-press')
    key.run('key-key', ids.agent, 'b'.repeat(64), 'his-key')
    key.run('key-none', 'someone-else', 'c'.repeat(64), 'no-key')

    // THE TWO SETTINGS TABLES, each written under a raise.
    t.client.sqlite.prepare("INSERT OR REPLACE INTO price_table (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) VALUES (1, '{}', '2026-09-20 10:00:00', 'agent', 'secretary-2', 'his raise raise-fixture1')").run()
    t.client.sqlite.prepare("INSERT OR REPLACE INTO run_models (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) VALUES (1, '{}', '2026-09-20 10:00:00', 'agent', 'secretary-2', 'his raise raise-fixture2')").run()
  })
  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('reads the notebook and a proved key the old way stored as the new words', async () => {
    const read = await call('GET', '/api/agents/secretary-2/notebook', AS_THE_PERSON)
    expect(read.status, read.body).toBe(200)
    expect(read.json['entries'].map((one: { entryKind: string }) => one.entryKind).sort()).toEqual(['its-character', 'the-persons-preferences', 'the-persons-to-do'])
    // Stored as main stored it, and read as the new words.
    expect(dataOf(ids.notebook)['entries'].map((one: { entryKind: string }) => one.entryKind).sort()).toEqual(['his-preferences', 'his-to-do', 'its-character'])

    // A key made by the person's press, stored under the old word, still counts as proved.
    const { theLiveAgentsWithNoProvedKey } = await import('../src/server/lib/provedkeys.ts')
    expect(theLiveAgentsWithNoProvedKey().map((one) => one.handle)).not.toContain('secretary-2')
  })

  it('changes no cell of any table on migrate: every old word stays as the older office stored it', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const before = everyCell()
    migrateInPlace(t.client.sqlite)
    expect(whatMoved(before, everyCell())).toEqual({ changed: [], added: [], gone: [] })

    // NAMED, so a failure says which old word a migrate would have rewritten.
    expect(dataOf(ids.notebook)['entries'].map((one: { entryKind: string }) => one.entryKind).sort()).toEqual(['his-preferences', 'his-to-do', 'its-character'])
    expect(dataOf(ids.message)['writtenFrom']['how']).toBe('his name for the address')
    expect(rows('SELECT id, mint_proved_by FROM held_keys ORDER BY id')).toEqual([
      { id: 'key-key', mint_proved_by: 'his-key' },
      { id: 'key-none', mint_proved_by: 'no-key' },
      { id: 'key-press', mint_proved_by: 'his-press' },
    ])
    expect(rows("SELECT count(*) AS n FROM changes WHERE actor_type = 'system' AND actor_id = 'panelx'")[0]!.n).toBe(3)
    expect(rows("SELECT count(*) AS n FROM revisions WHERE actor_type = 'system' AND actor_id = 'panelx'")[0]!.n).toBe(2)
    expect(row('SELECT created_by FROM links WHERE id = ?', ids.link).created_by).toBe('panelx')
    expect(row('SELECT authority FROM price_table').authority).toBe('his raise raise-fixture1')
    expect(row('SELECT authority FROM run_models').authority).toBe('his raise raise-fixture2')
  })

  it('reads the old words as the new ones everywhere a reader meets them', async () => {
    // A message's place word, as the wire and the page read it.
    const { writtenFromOf } = await import('../src/shared/messages.ts')
    expect(writtenFromOf(dataOf(ids.message))).toEqual({ machine: 'greenhouse', how: THE_PERSONS_NAME_FOR_THE_ADDRESS, program: 'Chrome' })
    // A key made by the person's press, stored under either old word, counts as proved.
    const { aKeyMadeThisWayIsProved } = await import('../src/server/lib/provedkeys.ts')
    for (const one of KEY_MINT_WORDS_RENAMED) expect(aKeyMadeThisWayIsProved(one.from), one.from).toBe(true)
    // The product's own writes under its earlier name are named as the product, as its writes under its own id are.
    const { actorTypeWord } = await import('../src/shared/words.ts')
    const read = await call('GET', `/api/records/${ids.bySystem}`, AS_THE_PERSON)
    expect(read.status, read.body).toBe(200)
    const writers = (read.json['changes'] as { actorType: string; actorId: string }[]).map((one) => `${one.actorType}:${one.actorId}`)
    expect(writers).toContain('system:panelx')
    expect(actorTypeWord('system').text).toBe(actorTypeWord(rows("SELECT actor_type FROM changes WHERE record_id = ?", ids.bySystem)[0]!.actor_type).text)
  })

  it('stores the new word when a new write meets an old row, and leaves the old revisions as they were', async () => {
    // AN ORDINARY EDIT of a record that still holds old words is not refused for them.
    const patched = await call('PATCH', `/api/records/${ids.notebook}`, AS_THE_PERSON, { summary: 'An edit beside the old words.' })
    expect(patched.status, patched.body).toBe(200)
    const messagePatched = await call('PATCH', `/api/records/${ids.message}`, AS_THE_PERSON, { dataPatch: { body: 'From the named machine, edited.' } })
    expect(messagePatched.status, messagePatched.body).toBe(200)
    // The edit stores the words it wrote; the place word it did not write stays as the older office stored it.
    expect(dataOf(ids.message)['body']).toBe('From the named machine, edited.')
    expect(dataOf(ids.message)['writtenFrom']['how']).toBe('his name for the address')
    // A NEW ENTRY in the notebook that holds old kinds: the door writes every entry back in the new words.
    const added = await call('POST', '/api/agents/secretary-2/notebook/entries', AS_THE_PERSON, { entryKind: 'how-he-wants-answers', text: 'Short.' })
    expect(added.status, added.body).toBe(201)
    expect(dataOf(ids.notebook)['entries'].map((one: { entryKind: string }) => one.entryKind).sort()).toEqual(
      ['how-they-want-answers', 'its-character', 'the-persons-preferences', 'the-persons-to-do'],
    )
    // The revisions written before keep the words they were written with.
    const oldest = JSON.parse(row('SELECT data FROM revisions WHERE record_id = ? ORDER BY seq LIMIT 1', ids.notebook).data) as { entries: { entryKind: string }[] }
    expect(oldest.entries.map((one) => one.entryKind)).toContain('his-preferences')
    // A NEW WRITE by an older page as the product under its earlier name is stored under the office's own id.
    const filed = await call('POST', '/api/records', AS_THE_PRODUCT_BY_ITS_EARLIER_NAME, { kind: 'note', title: 'Written after the old rows' })
    expect(filed.status, filed.body).toBe(201)
    const written = String(filed.json['record']?.id ?? filed.json['id'])
    expect(rows('SELECT actor_id FROM changes WHERE record_id = ?', written)).toEqual([{ actor_id: theOfficesOwnId(t) }])
  })
})

// ============================================================ 3. one word, one place

describe('each new word is one its home still declares', () => {
  it('names a kind of notebook entry, a proved key, the office and the stored address word', async () => {
    t = await freshDb()
    try {
      for (const one of NOTEBOOK_KINDS_RENAMED) {
        expect(NOTEBOOK_ENTRY_KIND_KEYS).toContain(one.to)
        expect(NOTEBOOK_ENTRY_KIND_KEYS).not.toContain(one.from)
      }
      const { aKeyMadeThisWayIsProved } = await import('../src/server/lib/provedkeys.ts')
      for (const one of KEY_MINT_WORDS_RENAMED) {
        expect(aKeyMadeThisWayIsProved(one.to), one.to).toBe(true)
        expect(aKeyMadeThisWayIsProved(one.from), one.from).toBe(true)
      }
      expect(SYSTEM_ACTOR_IDS_RENAMED.map((one) => one.to)).toEqual([MOLE_OFFICE_HANDLE])
      expect(ADDRESS_NAME_WORDS_RENAMED.map((one) => one.to)).toEqual([THE_PERSONS_NAME_FOR_THE_ADDRESS])
    } finally {
      t.close()
    }
  })
})
