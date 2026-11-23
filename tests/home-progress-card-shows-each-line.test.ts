// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Test change: made-up agents and running counts use the door’s new shape.
// Test change (wave 13y round 175, as decided): a new file. Home's progress card draws a table of the project's lines,
// one row for each line and a total row, read from the people and packages door the board's fourth tab reads.
// Before, the card drew only the counts of the project's points and briefs, and no test held a line on Home.
/**
 * HOME'S PROGRESS CARD SHOWS EACH LINE'S AGENTS AND PACKAGES. Wave 13y round 175.
 *
 * WHAT IS REAL: a made-up office of this test's own (`liveApp`), never the live office. Every agent, run, request,
 * package, point and department here is made up, written straight into this office's own database or through its
 * doors. Nothing is kept in the browser but the person and the look, so Home is drawn in its first layout.
 *
 * THE OFFICE. Three lines, in the door's order:
 *   - 98r: three packages and nobody acting, so the line is at rest;
 *   - 98x: a supervisor whose run started two workers, and an agent whose card is inspector, all acting, with four
 *     packages and a department that holds the line's code;
 *   - the line not recorded: two acting agents with no card whose handles give no line. One is the agent this file
 *     writes. The other is the test office's own run. `liveApp` files that run in the project as it starts
 *     (tests/helpers.ts), and the run asks the office, so it acts.
 * One package is on both 98r and 98x, so the total counts six packages where the lines hold seven.
 *
 * WHAT THIS FILE PROVES, on the Home page:
 *   1. At 1440 in English, the table comes first in the card, under its heading, with the nine columns in order. Each
 *      row's cells are the door's answer from the same office, in the card's words. The line at rest reads
 *      "0 (resting)". The total row holds the answer's `total` and its `running.all`. The table's box does not scroll
 *      sideways.
 *   2. At 1440 in Chinese, the heading and the column words are the Chinese ones, and a running cell is in the
 *      Chinese form.
 *   3. The card counts nothing. A made-up answer whose total is not the sum of its lines, and whose `running.all` is not
 *      the sum of its parts, is drawn as given.
 *   4. At 390 the page does not scroll sideways and the table's box does. After the box is scrolled to its right end,
 *      each cell of the Line column is still at the box's left edge.
 *   5. At 1440 and at 390, in both languages, no cell is cut and no word is broken across two lines.
 *   6. A people and packages read that failed is said in the card, on its own line, and the two groups of counts are
 *      still drawn.
 *
 * HOW A BROKEN WORD IS MEASURED, as tests/copy-in-the-right-click-box-keeps-its-word-on-one-line.test.ts measures it:
 * a range over each word's characters, and the tops of its client rects. A word is broken when two of its rects stand
 * more than half a rect's height apart, so a glyph of another font on the same line is not counted as a second line.
 *
 * WHERE THE RULES LIVE: src/web/components/home/HomeLinesTable.tsx (the table), src/web/components/ProgressCard.tsx
 * (the card and its two reads), src/server/lib/project-people.ts (the door) and src/shared/project-people.ts (the
 * shapes and `theLineIsAtRest`).
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, sayInEnglish, type WordKey } from '../src/shared/i18n.ts'
import { theLineIsAtRest, type PeopleAgent, type PeopleAndPackages, type PeopleLine, type RunningCounts } from '../src/shared/project-people.ts'
import { NEARLY_IN_REACH } from '../src/web/components/InReach.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const HERE = 'default'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** When every made-up row here was written, on the office's clock. */
const AT = '2026-11-22 10:00:00'

/** The door's address for the project on screen, as the card asks it. */
const THE_DOOR = `/api/projects/${HERE}/people-and-packages`

/** Every ask of the door, whatever the project. */
const ANY_DOOR = '**/api/projects/*/people-and-packages*'

/** The nine columns, in the order the table draws them, each by the key its heading cell carries. */
const COLUMNS = ['line', 'department', 'running', 'packages', 'notTaken', 'inProgress', 'handedBack', 'accepted', 'blocked'] as const
type Column = (typeof COLUMNS)[number]

