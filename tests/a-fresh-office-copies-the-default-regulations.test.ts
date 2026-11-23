// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH OFFICE COPIES THE DEFAULT REGULATIONS INTO ITS OWN CHAPTER RECORDS, AND EACH DEFAULT CHAPTER ONLY ONCE.
 *
 * Wave 13s round 7: a fresh office copies the default regulations into its own chapter records at
 * its first run, so its owner can read and change them on the regulations page. Until round 257 an office that held
 * any chapter got nothing, so an office copied before the set had its role chapters never got them. Now a start copies
 * each default chapter whose number the office has never held, and changes no chapter the office holds.
 * src/server/lib/default-regulations.ts is the copy; src/config/rules/default-regulations.json is the set.
 *
 * WHAT THIS FILE HOLDS THE OFFICE TO:
 *   2. a fresh test office gets every default chapter as a record, with its label and Chinese title,
 *      and the regulations page's own request reads them and says they were copied;
 *   3. a second copy writes nothing, not one record and not one change row;
 *   4. an office that holds chapters gets each default chapter whose number it has never held, in any project and
 *      deleted ones counted, and nothing more: when its one chapter is in another project (as the owner's are), the
 *      chapters it lacks go into that project and every project shows them all; when it holds every number of the
 *      set, nothing at all is written; when its one chapter was deleted, that chapter does not come back;
 *   5. the two cases of an upgrade: (a) a first start copied the chapters of the set that no role is marked for, and a
 *      later start copies the role chapters; (b) the person filed the chapters that no role is marked for, with no
 *      copy mark, and a start copies the role chapters. In both, every row that holds one of the earlier chapters, in
 *      every table, is the same after the copy, byte for byte, and the copy writes only the chapters the office lacked;
 *   6. on a real start: the first start copies, the page draws the chapters, a chapter changed through
 *      the page's own request stays changed after a restart, and the restart copies nothing.
 *
 * THE PICTURES. The real start photographs the page with the marked rule on it at 1440 in the light
 * look, in English and in Chinese, into the folder TEST_SHOTS names (tests/where-shots-go.ts). The
 * four-width, two-language sweep of the page without the mark was dropped: the page check above it
 * already reads what the page draws.
 *
 * WHAT IS REAL HERE. The migrations, the record door, the server's own start and the page are real.
 * Every database is a temporary one this file makes; nothing reaches the live office.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, liveApp, theOfficesOwnId, waitForThePage, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_CHAPTER } from '../src/shared/office-rules.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import { testShots } from './where-shots-go.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

