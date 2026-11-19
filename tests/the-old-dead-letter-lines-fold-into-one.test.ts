// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OLD DEAD-LETTER LINES IN THE SECRETARIAT GROUP FOLD INTO ONE LINE, AND NOTHING IS DELETED.
 *
 * Problem 0WUuvB0IhRfb in the office: the dead-letter sweep wrote one line per addressee into the
 * Secretariat group, and every line was delivered to every member. About 230 such lines fill the
 * group the person reads. scripts/fold-the-old-dead-letter-lines.ts folds them under one line of
 * Mole Office's, delivered to nobody, and the group draws that one line with a press that opens the
 * folded ones under it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, against a real server, a real database and a real browser
 * ---------------------------------------------------------------------------------------
 *
 *   1. Before the fold, the group draws every dead-letter line in its stream (the control).
 *   2. --check writes nothing: six tables read the same before and after, row for row.
 *   3. The run folds every line Mole Office wrote into the Secretariat group whose body is a
 *      dead-letter line ("Dead letters to claim", or "<handle>: <n> dead letter(s)"), whatever its
 *      title or its sentence, and no other line: not a person's or an agent's message with the same
 *      words, not another line of Mole Office's (a restart, the sweep's one line since 2 October), not
 *      a line in another group. It lists what it leaves, by kind, with the reason, and no line with
 *      a dead-letter body is among them. Its one new line is sent by Mole Office into the Secretariat
 *      group, has no delivery row, and says when it was written.
 *   4. It deletes nothing: no record deleted, one record more, no delivery row added or removed. The
 *      deliveries to agents still queued for a folded line now read "archived", and every other
 *      delivery row is as it was. A secretary who joined after the lines were written is given no
 *      delivery of a folded line.
 *   5. A second run folds nothing and says so. A dead-letter line found later is folded under the
 *      same fold line, and its sentence is written again to count it; no second fold line is written.
 *   6. A caller cannot set, change or take off `foldedInto`, on a new message or an old one.
 *   7. The group draws the one line, and its press opens the folded lines under it. The line stands
 *      at the time of the oldest line it holds, before newer lines and joins. A folded line is drawn
 *      from its addressee and count with the right plural, in English and in Chinese, and every join
 *      in Chinese has a space after the name. The opened lines are edged in the strong border colour
 *      in the dark look.
 *   8. The reader `theFoldsOf`, on its own: a fold into a line that is not here, and a fold into a
 *      folded line, both stay in the stream.
 *
 * THE ARCHIVING STEP calls `archiveDeliveries` in src/server/lib/messages.ts, the one writer of the
 * "archived" mark. The new line is written by `writeASystemLine` with nobody to deliver it to, the
 * same `deliveredOnlyTo` the dead-letter sweep's line uses, so the line stores `deliveredOnlyTo: []`.
 *
 * PICTURES, only when TEST_SHOTS is set (tests/where-shots-go.ts): the Secretariat group before and
 * after the fold, at 1440, 990, 660 and 390 in light and dark, in English and in Chinese. After the
 * fold, each is taken folded and opened. The data is made up: a fresh database with made-up lines.
 */

import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, theOfficesOwnIdIn, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINE_TITLE } from '../src/shared/groups.ts'
import { ONLY_THE_OFFICE_FOLDS_A_LINE } from '../src/shared/messages.ts'
import { theFoldsOf } from '../src/shared/folded-lines.ts'

let app: LiveApp
const shots = testShots('dead-letter-fold')

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's own sender, read from the database by the handle its row is stored under. */
function moleOfficeSender(db: Database.Database): string {
  return JSON.stringify({ kind: 'agent', id: theOfficesOwnIdIn(db) })
}
const THE_FOLD_WORDS = 'Old dead-letter lines folded here'

/** Three made-up secretaries, in the group before the lines are written. */
const SECRETARIES = ['sec-ash', 'sec-birch', 'sec-cedar'] as const
/** A fourth, who joins after the lines were written and before the fold. */
const THE_LATE_ONE = 'sec-dune'