/** The word of each column's heading. */
const COLUMN_WORDS: Readonly<Record<Column, WordKey>> = {
  line: 'progressCard.lines.column.line',
  department: 'progressCard.lines.column.department',
  running: 'progressCard.lines.column.running',
  packages: 'progressCard.lines.column.packages',
  notTaken: 'progressCard.lines.column.notTaken',
  inProgress: 'progressCard.lines.column.inProgress',
  handedBack: 'progressCard.lines.column.handedBack',
  accepted: 'progressCard.lines.column.accepted',
  blocked: 'progressCard.lines.column.blocked',
}

/** The row key of the line not recorded, and of the total row. */
const NOT_RECORDED = 'not-recorded'
const TOTAL = 'total'

/** The department this file files for line 98x, in its two names. */
const DEPARTMENT = { en: 'Made-up builders', zh: '虚构的建造部' }

/** The page's words in Chinese, read by the same reader the page uses. */
const chinese = createI18n('zh').t

let app: LiveApp
const id: Record<string, string> = {}

async function call<T>(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text) as T
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const answer = await call<{ record: { id: string } }>('POST', '/api/records', AS_THE_PERSON, { kind, title, data })
  return answer.record.id
}

/**
 * One made-up backlog point of line 98x, so the progress read holds points and its two groups are drawn. A point is
 * no package, so it adds no row and no count to the table.
 */
function point(title: string, state: string): Promise<string> {
  return file('backlog_item', title, {
    line: '98x',
    number: title,
    state,
    placedBy: { kind: 'person', id: THE_PERSON },
    why: `Made-up: ${title} is one point of the line.`,
    doneWhen: `Made-up: ${title} is true.`,
  })
}