const REPO = join(import.meta.dirname, '..')
const DEFAULTS = JSON.parse(readFileSync(join(REPO, 'src/config/rules/default-regulations.json'), 'utf8')) as {
  leftOut?: { chapter: number; rule: string }[]
  chapters: { n: number; forRole?: string; label: string; title: string; conclusion: string; outline: { id: string; name: string; text: string; zh: { name: string; text: string }; zhFrom: string }[]; zh: { label: string; title: string; conclusion: string } }[]
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb | null = null
let app: FastifyInstance | null = null
let scratch: string | null = null

afterEach(async () => {
  await app?.close()
  t?.close()
  if (scratch !== null) rmSync(scratch, { recursive: true, force: true })
  app = null
  t = null
  scratch = null
})

async function aFreshOffice(): Promise<{ copy: typeof import('../src/server/lib/default-regulations.ts') }> {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  return { copy: await import('../src/server/lib/default-regulations.ts') }
}

async function regulations(): Promise<WhatTheOfficeRegulationsSay> {
  const reply = await app!.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeRegulationsSay
}

function rowsIn(table: 'records' | 'changes'): number {
  return (t!.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}

/** Every chapter row of the office, deleted ones included, by the one definition of a chapter (`A_CHAPTER`). */
function chapterRows(): { id: string; n: number; w: string }[] {
  const types = A_CHAPTER.sqliteNumberTypes.map(() => '?').join(', ')
  return t!.client.sqlite
    .prepare(`SELECT id, json_extract(data, ?) AS n, workspace_id AS w FROM records WHERE kind = ? AND json_type(data, ?) IN (${types}) ORDER BY n, id`)
    .all(A_CHAPTER.jsonPath, A_CHAPTER.kind, A_CHAPTER.jsonPath, ...A_CHAPTER.sqliteNumberTypes) as { id: string; n: number; w: string }[]
}

/**
 * EVERY ROW THAT HOLDS ONE OF THESE RECORDS, in every table of the database: each row with one of the ids in any of
 * its columns, as SQLite gives it back. Read before a copy and again after it, the two are equal only when the copy
 * changed nothing of these records, byte for byte. The tables and their columns are read from the database itself, so
 * a table a later migration adds is read too.
 */
function rowsHolding(ids: readonly string[]): Record<string, string[]> {
  const db = t!.client.sqlite
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name)
  const marks = ids.map(() => '?').join(', ')
  return Object.fromEntries(tables.map((table) => {
    const columns = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((column) => column.name)
    const where = columns.map((column) => `"${column}" IN (${marks})`).join(' OR ')
    const rows = columns.length === 0 ? [] : db.prepare(`SELECT * FROM "${table}" WHERE ${where}`).all(...columns.flatMap(() => ids))
    return [table, rows.map((row) => JSON.stringify(row)).sort()]
  }))
}

/** The numbers of the default set: of its chapters that no role is marked for, and of its role chapters. */
const EARLIER = DEFAULTS.chapters.filter((one) => one.forRole === undefined).map((one) => one.n)
const ROLE_CHAPTERS = DEFAULTS.chapters.filter((one) => one.forRole !== undefined).map((one) => one.n)

describe('a fresh office', () => {
  it('gets every default chapter as a record, which the regulations page reads and says was copied', async () => {
    const { copy } = await aFreshOffice()
    const before = await regulations()
    expect(before.chapters).toEqual([])
    expect(before.copiedFromTheDefaults).toBeNull()

    const did = copy.copyTheDefaultRegulationsOnce()
    expect(did.copied).toBe(DEFAULTS.chapters.length)
    expect(did.line).toContain('were copied')

    const after = await regulations()
    expect(after.chapters.map((c) => c.n)).toEqual(DEFAULTS.chapters.map((c) => c.n))
    for (const want of DEFAULTS.chapters) {
      const got = after.chapters.find((c) => c.n === want.n)!
      expect(got.title).toBe(want.title)
      expect(got.conclusion).toBe(want.conclusion)
      expect(got.label).toBe(want.label)
      expect(got.outline.map((r) => [r.id, r.name, r.text])).toEqual(want.outline.map((r) => [r.id, r.name, r.text]))
      // THE CHINESE TITLE IS CURRENT: written from this English, so the page draws it.
      expect(got.zh?.title).toBe(want.zh.title)
      // AND SO IS EVERY RULE'S CHINESE (wave 13s round 8): the page draws each rule in Chinese, none untranslated.
      expect(got.outline.map((r) => [r.id, r.zh?.name ?? null, r.zh?.text ?? null])).toEqual(want.outline.map((r) => [r.id, r.zh.name, r.zh.text]))
    }
    expect(after.copiedFromTheDefaults?.copies.map((one) => [one.file, one.first, one.chapters])).toEqual([[copy.THE_DEFAULT_REGULATIONS_FILE, true, DEFAULTS.chapters.map((c) => c.n)]])
    expect(after.copiedFromTheDefaults?.notCopied).toEqual([])
    expect(after.says).toContain('copied from the default set')

    // THE OFFICE WROTE THEM, as a real record of this office, in the project every office has.
    const rows = t!.client.sqlite
      .prepare("SELECT workspace_id AS w, origin FROM records WHERE kind = 'module' AND json_type(data, '$.extra.chapter') = 'integer'")
      .all() as { w: string; origin: string }[]
    expect(rows).toHaveLength(DEFAULTS.chapters.length)
    expect(new Set(rows.map((r) => `${r.w} ${r.origin}`))).toEqual(new Set(['default authored']))
    const writers = t!.client.sqlite
      .prepare("SELECT DISTINCT actor_type || ' ' || actor_id AS who FROM changes WHERE record_id IN (SELECT id FROM records WHERE kind = 'module')")
      .all() as { who: string }[]
    expect(writers.map((w) => w.who)).toEqual([`system ${theOfficesOwnId(t!)}`])
  })

  it('writes nothing the second time, not one record and not one change row', async () => {
    const { copy } = await aFreshOffice()
    expect(copy.copyTheDefaultRegulationsOnce().copied).toBe(DEFAULTS.chapters.length)
    const records = rowsIn('records')
    const changes = rowsIn('changes')
    const second = copy.copyTheDefaultRegulationsOnce()
    expect(second.copied).toBe(0)
    expect(second.line).toContain(`already holds ${String(DEFAULTS.chapters.length)} chapter records`)
    expect(rowsIn('records')).toBe(records)
    expect(rowsIn('changes')).toBe(changes)
  })
})

describe('an office that holds chapters', () => {
  /** A chapter the person files through the record door, with the rule ids of the default chapter of its number and words of its own. */
  async function aChapterIn(workspaceId: string, n = 1): Promise<string> {
    const ids = DEFAULTS.chapters.find((one) => one.n === n)?.outline.map((rule) => rule.id) ?? ['r-1']
    const reply = await app!.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': workspaceId },
      payload: {
        kind: 'module',
        title: ownTitle(n),
        summary: 'Its own chapter.',
        data: { context: 'This office keeps its own regulations.', parts: [], extra: { chapter: n }, summaryBlocks: ids.map((id) => ({ id, type: 'text', heading: `Its rule ${id}`, text: 'Its words.' })) },
      },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const id = (reply.json() as { record: { id: string } }).record.id
    const headers = { ...AS_THE_PERSON, 'x-mole-office-workspace': workspaceId }
    const revision = (await app!.inject({ url: `/api/records/${id}/revisions`, headers })).json().revisions[0]
    const label = await app!.inject({ method: 'POST', url: `/api/records/${id}/short-forms`, headers, payload: { madeFrom: { seq: revision.seq, contentHash: revision.contentHash }, forms: { label: 'This office’s chapter' } } })
    expect(label.statusCode, label.body).toBe(200)
    return id
  }
  const ownTitle = (n: number): string => `Chapter ${String(n)} this office wrote for itself`

  it('gets each default chapter it lacks, in the project its one chapter is in, leaves that chapter as it was, and every project shows them all', async () => {
    const { copy } = await aFreshOffice()
    const projects = await import('../src/server/lib/workspaces.ts')
    projects.createWorkspace({ id: 'its-own-project', title: 'Its own project' })
    const own = await aChapterIn('its-own-project')
    const held = rowsHolding([own])
    const lacking = DEFAULTS.chapters.map((one) => one.n).filter((n) => n !== 1)
    const did = copy.copyTheDefaultRegulationsOnce()
    expect(did.copied).toBe(lacking.length)
    expect(did.line).toBe(copy.theLineOfTheCopy({ held: 1, copied: lacking, project: 'its-own-project' }))
    expect(rowsHolding([own])).toEqual(held)
    expect(chapterRows().filter((row) => row.id !== own).map((row) => [row.n, row.w])).toEqual(lacking.map((n) => [n, 'its-own-project']))
    // THE OFFICE'S ONE SET, read in `default` although it is filed in another project. Until wave 13w
    // the page read only the project it was asked in, so it showed no chapter here while the office
    // held one.
    expect((await regulations()).chapters.map((one) => [one.n, one.title])).toEqual(
      DEFAULTS.chapters.map((one) => [one.n, one.n === 1 ? ownTitle(1) : one.title]),
    )
  })

  it('writes nothing at all to the database when it holds every number of the default set: no record, no revision, no change row', async () => {
    // THE OWNER'S OWN OFFICE IS THIS CASE: it holds a chapter record of every number of the set, in another project,
    // so every start there runs this branch. Chapter 1 governs that server, so the branch is held to writing nothing.
    const { copy } = await aFreshOffice()
    const projects = await import('../src/server/lib/workspaces.ts')
    projects.createWorkspace({ id: 'its-own-project', title: 'Its own project' })
    for (const one of DEFAULTS.chapters) await aChapterIn('its-own-project', one.n)
    const db = t!.client.sqlite
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name)
    expect(tables).toEqual(expect.arrayContaining(['records', 'revisions', 'changes']))
    const counts = (): Record<string, number> =>
      Object.fromEntries(tables.map((name) => [name, (db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]))
    // `total_changes()` counts every row this connection has inserted, updated or deleted, so a write
    // that leaves every count as it was still moves it. The copy writes through this same connection.
    const written = (): number => (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
    const before = counts()
    const writtenBefore = written()
    const did = copy.copyTheDefaultRegulationsOnce()
    expect(did.copied).toBe(0)
    expect(did.line).toBe(copy.theLineOfTheCopy({ held: DEFAULTS.chapters.length, copied: [], project: 'its-own-project' }))
    expect(written()).toBe(writtenBefore)
    expect(counts()).toEqual(before)
  })

  it('does not get back its one chapter after it was deleted, and gets the default chapters it never held', async () => {
    const { copy } = await aFreshOffice()
    const id = await aChapterIn('default')
    const gone = await app!.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: AS_THE_PERSON })
    expect(gone.statusCode, gone.body).toBeLessThan(300)
    expect((await regulations()).chapters).toEqual([])
    const held = rowsHolding([id])
    const lacking = DEFAULTS.chapters.map((one) => one.n).filter((n) => n !== 1)
    const did = copy.copyTheDefaultRegulationsOnce()
    expect(did.copied).toBe(lacking.length)
    expect(did.line).toBe(copy.theLineOfTheCopy({ held: 1, copied: lacking, project: DEFAULT_WORKSPACE }))
    expect(rowsHolding([id])).toEqual(held)
    expect(chapterRows().filter((row) => row.id !== id).map((row) => row.n)).toEqual(lacking)
    expect((await regulations()).chapters.map((one) => one.n)).toEqual(lacking)
  })

  it('(a) gets at a later start the role chapters a first start did not copy, and the chapters the first start copied stay as they were, row for row', async () => {
    const { copy } = await aFreshOffice()
    expect(ROLE_CHAPTERS.length, 'the default set has role chapters').toBeGreaterThan(0)
    // THE FIRST START READ A MADE-UP DEFAULT SET: the shipped file with only its chapters that no role is marked for,
    // as the set was before its role chapters came.
    scratch = mkdtempSync(join(tmpdir(), 'mole-earlier-default-set-'))
    const earlierSet = join(scratch, 'default-regulations.json')
    writeFileSync(earlierSet, JSON.stringify({ ...DEFAULTS, chapters: DEFAULTS.chapters.filter((one) => EARLIER.includes(one.n)) }))
    expect(copy.copyTheDefaultRegulationsOnce(earlierSet).copied).toBe(EARLIER.length)
    const first = chapterRows().map((row) => row.id)
    const before = rowsHolding(first)

    const did = copy.copyTheDefaultRegulationsOnce()
    expect(did.copied).toBe(ROLE_CHAPTERS.length)
    expect(did.line).toBe(copy.theLineOfTheCopy({ held: EARLIER.length, copied: ROLE_CHAPTERS, project: DEFAULT_WORKSPACE }))
    expect(rowsHolding(first)).toEqual(before)
    expect(chapterRows().filter((row) => !first.includes(row.id)).map((row) => [row.n, row.w])).toEqual(ROLE_CHAPTERS.map((n) => [n, DEFAULT_WORKSPACE]))
    expect((await regulations()).chapters.map((one) => one.n)).toEqual(DEFAULTS.chapters.map((one) => one.n))
  })

  it('(b) gets the role chapters when the person filed the others with no copy mark, and the person\'s chapters stay as they were, row for row', async () => {
    const { copy } = await aFreshOffice()
    expect(ROLE_CHAPTERS.length, 'the default set has role chapters').toBeGreaterThan(0)
    const filed: string[] = []
    for (const n of EARLIER) filed.push(await aChapterIn('default', n))
    const before = rowsHolding(filed)

    const did = copy.copyTheDefaultRegulationsOnce()
    expect(did.copied).toBe(ROLE_CHAPTERS.length)
    expect(did.line).toBe(copy.theLineOfTheCopy({ held: EARLIER.length, copied: ROLE_CHAPTERS, project: DEFAULT_WORKSPACE }))
    expect(rowsHolding(filed)).toEqual(before)
    expect(chapterRows().filter((row) => !filed.includes(row.id)).map((row) => [row.n, row.w])).toEqual(ROLE_CHAPTERS.map((n) => [n, DEFAULT_WORKSPACE]))
    expect((await regulations()).chapters.map((one) => [one.n, one.title])).toEqual(
      DEFAULTS.chapters.map((one) => [one.n, EARLIER.includes(one.n) ? ownTitle(one.n) : one.title]),
    )
  })
})