/** Two made-up sweeps, as the old sweep wrote them: one opening line, then one line per addressee. */
const SWEEPS = [
  { at: '2026-09-16 21:10', addressees: [['retired-a', 4], ['retired-b', 1], ['retired-c', 12]] },
  {
    at: '2026-10-02 02:05',
    addressees: [['retired-d', 3], ['retired-e', 7], ['retired-f', 2], ['retired-g', 5], ['retired-h', 9], ['retired-i', 1]],
  },
] as const

/** The ids of the lines the fold must take, in the order written. */
const deadLetterLines: string[] = []
/** The ids of the lines the fold must leave alone, each named by why. */
const leftAlone = new Map<string, string>()
let secretariat = ''
let anotherGroup = ''
/** The office's "Mole Office restarted" line of 21 September, which the fold leaves in the stream. */
let restartedLine = ''

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx')
function runTheScript(args: string[]): { status: number | null; out: string; err: string } {
  const done = spawnSync(TSX, ['scripts/fold-the-old-dead-letter-lines.ts', ...args], {
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_DB: join(app.dir, 'panelx.db') },
    timeout: 120_000,
  })
  return { status: done.status, out: done.stdout, err: done.stderr }
}

/** The tables a fold could change, every row, in a fixed order. */
const TABLES = ['records', 'changes', 'revisions', 'message_delivery', 'groups', 'group_members'] as const
function snapshot(): Record<string, unknown[]> {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    const out: Record<string, unknown[]> = {}
    for (const table of TABLES) out[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    return out
  } finally {
    db.close()
  }
}

function readRow(id: string): { data: Record<string, unknown>; deletedAt: string | null } {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    const row = db.prepare('SELECT data, deleted_at AS deletedAt FROM records WHERE id = ?').get(id) as { data: string; deletedAt: string | null }
    return { data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deletedAt }
  } finally {
    db.close()
  }
}

function createdAtOf(id: string): string {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    return (db.prepare('SELECT created_at AS createdAt FROM records WHERE id = ?').get(id) as { createdAt: string }).createdAt
  } finally {
    db.close()
  }
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
}

async function aMessage(title: string, data: Record<string, unknown>): Promise<string> {
  const made = await post('/api/records', { kind: 'message', title, data })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/**
 * MAKE A MESSAGE LOOK AS THE OLD SWEEP LEFT IT: sent by Mole Office, at its own time, with a queued
 * delivery to the person beside the ones the secretaries already have. No request may name Mole
 * Office as a sender, so this writes the test's own database, as tests/an-old-system-line-gets-its-
 * short-words.test.ts does.
 */
function asTheOfficeWroteIt(id: string, at: string, fromTheOffice: boolean): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    if (fromTheOffice) db.prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?").run(moleOfficeSender(db), id)
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(at, at, id)
    if (fromTheOffice) {
      db.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(nanoid(12), id, 'person', THE_PERSON, 'queued', at)
    }
  } finally {
    db.close()
  }
}

/** MAKE A MESSAGE LOOK AS AN AGENT WROTE IT, in the test's own database, by its stored handle. */
function asAnAgentWroteIt(id: string, handle: string): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?").run(JSON.stringify({ kind: 'agent', id: handle }), id)
  } finally {
    db.close()
  }
}