/** The rows this file writes straight into its office's database, as the board's own tests write them. */
function writeTheOffice(db: Database.Database): void {
  const anAgent = (name: string, handle: string, role: string | null): void => {
    id[name] = `made-up-agent-${name}`
    db.prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    ).run(`avatar-default-agent-${id[name]}`, AT)
    db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, role) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id[name], `Made-up ${name}`, handle, `avatar-default-agent-${id[name]}`, AT, role)
  }
  const aRecord = (name: string, kind: string, title: string, data: Record<string, unknown>): void => {
    id[name] = `made-up-${name}`
    db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')",
    ).run(id[name], HERE, THE_TEST_OFFICES_OWNER.id, AT, AT, kind, title, JSON.stringify(data))
  }
  const aRun = (name: string, agent: string, handle: string, more: Record<string, unknown> = {}): void => {
    aRecord(name, 'session', `A made-up run, ${name}`, {
      state: 'running',
      servingAgent: handle,
      servingAgentId: id[agent],
      model: 'made-up-model',
      runtime: 'claude-code',
      ...more,
    })
  }
  const anAct = (order: number) => ({ by: { actorType: 'agent', actorId: id['supervisor']! }, at: AT, order })
  const aPackage = (name: string, lines: string[], acts: Record<string, unknown>, state = 'todo'): void => {
    aRecord(name, 'task', `A made-up package, ${name}`, {
      state,
      package: {
        bundleId: 'madeUpBundle',
        forTheOutside: 'Made-up: nothing leaves.',
        acceptance: 'Made-up: nothing is judged.',
        parent: { kind: 'decision', id: 'made-up-parent' },
        lines,
        pointIds: [`made-up-point-${name}`],
        at: AT,
        by: { actorType: 'human', actorId: THE_PERSON },
        ...acts,
      },
    })
  }
  const handedBack = (name: string) => [{ ...anAct(2), points: [{ pointId: `made-up-point-${name}`, outcome: 'done', words: 'Made-up.' }] }]
  const aStartedWorker = (handle: string, run: string) => ({
    state: 'started',
    askedAt: AT,
    askedBy: { who: { kind: 'agent', id: 'made-up-asker' }, session: id['supervisor-run'] },
    handle,
    brief: { path: '/made-up/sandbox/brief.md', sha256: 'a'.repeat(64), bytes: 1 },
    sandbox: { folder: '/made-up/sandbox', instance: 'made-up-instance', container: 'made-up-container' },
    started: { at: AT, run, runKeyId: 'made-up-key' },
  })
  const aRequestFrom = (run: string): void => {
    db.prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES (?, ?, 'GET', 200, 1, 'agent', 'made-up-agent', ?, ?, 'none')",
    ).run(`made-up-call-${run}`, Date.now() - 5 * 60_000, run, HERE)
  }

  // THE AGENTS: a supervisor and two workers on 98x, an agent of another card on 98x, and one with no card and no line.
  anAgent('supervisor', 'wave-98x-supervisor', 'supervisor')
  anAgent('worker-one', 'w98x-worker-one', 'worker')
  anAgent('worker-two', 'w98x-worker-two', 'worker')
  anAgent('inspector', 'w98x-inspector', 'inspector')
  anAgent('helper', 'made-up-helper', null)

  // THE PACKAGES. Line 98r: one not taken, one handed back, and one not taken that is on 98x too. Line 98x: one
  // taken, one accepted and one blocked, and the one it shares with 98r.
  aPackage('rest-not-taken', ['98r'], {})
  aPackage('rest-handed-back', ['98r'], { takenInside: [anAct(1)], handedBack: handedBack('rest-handed-back') })
  aPackage('shared-not-taken', ['98r', '98x'], {})
  aPackage('busy-taken', ['98x'], { takenInside: [anAct(1)] })
  aPackage('busy-accepted', ['98x'], {
    takenInside: [anAct(1)],
    handedBack: handedBack('busy-accepted'),
    acceptances: [{ ...anAct(3), by: { actorType: 'agent', actorId: 'made-up-maker' }, points: [{ pointId: 'made-up-point-busy-accepted', answer: 'accepted' }] }],
  })
  aPackage('busy-blocked', ['98x'], { takenInside: [anAct(1)] }, 'blocked')

  // THE DEPARTMENT that holds 98x's code. 98r's code is held by none.
  aRecord('department', 'department', DEPARTMENT.en, { state: 'running', codes: ['98x'], nameEn: DEPARTMENT.en, nameZh: DEPARTMENT.zh })

  // THE RUNS, each with a request five minutes ago, so each acts. The supervisor's run started the two workers' runs.
  id['supervisor-run'] = 'made-up-supervisor-run'
  aRun('worker-one-run', 'worker-one', 'w98x-worker-one')
  aRun('worker-two-run', 'worker-two', 'w98x-worker-two')
  aRun('supervisor-run', 'supervisor', 'wave-98x-supervisor', {
    workerRuns: {
      [id['worker-one']!]: aStartedWorker('w98x-worker-one', id['worker-one-run']!),
      [id['worker-two']!]: aStartedWorker('w98x-worker-two', id['worker-two-run']!),
    },
  })
  aRun('inspector-run', 'inspector', 'w98x-inspector')
  aRun('helper-run', 'helper', 'made-up-helper')
  for (const run of ['supervisor-run', 'worker-one-run', 'worker-two-run', 'inspector-run', 'helper-run']) aRequestFrom(id[run]!)
}

/** The people and packages door's answer for the project on screen, from the same office. */
function theDoor(): Promise<PeopleAndPackages> {
  return call<PeopleAndPackages>('GET', THE_DOOR, AS_THE_PERSON)
}

/** A row's key, as the table's row carries it. */
function theRowKey(line: PeopleLine): string {
  return line.line ?? NOT_RECORDED
}

type Say = typeof sayInEnglish