describe('a real start of a fresh office, and a restart', () => {
  it('copies at the first start, draws the chapters on the page, keeps a change through a restart, and copies nothing again', async () => {
    t = await freshDb()
    const file = t.file
    const ask = async (api: string, path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(`${api}${path}`, { ...init, headers: { ...AS_THE_PERSON, ...(init.headers ?? {}) } })

    const first = await liveApp({ name: 'default-regulations-first', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: file })
    let changed = ''
    try {
      const said = (await (await ask(first.api, '/api/office-regulations')).json()) as WhatTheOfficeRegulationsSay
      expect(said.chapters.map((c) => c.n)).toEqual(DEFAULTS.chapters.map((c) => c.n))
      expect(said.copiedFromTheDefaults).not.toBeNull()

      await first.page.goto(`${first.site}/#/regulations`, { timeout: 60_000 })
      await waitForThePage(first.page, 60_000)
      const drawn = await first.page.locator('main').innerText()
      for (const chapter of DEFAULTS.chapters) expect(drawn).toContain(chapter.label)
      expect(drawn).toContain('copied from the default regulations')

      // THE MARK, PRESSED BY THE PERSON (wave 13s round 9): chapter 1's first rule is marked as only
      // for this office, and the page is photographed with the mark on it, then the mark is taken off.
      const shots = testShots('a-fresh-office-copies-the-default-regulations')
      const one = said.chapters.find((c) => c.n === 1)!
      const marking = (only: boolean) =>
        ask(first.api, '/api/office-regulations/only-this-office', { method: 'POST', body: JSON.stringify({ chapter: one.id, rule: one.outline[0]!.id, only }) })
      const marked = await marking(true)
      expect(marked.status, await marked.clone().text()).toBe(200)
      // The mark is read in each language at one width and in one look: the words it adds do not depend on either.
      const width = 1440
      const scheme = 'light'
      for (const lang of ['en', 'zh'] as const) {
        await first.page.setViewportSize({ width, height: 1000 })
        await first.page.emulateMedia({ colorScheme: scheme })
        await first.page.goto('about:blank')
        await first.page.goto(`${first.site}/?lang=${lang}#/regulations`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await first.page.reload({ timeout: 60_000 })
        await waitForThePage(first.page, 60_000)
        const text = await first.page.locator('main').innerText()
        expect(text).toContain(theWordAPageDraws(lang, 'regulationsPage.onlyForThisOffice'))
        await first.page.locator('.ofc-rule-only').first().scrollIntoViewIfNeeded()
        await first.page.screenshot({ path: join(shots, `regulations-marked-${String(width)}-${lang}-${scheme}.png`) })
      }
      const unmarked = await marking(false)
      expect(unmarked.status, await unmarked.clone().text()).toBe(200)

      // A CHANGE MADE THROUGH THE PAGE'S OWN REQUEST: chapter 2's first rule, in new words.
      const two = said.chapters.find((c) => c.n === 2)!
      changed = 'This office stops a process only by the group id it wrote down, in its own words.'
      const blocks = two.outline.map((r, i) => ({ id: r.id, type: 'text', heading: r.name, text: i === 0 ? changed : r.text }))
      const patched = await ask(first.api, `/api/records/${two.id}`, { method: 'PATCH', body: JSON.stringify({ dataPatch: { summaryBlocks: blocks } }) })
      expect(patched.status, await patched.text()).toBe(200)
    } finally {
      await first.stop()
    }

    const second = await liveApp({ name: 'default-regulations-again', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: file })
    try {
      const said = (await (await ask(second.api, '/api/office-regulations')).json()) as WhatTheOfficeRegulationsSay
      expect(said.chapters).toHaveLength(DEFAULTS.chapters.length)
      expect(said.chapters.find((c) => c.n === 2)!.outline[0]!.text).toBe(changed)
    } finally {
      await second.stop()
    }
  }, 240_000)
})