async function aSecretary(handle: string): Promise<void> {
  const made = await post('/api/agents/started', { handle, name: handle.replace('sec-', 'Sec ').replace(/\b\w/g, (c) => c.toUpperCase()), role: 'secretary' })
  expect(made.status, await made.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'dead-letter-fold', viewport: { width: 1440, height: 1000 } })
  for (const one of SECRETARIES) await aSecretary(one)
  const groups = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
  const found = ((await groups.json()) as { groups: { id: string; pinned: boolean }[] }).groups.find((one) => one.pinned)
  expect(found, 'the office has no pinned Secretariat group').toBeDefined()
  secretariat = found?.id ?? ''

  // THE OLD SWEEPS, line by line, each second apart.
  for (const sweep of SWEEPS) {
    let second = 10
    const total = sweep.addressees.reduce((sum, one) => sum + one[1], 0)
    const opening = await aMessage(SYSTEM_LINE_TITLE, {
      body: 'Dead letters to claim',
      saidInFull: `${String(total)} dead letters, for ${String(sweep.addressees.length)} addressees, past the threshold.`,
      toGroup: secretariat,
    })
    asTheOfficeWroteIt(opening, `${sweep.at}:${String(second++)}`, true)
    deadLetterLines.push(opening)
    for (const [handle, count] of sweep.addressees) {
      const line = await aMessage(SYSTEM_LINE_TITLE, { body: `${handle}: ${String(count)} dead letters`, toGroup: secretariat })
      asTheOfficeWroteIt(line, `${sweep.at}:${String(second++)}`, true)
      deadLetterLines.push(line)
    }
  }

  // LINES OF MOLE OFFICE'S WITH A DEAD-LETTER BODY UNDER ANOTHER TITLE, OR WITH ANOTHER SENTENCE. The fold takes
  // these too: what makes a dead-letter line is who sent it and its body, whatever its title or its sentence.
  const anotherTitle = await aMessage('Not the system title', { body: 'retired-z: 2 dead letters', toGroup: secretariat })
  asTheOfficeWroteIt(anotherTitle, '2026-09-22 10:00:00', true)
  deadLetterLines.push(anotherTitle)
  const anotherSentence = await aMessage(SYSTEM_LINE_TITLE, { body: 'Dead letters to claim', saidInFull: 'Some other words.', toGroup: secretariat })
  asTheOfficeWroteIt(anotherSentence, '2026-09-23 10:00:00', true)
  deadLetterLines.push(anotherSentence)

  // THE LINES THE FOLD MUST LEAVE ALONE.
  // UNDER THE SYSTEM-LINE TITLE TOO, so only who sent it tells it apart from a dead-letter line.
  const byThePerson = await aMessage(SYSTEM_LINE_TITLE, { body: 'retired-a: 4 dead letters', toGroup: secretariat })
  asTheOfficeWroteIt(byThePerson, '2026-09-20 10:00:00', false)
  leftAlone.set(byThePerson, 'a message the person wrote with the same words')
  const byAnAgent = await aMessage(SYSTEM_LINE_TITLE, { body: 'Dead letters to claim', toGroup: secretariat })
  asTheOfficeWroteIt(byAnAgent, '2026-09-20 11:00:00', false)
  asAnAgentWroteIt(byAnAgent, SECRETARIES[0])
  leftAlone.set(byAnAgent, 'a message an agent wrote with the same words')
  const anotherLine = await aMessage(SYSTEM_LINE_TITLE, { body: 'Mole Office restarted', toGroup: secretariat })
  asTheOfficeWroteIt(anotherLine, '2026-09-21 10:00:00', true)
  leftAlone.set(anotherLine, 'another line of Mole Office')
  restartedLine = anotherLine
  const theNewSweepLine = await aMessage(SYSTEM_LINE_TITLE, {
    body: 'Dead letters',
    saidInFull: 'Archived 1 notice from Mole Office to retired agents, and nobody was woken for it: retired-a (1). This line is delivered to nobody.',
    toGroup: secretariat,
  })
  asTheOfficeWroteIt(theNewSweepLine, '2026-10-02 12:00:00', true)
  leftAlone.set(theNewSweepLine, "the sweep's one line since 2 October")
  const opened = await post('/api/groups', {
    name: 'Another group',
    because: 'A group that is not the Secretariat.',
    members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' }],
  })
  expect(opened.status, await opened.clone().text()).toBe(201)
  anotherGroup = ((await opened.json()) as { group: { id: string } }).group.id
  const inAnotherGroup = await aMessage(SYSTEM_LINE_TITLE, {
    body: 'Dead letters to claim',
    saidInFull: '4 dead letters, for 1 addressee, past the threshold.',
    toGroup: anotherGroup,
  })
  asTheOfficeWroteIt(inAnotherGroup, '2026-09-24 10:00:00', true)
  leftAlone.set(inAnotherGroup, 'a line in another group')

  // AND A SECRETARY WHO JOINS AFTER THE LINES WERE WRITTEN, so the fold is seen to hand them nothing.
  await aSecretary(THE_LATE_ONE)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================================ the page

type Theme = 'light' | 'dark'
type Language = 'en' | 'zh'