/** The running cell's parts in words: supervisors, workers and others, each left out at 0. */
function theParts(running: RunningCounts, say: Say): string[] {
  const parts: string[] = []
  if (running.supervisors === 1) parts.push(say('progressCard.lines.oneSupervisor'))
  if (running.supervisors > 1) parts.push(say('progressCard.lines.supervisors', { n: running.supervisors }))
  if (running.workers > 0) parts.push(say('progressCard.lines.workers', { n: running.workers }))
  if (running.others > 0) parts.push(say('progressCard.lines.others', { n: running.others }))
  return parts
}

/** A line's cells as the card must draw them from the door's answer, in English. */
function theCellsOf(line: PeopleLine): Record<Column, string> {
  const department =
    line.line === null || line.department === null ? '—'
    : line.department.state === 'held'
      ? `${line.department.name.en ?? sayInEnglish('department.name.notRecorded')} · ${
          line.secretary === null ? sayInEnglish('board.people.secretary.none') : sayInEnglish('board.people.secretary', { name: line.secretary.name })
        }`
    : line.department.state === 'held-by-several' ? sayInEnglish('board.line.heldBySeveral', { n: line.department.ids.length })
    : sayInEnglish('board.line.notFiled')
  const parts = theParts(line.running, sayInEnglish)
  const running =
    theLineIsAtRest(line) ? sayInEnglish('progressCard.lines.resting', { all: line.running.all })
    : parts.length === 0 ? String(line.running.all)
    : sayInEnglish('progressCard.lines.running', { all: line.running.all, parts: parts.join(' + ') })
  return {
    line: line.line ?? sayInEnglish('progressCard.lines.notRecorded'),
    department,
    running,
    packages: String(line.counts.all),
    notTaken: String(line.counts.notTaken),
    inProgress: String(line.counts.inProgress),
    handedBack: String(line.counts.handedBack),
    accepted: String(line.counts.accepted),
    blocked: String(line.counts.blocked),
  }
}

/** The total row's cells as the card must draw them, in English. */
function theTotalCells(people: PeopleAndPackages): Record<Column, string> {
  return {
    line: sayInEnglish('progressCard.lines.total'),
    department: '',
    running: String(people.running.all),
    packages: String(people.total.all),
    notTaken: String(people.total.notTaken),
    inProgress: String(people.total.inProgress),
    handedBack: String(people.total.handedBack),
    accepted: String(people.total.accepted),
    blocked: String(people.total.blocked),
  }
}

const theCard = () => app.page.locator('[data-progress-card="project"]')
const theTable = () => theCard().locator('[data-home-lines]')

/** The heading cells' words, in the order they are drawn, each with its column key. */
async function theHeadings(): Promise<{ column: string; words: string }[]> {
  return theTable().locator('th[data-home-line-column]').evaluateAll((cells) =>
    cells.map((cell) => ({ column: cell.getAttribute('data-home-line-column') ?? '', words: (cell.textContent ?? '').trim() })),
  )
}

/** Every row's cells as drawn: the row's key and each cell's words by its column. */
async function theRows(): Promise<{ row: string; cells: Record<string, string> }[]> {
  return theTable().locator('tr[data-home-line]').evaluateAll((rows) =>
    rows.map((row) => ({
      row: row.getAttribute('data-home-line') ?? '',
      cells: Object.fromEntries(
        [...row.querySelectorAll('[data-home-line-cell]')].map((cell) => [cell.getAttribute('data-home-line-cell') ?? '', (cell.textContent ?? '').trim()]),
      ),
    })),
  )
}

/** The cells of one row, by its key. */
async function theRow(key: string): Promise<Record<string, string>> {
  const found = (await theRows()).find((one) => one.row === key)
  if (found === undefined) throw new Error(`The table has no row ${key}.`)
  return found.cells
}