/** Open the Secretariat group in the chat panel, filling the window, and wait for its stream. */
async function openTheSecretariat(language: Language = 'en', theme: Theme = 'light', width = 1440): Promise<void> {
  const page = app.page
  await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 30_000)
  await openTheChat(page)
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await page.click('.px-chat-tab[data-tab="groups"]')
  await page.waitForSelector('.px-chat-top-group[data-category="pinned"]', { timeout: 20_000 })
  await page.click('.px-chat-top-group[data-category="pinned"] .px-chat-contact')
  await page.waitForSelector('.px-chat-said', { timeout: 20_000 })
  const fill = await page.$('.px-chat-fill[aria-pressed="false"]')
  if (fill !== null) await fill.click()
  await page.waitForTimeout(300)
}

/** Which of the dead-letter lines are drawn straight in the stream, and which inside the folded list. */
async function whereTheLinesAre(): Promise<{ inTheStream: number; folded: number; holders: number; press: string }> {
  return app.page.evaluate((ids: string[]) => {
    const said = document.querySelector('.px-chat-said')
    const top = said === null ? [] : Array.from(said.children)
    const names = (one: Element): boolean => ids.some((id) => (one.getAttribute('data-target') ?? '').includes(id))
    return {
      inTheStream: top.filter(names).length,
      folded: Array.from(document.querySelectorAll('.px-chat-said .px-chat-folded > li')).filter(names).length,
      holders: document.querySelectorAll('.px-chat-said > li[data-holds-folded="yes"]').length,
      press: document.querySelector('.px-chat-folded-press')?.textContent ?? '',
    }
  }, deadLetterLines)
}

async function photograph(name: string, opened: boolean): Promise<void> {
  // EVERY WIDTH, BOTH LOOKS, IN BOTH LANGUAGES.
  const runs: { language: Language; theme: Theme; width: number }[] = (['en', 'zh'] as const).flatMap((language) =>
    [1440, 990, 660, 390].flatMap((width) => (['light', 'dark'] as const).map((theme) => ({ language, theme, width }))),
  )
  for (const run of runs) {
    await openTheSecretariat(run.language, run.theme, run.width)
    if (opened) {
      await app.page.click('.px-chat-folded-press')
      await app.page.waitForSelector('.px-chat-folded', { timeout: 10_000 })
      await app.page.locator('.px-chat-folded-press').scrollIntoViewIfNeeded()
    } else if ((await app.page.$('.px-chat-folded-press')) !== null) {
      // FOLDED, THE FOLD LINE IS IN THE PICTURE, which at a narrow width is above the newest lines.
      await app.page.locator('.px-chat-folded-press').scrollIntoViewIfNeeded()
    }
    const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sideways, `${name} at ${String(run.width)} scrolls sideways`).toBe(0)
    await app.page.screenshot({ path: `${shots}/${name}-${String(run.width)}-${run.theme}-${run.language}.png` })
  }
}

// ============================================================================ the cases

describe('before the fold', () => {
  it('draws every dead-letter line in the group stream', async () => {
    await openTheSecretariat()
    await app.page.waitForFunction(
      (n: number) => document.querySelectorAll('.px-chat-said > li.px-chat-system').length >= n,
      deadLetterLines.length,
      { timeout: 20_000 },
    )
    const where = await whereTheLinesAre()
    expect(where.inTheStream, 'the dead-letter lines are not all drawn before the fold').toBe(deadLetterLines.length)
    expect(where.holders, 'a line holds folded lines before anything was folded').toBe(0)
  }, 120_000)

  describe.skipIf(!process.env[TEST_SHOTS])('pictures', () => {
    it('photographs the group before the fold', async () => {
      await photograph('before', false)
    }, 600_000)
  })
})

describe('the script', () => {
  it('with --check, writes nothing and says what it would do', async () => {
    // NO PAGE IS OPEN while the tables are read, so a page marking a line read cannot move them.
    await app.page.goto('about:blank')
    const before = snapshot()
    const done = runTheScript(['--check'])
    expect(done.status, done.err).toBe(0)
    expect(snapshot(), '--check changed the database').toEqual(before)
    expect(done.out).toContain(`${String(deadLetterLines.length)} are old dead-letter lines to fold: 3 "Dead letters to claim"`)
    expect(done.out).toContain('retired-c (12)')
    expect(done.out).toContain(THE_FOLD_WORDS)
    // WHAT IT LEAVES, BY KIND, WITH THE REASON, and no line with a dead-letter body among them.
    const left = done.out.slice(done.out.indexOf('are left as they are'), done.out.indexOf('Step 2.'))
    expect(left).toContain('2 x messages a person or an agent wrote: a fold never takes words somebody wrote')
    expect(left).toContain(`1 x other lines of Mole Office's, which are not dead-letter lines: "Mole Office restarted"`)
    expect(left).toContain(`1 x the sweep's one line "Dead letters" since 2 October 2026`)
    expect(left).toContain(`And the group's ${String(SECRETARIES.length + 2)} joins stay too`)
    expect(left, 'the run leaves a dead-letter line in the group').not.toMatch(/: \d+ dead letters?"|Dead letters to claim/)
    // THREE SECRETARIES WERE IN THE GROUP when each line was written; the person's rows are not counted.
    expect(done.out).toContain(`It would archive ${String(deadLetterLines.length * SECRETARIES.length)} deliveries to agents`)
    expect(done.out).toContain('Nothing was written.')
  }, 180_000)

  let before: Record<string, unknown[]> = {}
  let foldId = ''

  it('folds exactly the dead-letter lines into one new line delivered to nobody', async () => {
    before = snapshot()
    const done = runTheScript([])
    // ALL THREE STEPS ARE DONE, and the run says how many deliveries it archived.
    expect(done.status, done.err).toBe(0)
    expect(done.out).toContain('Step 2. Wrote the line')
    expect(done.out).toContain(`Archived ${String(deadLetterLines.length * SECRETARIES.length)} deliveries.`)

    const after = snapshot()
    const ids = (rows: unknown[]): string[] => rows.map((one) => (one as { id: string }).id)
    const fresh = ids(after['records'] ?? []).filter((id) => !ids(before['records'] ?? []).includes(id))
    expect(fresh.length, 'the run did not write exactly one record').toBe(1)
    foldId = fresh[0] ?? ''
    const line = readRow(foldId).data
    expect(line['body']).toBe(THE_FOLD_WORDS)
    expect(line['toGroup']).toBe(secretariat)
    const officeDb = new Database(join(app.dir, 'panelx.db'), { readonly: true })
    try {
      expect(line['sentBy']).toEqual({ kind: 'agent', id: theOfficesOwnIdIn(officeDb) })
    } finally {
      officeDb.close()
    }
    // DELIVERED TO NOBODY, said the way the sweep's own line says it, so a page says it the same way.
    expect(line['deliveredOnlyTo']).toEqual([])
    expect(String(line['saidInFull'])).toContain(
      `${String(deadLetterLines.length)} lines that Mole Office wrote about dead letters in this group from 2026-09-16 21:10:10 to ` +
        '2026-10-02 02:05:16 are folded under this line.',
    )
    expect(String(line['saidInFull'])).toContain('retired-c (12)')
    expect(String(line['saidInFull'])).toContain('retired-z (2)')
    // AND WHEN THE FOLD LINE WAS WRITTEN, which is its own time.
    expect(String(line['saidInFull'])).toContain(`Mole Office wrote this line at ${createdAtOf(foldId)}.`)
    const rowsOfTheLine = (after['message_delivery'] ?? []).filter((one) => (one as { message_id: string }).message_id === foldId)
    expect(rowsOfTheLine, 'the fold line was delivered to somebody').toEqual([])

    for (const id of deadLetterLines) expect(readRow(id).data['foldedInto'], `line ${id} was not folded`).toBe(foldId)
    for (const [id, why] of leftAlone) {
      const was = (before['records'] ?? []).find((one) => (one as { id: string }).id === id)
      const now = (after['records'] ?? []).find((one) => (one as { id: string }).id === id)
      expect(now, `the fold touched ${why}`).toEqual(was)
    }
    // AND THE CHANGE LOG KEEPS EACH FOLD.
    const folds = (after['changes'] ?? []).filter((one) => (one as { field: string | null }).field === 'data.foldedInto')
    expect(folds.length, 'the change log does not hold one row per folded line').toBe(deadLetterLines.length)
  }, 180_000)

  it('deletes nothing and hands no folded line to a member who joined later', () => {
    const after = snapshot()
    expect((after['records'] ?? []).length).toBe((before['records'] ?? []).length + 1)
    // NO DELIVERY ROW IS ADDED OR REMOVED. The queued rows to agents for a folded line now read
    // "archived"; every other row is exactly as it was.
    const rowsBefore = (before['message_delivery'] ?? []) as Record<string, unknown>[]
    const rowsAfter = (after['message_delivery'] ?? []) as Record<string, unknown>[]
    expect(rowsAfter.length, 'the fold added or removed a delivery row').toBe(rowsBefore.length)
    let archived = 0
    rowsBefore.forEach((was, at) => {
      const now = rowsAfter[at] ?? {}
      const folded = deadLetterLines.includes(String(was['message_id']))
      if (folded && was['recipient_kind'] === 'agent' && was['mark'] === 'queued') {
        expect(now['mark'], `a queued delivery of folded line ${String(was['message_id'])} was not archived`).toBe('archived')
        expect(now['message_id']).toBe(was['message_id'])
        expect(now['recipient_id']).toBe(was['recipient_id'])
        archived += 1
      } else {
        expect(now, 'the fold changed a delivery row it had no reason to touch').toEqual(was)
      }
    })
    expect(archived).toBe(deadLetterLines.length * SECRETARIES.length)
    const deleted = (after['records'] ?? []).filter((one) => (one as { deleted_at: string | null }).deleted_at !== null)
    const deletedBefore = (before['records'] ?? []).filter((one) => (one as { deleted_at: string | null }).deleted_at !== null)
    expect(deleted.length).toBe(deletedBefore.length)
  })

  it('folds nothing the second time, and says so', () => {
    const again = snapshot()
    const done = runTheScript([])
    expect(done.out, done.err).toContain('No dead-letter line is waiting to be folded')
    expect(done.out).toContain(`${String(deadLetterLines.length)} are folded already`)
    expect(done.out).toContain('No folded line has a delivery to an agent still queued, so nothing is archived.')
    expect(snapshot(), 'the second run changed the database').toEqual(again)
    expect(foldId).not.toBe('')
  }, 180_000)

  it('folds a dead-letter line found later under the same fold line, and says so in its sentence', async () => {
    const late = await aMessage(SYSTEM_LINE_TITLE, { body: 'retired-x: 1 dead letter', toGroup: secretariat })
    asTheOfficeWroteIt(late, '2026-10-02 03:00:00', true)
    const before = snapshot()
    const done = runTheScript([])
    expect(done.status, done.err).toBe(0)
    expect(done.out).toContain(`Step 2. Folded 1 line under the fold line ${foldId}, which an earlier run wrote.`)
    const after = snapshot()
    // NO SECOND FOLD LINE: the group keeps one.
    expect((after['records'] ?? []).length, 'the run wrote a second fold line').toBe((before['records'] ?? []).length)
    expect(readRow(late).data['foldedInto']).toBe(foldId)
    deadLetterLines.push(late)
    const said = String(readRow(foldId).data['saidInFull'])
    expect(said).toContain(`${String(deadLetterLines.length)} lines that Mole Office wrote about dead letters in this group`)
    expect(said).toContain('to 2026-10-02 03:00:00 are folded under this line.')
    expect(said).toContain('retired-x (1)')
    expect(said).toContain(`Mole Office wrote this line at ${createdAtOf(foldId)}.`)
  }, 180_000)
})

describe('a caller', () => {
  it('cannot write foldedInto on a new message, or set, change or take it off an old one', async () => {
    const made = await post('/api/records', {
      kind: 'message',
      title: 'A message',
      data: { body: 'Hello.', toGroup: secretariat, foldedInto: deadLetterLines[0] },
    })
    expect(made.status).toBe(403)
    expect(await made.text()).toContain(ONLY_THE_OFFICE_FOLDS_A_LINE.slice(0, 60))

    const mine = await aMessage('A message', { body: 'Mine.', toGroup: secretariat })
    const patch = async (body: unknown, id = mine): Promise<Response> =>
      fetch(`${app.api}/api/records/${id}`, { method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify(body) })
    const named = await patch({ dataPatch: { foldedInto: deadLetterLines[0] } })
    expect(named.status).toBe(403)
    expect(await named.text()).toContain(ONLY_THE_OFFICE_FOLDS_A_LINE.slice(0, 60))
    const whole = readRow(mine).data
    const replaced = await patch({ data: { ...whole, foldedInto: deadLetterLines[0] } })
    expect(replaced.status).toBe(403)
    expect(await replaced.text()).toContain(ONLY_THE_OFFICE_FOLDS_A_LINE.slice(0, 60))
    const first = deadLetterLines[0] ?? ''
    const { foldedInto: _taken, ...unfolded } = readRow(first).data
    void _taken
    const takenOff = await patch({ data: unfolded, replace: true }, first)
    expect(takenOff.status).toBe(403)
    expect(await takenOff.text()).toContain(ONLY_THE_OFFICE_FOLDS_A_LINE.slice(0, 60))
    expect(readRow(first).data['foldedInto'], 'a caller took the fold off').toBeTruthy()
  }, 60_000)
})

describe('after the fold', () => {
  it('draws the one line, and its press opens the folded lines under it', async () => {
    await openTheSecretariat()
    await app.page.waitForSelector('.px-chat-said > li[data-holds-folded="yes"]', { timeout: 20_000 })
    const closed = await whereTheLinesAre()
    expect(closed.holders, 'no line, or more than one, holds the folded lines').toBe(1)
    expect(closed.inTheStream, 'a folded line is still drawn in the stream').toBe(0)
    expect(closed.folded).toBe(0)
    expect(closed.press).toBe(`Show the ${String(deadLetterLines.length)} lines folded here`)
    // AND THE LINES THE FOLD LEFT ALONE ARE STILL DRAWN.
    const stillThere = await app.page.evaluate(
      (ids: string[]) => ids.filter((id) => document.querySelector(`.px-chat-said > li[data-target*="${id}"]`) !== null).length,
      [...leftAlone.keys()].filter((id) => !(leftAlone.get(id) ?? '').includes('another group')),
    )
    expect(stillThere).toBe(4)

    await app.page.click('.px-chat-folded-press')
    await app.page.waitForSelector('.px-chat-folded', { timeout: 10_000 })
    const opened = await whereTheLinesAre()
    expect(opened.folded, 'the press did not open every folded line').toBe(deadLetterLines.length)
    expect(opened.inTheStream).toBe(0)
    expect(opened.press).toBe(`Hide the ${String(deadLetterLines.length)} lines folded here`)
  }, 120_000)

  it('stands the fold line at the time of the oldest line it holds, so the stream reads in time order', async () => {
    await openTheSecretariat()
    await app.page.waitForSelector('.px-chat-said > li[data-holds-folded="yes"]', { timeout: 20_000 })
    await app.page.click('.px-chat-folded-press')
    await app.page.waitForSelector('.px-chat-folded', { timeout: 10_000 })
    const order = await app.page.evaluate((restarted: string) => {
      const top = Array.from(document.querySelector('.px-chat-said')?.children ?? [])
      const holder = top.findIndex((one) => one.getAttribute('data-holds-folded') === 'yes')
      const when = (one: Element | null | undefined): string => one?.querySelector(':scope > .px-chat-system-stack .px-chat-system-when')?.textContent ?? ''
      return {
        holder,
        restarted: top.findIndex((one) => (one.getAttribute('data-target') ?? '').includes(restarted)),
        firstJoin: top.findIndex((one) => one.getAttribute('data-joined') === 'yes'),
        holderWhen: when(top[holder]),
        firstFoldedWhen: when(document.querySelector('.px-chat-folded > li')),
      }
    }, restartedLine)
    // THE OLDEST FOLDED LINE IS OF 16 SEPTEMBER, before the restart of 21 September and before every join.
    expect(order.holder, 'the fold line is not in the stream').toBeGreaterThanOrEqual(0)
    expect(order.restarted, 'the restart line is not in the stream').toBeGreaterThanOrEqual(0)
    expect(order.holder, 'the fold line stands after a newer line').toBeLessThan(order.restarted)
    expect(order.holder, 'the fold line stands after a newer join').toBeLessThan(order.firstJoin)
    expect(order.holderWhen, 'the time above the fold line is not its oldest line').toBe(order.firstFoldedWhen)
  }, 120_000)

  it('draws an old line from its addressee and count, with the right plural, in English and in Chinese', async () => {
    const one = deadLetterLines[2] ?? ''
    const blockOf = async (): Promise<{ folded: string; holder: string; joins: string[] }> =>
      app.page.evaluate((id: string) => {
        const block = (li: Element | null | undefined): string => li?.querySelector('.px-chat-system-block')?.textContent ?? ''
        return {
          folded: block(document.querySelector(`.px-chat-folded > li[data-target*="${id}"]`)),
          holder: block(document.querySelector('.px-chat-said > li[data-holds-folded="yes"]')),
          joins: Array.from(document.querySelectorAll('.px-chat-said > li[data-joined="yes"]')).map((li) => block(li)),
        }
      }, one)
    await openTheSecretariat('en')
    await app.page.click('.px-chat-folded-press')
    await app.page.waitForSelector('.px-chat-folded', { timeout: 10_000 })
    const english = await blockOf()
    // THE STORED BODY SAYS "retired-b: 1 dead letters"; it is drawn with the singular, and the body is not changed.
    expect(readRow(one).data['body']).toBe('retired-b: 1 dead letters')
    expect(english.folded).toBe('retired-b: 1 dead letter')
    expect(english.holder).toBe(THE_FOLD_WORDS)

    await openTheSecretariat('zh')
    await app.page.click('.px-chat-folded-press')
    await app.page.waitForSelector('.px-chat-folded', { timeout: 10_000 })
    const chinese = await blockOf()
    expect(chinese.folded).toBe('retired-b：1 封死信')
    expect(chinese.holder).toBe('旧的死信消息折叠在这里')
    const press = (await app.page.locator('.px-chat-folded-press').textContent()) ?? ''
    expect(press).toBe(`收起折叠在这里的 ${String(deadLetterLines.length)} 条消息`)
    // AND EVERY JOIN HAS A SPACE BETWEEN THE NAME AND THE WORDS.
    expect(chinese.joins.length).toBe(SECRETARIES.length + 2)
    for (const join of chinese.joins) expect(join, `a join reads "${join}"`).toMatch(/\S 加入了群聊$/)
  }, 120_000)

  it('draws the border of the opened lines in the strong border colour, in the dark look', async () => {
    await openTheSecretariat('en', 'dark')
    await app.page.click('.px-chat-folded-press')
    await app.page.waitForSelector('.px-chat-folded', { timeout: 10_000 })
    const colours = await app.page.evaluate(() => {
      const list = document.querySelector('.px-chat-folded')
      const probe = document.createElement('span')
      probe.style.color = 'var(--border-strong)'
      list?.appendChild(probe)
      const strong = getComputedStyle(probe).color
      probe.remove()
      return { top: list === null ? '' : getComputedStyle(list).borderTopColor, strong }
    })
    expect(colours.strong).not.toBe('')
    expect(colours.top, 'the opened lines are edged in a fainter colour than the strong border').toBe(colours.strong)
  }, 120_000)

  describe.skipIf(!process.env[TEST_SHOTS])('pictures', () => {
    it('photographs the group after the fold, folded and opened', async () => {
      await photograph('after-folded', false)
      await photograph('after-opened', true)
    }, 1_200_000)
  })
})

describe('theFoldsOf', () => {
  it('keeps in the stream a line folded into a line that is not here, or into a folded line', () => {
    const lines = [
      { id: 'a' },
      { id: 'b', foldedInto: 'a' },
      { id: 'c', foldedInto: 'b' },
      { id: 'd', foldedInto: 'nowhere' },
      { id: 'e', foldedInto: 'e' },
      { id: 'f', foldedInto: 'a' },
    ]
    const folds = theFoldsOf(lines)
    expect(folds.shown.map((one) => one.id)).toEqual(['a', 'c', 'd', 'e'])
    expect((folds.under.get('a') ?? []).map((one) => one.id)).toEqual(['b', 'f'])
    expect(folds.under.size).toBe(1)
  })
})