async function openHome(width: number, language: 'en' | 'zh', waitFor = `[data-home-line="${TOTAL}"]`): Promise<void> {
  await app.page.setViewportSize({ width, height: width < 700 ? 900 : 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=light#/`)
  await waitForThePage(app.page, 60_000)
  await theCard().waitFor({ state: 'visible', timeout: 30_000 })
  await theCard().locator(waitFor).first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** Whether the page is no wider than the window it is drawn in. */
async function noSidewaysScroll(): Promise<boolean> {
  return app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

/** The table's scrolling box: how wide its content is and how wide it is drawn. */
async function theBox(): Promise<{ scrollWidth: number; clientWidth: number }> {
  return theTable().evaluate((table) => {
    const box = table.closest('.hl-box')
    if (box === null) throw new Error('The table stands in no scrolling box.')
    return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth }
  })
}

/** Each cell that is cut, and each word broken across two lines, by the cell's row and column. */
async function theCutsAndBreaks(): Promise<string[]> {
  return theTable().evaluate((table) => {
    const found: string[] = []
    for (const cell of table.querySelectorAll<HTMLElement>('th, td')) {
      const row = cell.closest('tr')?.getAttribute('data-home-line') ?? 'head'
      const where = `${row}/${cell.getAttribute('data-home-line-cell') ?? cell.getAttribute('data-home-line-column') ?? '?'}`
      if (cell.scrollWidth > cell.clientWidth) found.push(`${where} is cut: ${String(cell.scrollWidth)} > ${String(cell.clientWidth)}`)
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        for (const word of text.matchAll(/\S+/gu)) {
          const range = document.createRange()
          const at = word.index ?? 0
          range.setStart(node, at)
          range.setEnd(node, at + word[0].length)
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
          if (rects.length < 2) continue
          const tops = rects.map((rect) => rect.top)
          const half = Math.min(...rects.map((rect) => rect.height)) / 2
          if (Math.max(...tops) - Math.min(...tops) > half) found.push(`${where}: "${word[0]}" is broken across lines`)
        }
      }
    }
    return found
  })
}

/** One made-up agent of a made-up answer, with nothing but what the shape needs. */
function aMadeUpAgent(handle: string): PeopleAgent {
  return {
    id: `made-up-${handle}`,
    handle,
    name: `Made-up ${handle}`,
    post: 'supervisor',
    packages: [],
    runs: [{ id: `made-up-run-${handle}`, title: 'A made-up run', startedAt: null, model: null, runtime: null, packages: [], workers: [] }],
  }
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  app = await liveApp({ name: 'home-progress-card-shows-each-line', viewport: { width: 1440, height: 1000 }, workspace: HERE })

  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.pragma('busy_timeout = 10000')
    writeTheOffice(db)
  } finally {
    db.close()
  }

  // TWO POINTS THROUGH THE OFFICE'S OWN DOOR, so the card's two groups hold counts.
  await point('The lines are drawn on Home', 'todo')
  await point('The lines are read', 'doing')

  // THE PAGE READS AS THE PERSON, in the look the address names, as the browser tests around it do.
  await app.page.addInitScript(
    ({ person }) => {
      const query = new URLSearchParams(location.search)
      localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    },
    { person: THE_PERSON },
  )
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('Home’s progress card shows each line’s agents and packages', () => {
  it('1. at 1440 in English, draws the table first, one row for each line of the door and a total row', async () => {
    await openHome(1440, 'en')
    const people = await theDoor()
    expect(people.lines.map(theRowKey), 'the made-up office holds the lines this file wrote').toEqual(['98r', '98x', NOT_RECORDED])

    // THE TABLE COMES FIRST, under its heading, and the two groups of counts follow it.
    const groups = await theCard().locator('[data-progress-group]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-progress-group')))
    expect(groups).toEqual(['lines', 'points', 'briefs'])
    const lines = theCard().locator('[data-progress-group="lines"]')
    expect((await lines.locator('.pg-group-title').textContent())?.trim()).toBe(sayInEnglish('progressCard.lines.title'))
    expect(await lines.locator('[data-home-lines]').count()).toBe(1)
    expect(await theHeadings()).toEqual(COLUMNS.map((column) => ({ column, words: sayInEnglish(COLUMN_WORDS[column]) })))

    // EACH ROW IS THE DOOR'S ANSWER, in the door's order, and the total row last.
    const rows = await theRows()
    expect(rows.map((one) => one.row)).toEqual([...people.lines.map(theRowKey), TOTAL])
    for (const line of people.lines) expect(await theRow(theRowKey(line)), `the row of ${theRowKey(line)}`).toEqual(theCellsOf(line))
    expect(await theRow(TOTAL)).toEqual(theTotalCells(people))

    // THE WORDS THIS OFFICE MUST READ, written out once so a rule that drifts on both sides is still caught.
    expect(await theRow('98r')).toMatchObject({ running: '0 (resting)', department: sayInEnglish('board.line.notFiled'), packages: '3', notTaken: '2', handedBack: '1' })
    expect(await theRow('98x')).toMatchObject({
      running: '4 (supervisor + 2 workers + 1 other)',
      department: `${DEPARTMENT.en} · ${sayInEnglish('board.people.secretary.none')}`,
      packages: '4',
      notTaken: '1',
      inProgress: '1',
      accepted: '1',
      blocked: '1',
    })
    expect(await theRow(NOT_RECORDED)).toMatchObject({ line: 'Line not recorded', department: '—', running: '2 (2 others)', packages: '0' })
    expect(await theRow(TOTAL)).toMatchObject({ running: '6', packages: '6' })

    const box = await theBox()
    expect(box.scrollWidth, 'the table’s box scrolls sideways at 1440').toBeLessThanOrEqual(box.clientWidth + NEARLY_IN_REACH)
  }, 180_000)

  it('2. at 1440 in Chinese, draws the Chinese heading, column words and running cell', async () => {
    await openHome(1440, 'zh')
    const lines = theCard().locator('[data-progress-group="lines"]')
    expect((await lines.locator('.pg-group-title').textContent())?.trim()).toBe(chinese('progressCard.lines.title'))
    expect(await theHeadings()).toEqual(COLUMNS.map((column) => ({ column, words: chinese(COLUMN_WORDS[column]) })))
    expect((await theHeadings()).map((one) => one.words)).toEqual([
      '线', '部门 · 秘书', '在跑的 agent (主管 + N 工人)', '包共计', '未领', '在做', '交回等收', '已收', '卡住',
    ])
    expect(await theRow('98x')).toMatchObject({ running: '4（主管 + 2 工人 + 1 其他）', department: `${DEPARTMENT.zh} · 秘书未记录` })
    expect(await theRow('98r')).toMatchObject({ running: '0（休息）' })
    expect(await theRow(NOT_RECORDED)).toMatchObject({ line: '未记录的线', running: '2（2 其他）' })
    expect(await theRow(TOTAL)).toMatchObject({ line: '合计', running: '6' })
  }, 180_000)

  it('3. counts nothing: a made-up answer is drawn as given, its total and its running counts too', async () => {
    const madeUp: PeopleAndPackages = {
      project: HERE,
      at: AT,
      actingWithinHours: 1,
      lines: [
        {
          line: '97a',
          department: null,
          secretary: null,
          running: { all: 9, supervisors: 1, workers: 2, others: 0, otherCards: [] },
          counts: { all: 5, notTaken: 1, inProgress: 1, handedBack: 0, accepted: 0, blocked: 0 },
          supervisors: [aMadeUpAgent('wave-97a-supervisor')],
          workersUnderNoSupervisor: [],
        },
        {
          line: '97b',
          department: { state: 'held-by-several', ids: ['made-up-one', 'made-up-two'] },
          secretary: null,
          running: { all: 3, supervisors: 0, workers: 0, others: 0, otherCards: [] },
          counts: { all: 0, notTaken: 0, inProgress: 0, handedBack: 0, accepted: 0, blocked: 0 },
          supervisors: [],
          workersUnderNoSupervisor: [],
        },
      ],
      running: { all: 17, supervisors: 1, workers: 2, others: 0, otherCards: [] },
      total: { all: 40, notTaken: 11, inProgress: 12, handedBack: 13, accepted: 3, blocked: 1 },
    }
    await app.page.route(ANY_DOOR, async (route) => route.fulfill({ response: await route.fetch(), status: 200, json: madeUp }))
    try {
      await openHome(1440, 'en', '[data-home-line="97a"]')
      expect((await theRows()).map((one) => one.row)).toEqual(['97a', '97b', TOTAL])
      expect(await theRow('97a')).toEqual(theCellsOf(madeUp.lines[0]!))
      expect(await theRow('97a')).toMatchObject({ department: '—', running: '9 (supervisor + 2 workers)', packages: '5' })
      // A RUNNING COUNT WITH NO PART is drawn as its number alone. Only a made-up answer can hold one.
      expect(await theRow('97b')).toMatchObject({ running: '3', department: sayInEnglish('board.line.heldBySeveral', { n: 2 }) })
      expect(await theRow(TOTAL)).toEqual(theTotalCells(madeUp))
      expect(await theRow(TOTAL)).toMatchObject({ running: '17', packages: '40', notTaken: '11', inProgress: '12', handedBack: '13' })
    } finally {
      await app.page.unroute(ANY_DOOR)
    }
  }, 180_000)

  it('4. at 390, the page does not scroll sideways, the box does, and the Line column stays at its left edge', async () => {
    await openHome(390, 'en')
    expect(await noSidewaysScroll()).toBe(true)
    const card = await theCard().boundingBox()
    expect(card).not.toBeNull()
    expect(card!.width).toBeLessThanOrEqual(390)
    const box = await theBox()
    expect(box.scrollWidth, 'the table fits a phone, so this case proves nothing').toBeGreaterThan(box.clientWidth + NEARLY_IN_REACH)

    const after = await theTable().evaluate(async (table) => {
      const scroller = table.closest('.hl-box')!
      scroller.scrollLeft = scroller.scrollWidth
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      const left = scroller.getBoundingClientRect().left + scroller.clientLeft
      return {
        scrolled: scroller.scrollLeft,
        off: [...table.querySelectorAll<HTMLElement>('[data-home-line-cell="line"], [data-home-line-column="line"]')].map(
          (cell) => Math.abs(cell.getBoundingClientRect().left - left),
        ),
      }
    })
    expect(after.scrolled, 'the box did not scroll').toBeGreaterThan(0)
    expect(after.off.length).toBe(5)
    for (const off of after.off) expect(off, 'a Line cell left the box’s left edge').toBeLessThanOrEqual(1)
    expect(await noSidewaysScroll()).toBe(true)
  }, 180_000)

  it('5. at 1440 and 390, in English and in Chinese, cuts no cell and breaks no word', async () => {
    for (const width of [1440, 390]) {
      for (const language of ['en', 'zh'] as const) {
        await openHome(width, language)
        expect(await theCutsAndBreaks(), `at ${String(width)} in ${language}`).toEqual([])
      }
    }
  }, 300_000)

  it('6. says a failed people read in the card, on its own line, and still draws the two groups', async () => {
    await app.page.route(ANY_DOOR, async (route) => route.fulfill({ response: await route.fetch(), status: 500, json: { error: 'A made-up failure.' } }))
    try {
      await openHome(1440, 'en', '[data-progress-group="lines"] .px-error')
      const lines = theCard().locator('[data-progress-group="lines"]')
      expect(await lines.locator('.px-error').innerText()).toContain(sayInEnglish('progressCard.lines.failed'))
      expect(await lines.locator('[data-home-lines]').count()).toBe(0)
      await theCard().locator('[data-progress-count="todo"]').waitFor({ state: 'visible', timeout: 30_000 })
      expect(await theCard().locator('[data-progress-group="points"]').count()).toBe(1)
      expect(await theCard().locator('[data-progress-group="briefs"]').count()).toBe(1)
      expect(await theCard().locator('[data-progress-group="points"] .px-error').count()).toBe(0)
    } finally {
      await app.page.unroute(ANY_DOOR)
    }
  }, 180_000)
})
