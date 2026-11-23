// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281): the departments page's rows are asked for by `dp-tree-row`, the class only
// its own style sheet defines.
// Before, it asked for the rows by `dp-row`, which the record page's style sheet also names in a rule that is not
// scoped to that page. A browser keeps a page's style in the head after the page is left, so that rule changed the
// tree's rows in any tab where a record page had been drawn.
/**
 * THE DEPARTMENTS PAGE DRAWS WHAT THE DOORS ANSWER: the tree, one department, and the form after a press. Wave 13s,
 * departments step 1b.
 *
 * What is proved, in a browser against a test office of its own, at 1440 unless a case says otherwise:
 *   1. with no department filed the page says so in the words of departments.none, draws no project row and holds no
 *      form; the press departments.add opens the form, and Cancel closes it again;
 *   2. three departments filed one under another are drawn nested, each row with its name and without the level word
 *      the door gives it, which is left to the department's own page;
 *   3. a department named in Chinese only is said to have no English name on the English page and never borrows the
 *      Chinese one, while the Chinese page draws the Chinese name;
 *   4. a top department's row names its supervisor as the one in charge and, with no group head above it, names the
 *      supervisor's owner as its leader by the name the registry gives, in the normal weight; a department with no
 *      supervisor says none stored, and one whose supervisor's owner nobody recorded says so in its own words;
 *   5. one department's page draws its codes, its parent and the department under it by name, and its history with
 *      the person's words a secretary wrote on; a merged department's page names the department it merged into;
 *   6. one department's page opens as a reading with no form; Change it opens the form, and Save writes what was typed
 *      and keeps the decisions the department rests on; a filing refused for a code another department holds draws the
 *      refusal, naming that department, and files nothing;
 *   7. the project row sits on top, holding the top departments, with the project's title, the owner's name as the one
 *      in charge, no state, and the counts of departments and teams the door gives;
 *   8. each group head is drawn in its words: an agreed head by its leader's name and from its lines, lines that
 *      disagree with each leader, and no line with a leader; a resting line says resting, in the normal weight, and
 *      none stored;
 *   9. a line under an agreed head does not name its leader where its leader is that head, and names it where it is
 *      not, as every line under a group whose lines disagree does, in the normal weight;
 *  10. every row is a list item, nested as the door nests the departments, under the project row;
 *  11. at 1440, 990, 660 and 390, in light and dark, measured from the drawn elements: at 1440 and 990 every in-charge
 *      cell starts at one left edge and so does every state cell; at 1440 what it does is on the row's line and at 990
 *      below it; at 660 and 390 no column heading is drawn and the in-charge words lead their line; at no width is the
 *      page wider than the window;
 *  12. at 1440, 990, 660 and 390, what a department does is one line in its row, cut by the page alone, so the element
 *      still holds the whole text; a department's codes follow its name, and one with no code shows nothing there; at
 *      660 its state sits on the name's line and the in-charge line comes after;
 *  13. past one page of top departments the page says which it shows, and Next shows the rest.
 *
 * It takes no pictures (chapter 6). Every word is read from its key with t(), and every count from the door. Every name,
 * code, decision, agent and warrant here is made up. Cases 4 and 8 take the owner of a supervisor away by a write into
 * this test office's own database, as case 7 of tests/departments-are-records-of-their-own.test.ts does.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { DEPARTMENT_KIND, type DepartmentNode, type OneDepartment, type TheDepartments } from '../src/shared/departments.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR } from '../src/shared/roles.ts'
import { stateWord } from '../src/shared/words.ts'
import { theLevelShown } from '../src/web/lib/department-words.ts'
import { freshDb, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'

const made = mkdtempSync(join(tmpdir(), 'mole-office-departments-page-'))
const home = join(made, 'home')

type TheGuard = typeof import('../src/server/lib/grant/departments.ts')

let db: TestDb
let app: LiveApp
let page: Page
let guard: TheGuard
const errors: string[] = []

const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The made-up decision of the person's that case 5's department rests on, and the words a secretary quotes from it. */
const THE_PERSONS_WORDS = 'The made-up departments of this page may be changed by a secretary on these words.'
const THE_QUOTE = THE_PERSONS_WORDS.slice(0, 40)
let decision = ''

/** A department of case 5, read again in case 6. */
const OPENED = {
  codes: ['made-up-opened-a', 'made-up-opened-b'],
  nameEn: 'Made-up opened department',
  doesEn: 'It does made-up work.',
  state: 'running',
}
let opened = ''
let openedParent = ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const raw = await reply.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }
  return { status: reply.status, body: parsed, raw }
}

/** The person files a department by their own press, and the door answers 201. */
async function filed(department: Record<string, unknown>): Promise<string> {
  const written = await ask('POST', '/api/departments', PERSON, department)
  expect(written.status, written.raw).toBe(201)
  return String(written.body.department.id)
}

/** A made-up agent the person starts, with the key it is given. */
async function started(handle: string, name: string, role: string): Promise<{ id: string; headers: Record<string, string> }> {
  const made = await ask('POST', '/api/agents/started', PERSON, { handle, name, role })
  expect(made.status, made.raw).toBe(201)
  return {
    id: String(made.body.agent.id),
    headers: {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
      'x-mole-office-key': String(made.body.whatToGiveIt?.key ?? ''),
    },
  }
}

/** The first page of top departments, as the tree door reads it with its own limit. */
async function theTree(): Promise<TheDepartments> {
  const read = await ask('GET', '/api/departments', PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body
}

/** One department as the one-department door reads it. */
async function one(id: string): Promise<OneDepartment> {
  const read = await ask('GET', `/api/departments/${id}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body
}

/** How long a read of the page waits for what the page draws after its own reads answer. */
const POLL = { timeout: 30_000 }

/** The departments page, or one department's page, as a document of its own, so it asks the office again. */
async function openThePage(id?: string, language: 'en' | 'zh' = 'en'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}#/departments${id === undefined ? '' : `/${id}`}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** One department's row in the tree. */
function theRow(id: string): Locator {
  return page.locator(`li.dp-node[data-department="${id}"] > .dp-tree-row`)
}

/** The project row, on top of the tree. */
function theProjectRow(): Locator {
  return page.locator('li.dp-node.dp-project > .dp-tree-row')
}

/** One cell of a row: its name, who is in charge, its state, or what it does. */
function theCell(row: Locator, which: 'name' | 'charge' | 'state' | 'does'): Locator {
  return row.locator(`:scope > .dp-${which}`)
}

/** Who is in charge, as a row's in-charge cell names it, without its leader. */
function inCharge(id: string): Locator {
  return theCell(theRow(id), 'charge').locator('.dp-who')
}

/** The leader a row's in-charge cell names, where it names one. */
function theLeaderOn(id: string): Locator {
  return theCell(theRow(id), 'charge').locator('.dp-leader')
}

/** Whether a drawn element, or anything inside it or around it, is drawn quiet. */
async function isQuiet(drawn: Locator): Promise<boolean> {
  return drawn.evaluate((element) => element.closest('.dp-quiet') !== null || element.querySelector('.dp-quiet') !== null)
}

/** What the list door answers beside the departments: the project part. */
interface TheProjectPart {
  title: string
  owner: { kind: string; id: string }
  departments: number
  teams: number
}

/** The project part of the tree door's answer, which every page of it gives. */
async function theProject(): Promise<TheProjectPart> {
  const project = ((await theTree()) as unknown as { project?: TheProjectPart }).project
  if (project === undefined) throw new Error('GET /api/departments answers no project part')
  return project
}

/** One department's head, as the door reads it. */
async function theHeadOf(id: string): Promise<{ state: string } | null | undefined> {
  return ((await one(id)).department as unknown as { head?: { state: string } | null }).head
}

/** A made-up agent's owner, moved through the owner door by the person. */
async function ownedBy(agent: string, owner: string): Promise<void> {
  const moved = await ask('POST', `/api/agents/${agent}/owner`, PERSON, { owner: { kind: 'agent', id: owner }, because: 'A made-up leader for a made-up line.' })
  expect(moved.status, moved.raw).toBe(200)
}

/**
 * The name each participant was last given by `named`, so a later case waits for the name drawn now. Case 8 names the
 * person who started its supervisors, who may be the office owner case 7 named.
 */
const NAMES_GIVEN = new Map<string, string>()

/** A participant's name, written by the person so the page has one to draw. */
async function named(ref: { kind: string; id: string }, name: string): Promise<void> {
  const written = await ask('PATCH', `/api/participants/${ref.kind}/${ref.id}`, PERSON, { name })
  expect(written.status >= 200 && written.status < 300, written.raw).toBe(true)
  NAMES_GIVEN.set([ref.kind, ref.id].join(':'), name)
}

/** The state word a department's state is drawn with. */
const theStateWord = (state: 'running' | 'resting' | 'merged'): string => stateWord(state, 'normal', DEPARTMENT_KIND).text

/** The facts the first list of facts in `scope` draws, each term with what is drawn beside it. */
async function theFacts(scope: Locator): Promise<Record<string, string>> {
  return scope
    .locator('dl.dp-facts')
    .first()
    .evaluate((list) => {
      const facts: Record<string, string> = {}
      for (const term of Array.from(list.querySelectorAll(':scope > dt'))) {
        const said = term.nextElementSibling
        facts[(term as HTMLElement).innerText.trim()] = said instanceof HTMLElement ? said.innerText.trim() : ''
      }
      return facts
    })
}

/** A button on the page, by the words it carries. */
function thePress(scope: Locator | Page, words: string): Locator {
  return scope.getByRole('button', { name: words, exact: true })
}

/** The form, by the name its group carries. */
function theForm(words: string): Locator {
  return page.getByRole('group', { name: words, exact: true })
}

beforeAll(async () => {
  mkdirSync(home)
  process.env.HOME = home
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  setWordLanguage('en')
  db = await freshDb()
  guard = await import('../src/server/lib/grant/departments.ts')
  app = await liveApp({ name: 'departments-page', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(db.file), 'keys.json')))
  page = app.page
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => errors.push(error.message))
  // THE PERSON'S KEY ON EVERY REQUEST THE PAGE MAKES, so a press on the page is the person's own.
  await page.setExtraHTTPHeaders(thePersonsKeyHeader(join(dirname(db.file), 'keys.json')))
  const made = await ask('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'A made-up decision the departments of this page rest on',
    data: { option_taken: THE_PERSONS_WORDS, because: 'A made-up reason.', decided_by: THE_OWNER, governs: [{ wholeProject: true }], replaces: [] },
  })
  expect(made.status, made.raw).toBe(201)
  decision = String(made.body.record.id)
}, 300_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.stop()
  db?.close()
  rmSync(made, { recursive: true, force: true })
}, 120_000)

it('1: with none filed the page says so, draws no project row and holds no form; Add opens the form and Cancel closes it', async () => {
  expect((await theTree()).departments).toBeNull()
  await openThePage()
  await expect.poll(async () => page.locator('.px-empty').innerText(), POLL).toContain(t('departments.none'))
  expect(await page.locator('li.dp-project').count()).toBe(0)
  expect(await theForm(t('departments.add')).count()).toBe(0)

  await thePress(page, t('departments.add')).click()
  await theForm(t('departments.add')).waitFor()
  expect(await theForm(t('departments.add')).getByLabel(t('record.section.nameEn')).count()).toBe(1)
  await thePress(theForm(t('departments.add')), t('departments.form.cancel')).click()
  await theForm(t('departments.add')).waitFor({ state: 'detached' })
  expect(await thePress(page, t('departments.add')).count()).toBe(1)
  expect(errors).toEqual([])
}, 180_000)

it('2: three levels are drawn nested, each with its name and without the level word the door gives it', async () => {
  const names = ['Made-up top of three levels', 'Made-up middle of three levels', 'Made-up leaf of three levels']
  const top = await filed({ nameEn: names[0], state: 'running' })
  const middle = await filed({ nameEn: names[1], parent: top, state: 'running' })
  const leaf = await filed({ nameEn: names[2], parent: middle, state: 'running' })

  const topRead = (await theTree()).departments?.find((node) => node.id === top)
  const middleRead = topRead?.subDepartments.find((node) => node.id === middle)
  const leafRead = middleRead?.subDepartments.find((node) => node.id === leaf)
  expect([topRead?.level, middleRead?.level, leafRead?.level]).toEqual(['department', 'department', 'team'])

  await openThePage()
  const nested = page.locator(
    `li.dp-node[data-department="${top}"] > ul.dp-tree > li.dp-node[data-department="${middle}"] > ul.dp-tree > li.dp-node[data-department="${leaf}"]`,
  )
  await nested.waitFor()
  expect(await nested.count()).toBe(1)
  for (const [at, read] of [topRead, middleRead, leafRead].entries()) {
    if (read === undefined) throw new Error('the tree door holds each department this case filed')
    expect(await theCell(theRow(read.id), 'name').innerText()).toContain(names[at])
    expect(await theRow(read.id).innerText()).not.toContain(theLevelShown(read.level, read.teams))
  }
  expect(errors).toEqual([])
}, 180_000)

it('3: a department named in Chinese only has no English name on the English page, and its Chinese name on the Chinese page', async () => {
  const chinese = '虚构的只有中文名的部门'
  const zhOnly = await filed({ nameZh: chinese, state: 'running' })

  await openThePage()
  const english = await theRow(zhOnly).locator('.dp-name').innerText()
  expect(english).toContain(t('department.name.notRecorded'))
  expect(english).not.toContain(chinese)

  setWordLanguage('zh')
  try {
    await openThePage(undefined, 'zh')
    const said = await theRow(zhOnly).locator('.dp-name').innerText()
    expect(said).toContain(chinese)
    expect(said).not.toContain(t('department.name.notRecorded'))
  } finally {
    setWordLanguage('en')
  }
  expect(errors).toEqual([])
}, 180_000)

it('4: a top department names its supervisor and its leader, and says so where there is no supervisor or no owner recorded', async () => {
  const supervisor = await started('made-up-led-supervisor', 'Made-up Supervisor Name', THE_SUPERVISOR)
  const led = await filed({ nameEn: 'Made-up led department', supervisor: { kind: 'agent', id: supervisor.id }, state: 'running' })
  const leader = (await one(led)).department.leader
  if (leader.state !== 'recorded') throw new Error(`the door reads a leader for a supervisor the person started, and said ${leader.state}`)
  const named = await ask('PATCH', `/api/participants/${leader.leader.kind}/${leader.leader.id}`, PERSON, { name: 'Made-up Person Name' })
  expect(named.status >= 200 && named.status < 300, named.raw).toBe(true)

  const plain = await filed({ nameEn: 'Made-up department with no supervisor', state: 'running' })
  const ownerless = await started('made-up-ownerless-supervisor', 'Made-up Ownerless Supervisor', THE_SUPERVISOR)
  const unled = await filed({ nameEn: 'Made-up department whose supervisor has no owner', supervisor: { kind: 'agent', id: ownerless.id }, state: 'running' })
  db.client.sqlite.prepare('UPDATE agents SET owner_id = NULL, owner_kind = NULL WHERE id = ?').run(ownerless.id)
  await expect.poll(async () => (await one(unled)).department.leader.state, POLL).toBe('owner-not-recorded')

  // A TOP DEPARTMENT HAS NO GROUP HEAD ABOVE IT, so by L-b its row names its leader.
  await openThePage()
  await expect.poll(async () => inCharge(led).innerText(), POLL).toContain('Made-up Supervisor Name')
  await expect.poll(async () => theLeaderOn(led).innerText(), POLL).toContain('Made-up Person Name')
  expect(await isQuiet(theLeaderOn(led))).toBe(false)
  expect(await inCharge(plain).innerText()).toBe(t('departments.tree.noneStored'))
  expect(await theLeaderOn(plain).count()).toBe(0)
  await expect.poll(async () => inCharge(unled).innerText(), POLL).toContain('Made-up Ownerless Supervisor')
  expect(await theLeaderOn(unled).innerText()).toContain(t('departments.leader.notRecorded'))
  expect(await isQuiet(theLeaderOn(unled))).toBe(false)
  expect(errors).toEqual([])
}, 180_000)

it('5: one department draws its codes, its parent, the department under it and its history; a merged one names where it went', async () => {
  openedParent = await filed({ nameEn: 'Made-up parent of the opened department', state: 'running' })
  opened = await filed({ ...OPENED, parent: openedParent, restsOn: [decision] })
  const under = await filed({ nameEn: 'Made-up department under the opened one', parent: opened, state: 'running' })
  const secretary = await started('made-up-page-secretary', 'Made-up Page Secretary', THE_SECRETARY)
  const changed = { ...OPENED, doesEn: 'It does made-up work, changed by a made-up secretary.', parent: openedParent, restsOn: [decision] }
  const warrant = { saidBy: THE_PERSON, words: THE_QUOTE, where: 'terminal', when: '2026-10-12 21:06', for: [guard.theBindingOf(opened, changed)] }
  const written = await ask('PUT', `/api/departments/${opened}`, secretary.headers, { ...changed, warrant })
  expect(written.status, written.raw).toBe(200)
  const history = (await one(opened)).history
  expect(history.revisions[0]?.onTheWordsOf?.words).toBe(THE_QUOTE)

  await openThePage(opened)
  const sheet = page.locator(`.dp-one[data-department="${opened}"]`)
  await sheet.waitFor()
  expect(await sheet.locator('code.dp-code').allInnerTexts()).toEqual(OPENED.codes)
  await expect.poll(async () => (await theFacts(sheet))[t('record.section.parent')], POLL).toContain('Made-up parent of the opened department')
  expect(Object.keys(await theFacts(sheet))).not.toContain(t('record.section.mergedInto'))
  expect(await sheet.locator(`li.dp-node[data-department="${under}"] .dp-name`).innerText()).toContain('Made-up department under the opened one')
  expect(await sheet.locator('ol.dp-history > li').count()).toBe(history.revisions.length)
  expect(await sheet.locator('blockquote.dp-words').first().innerText()).toContain(t('departments.history.words', { words: THE_QUOTE }))

  const into = await filed({ nameEn: 'Made-up department merged into', state: 'running' })
  const gone = await filed({ nameEn: 'Made-up merged department', state: 'running' })
  const merged = await ask('PUT', `/api/departments/${gone}`, PERSON, { nameEn: 'Made-up merged department', state: 'merged', mergedInto: into })
  expect(merged.status, merged.raw).toBe(200)
  await openThePage(gone)
  const mergedSheet = page.locator(`.dp-one[data-department="${gone}"]`)
  await mergedSheet.waitFor()
  await expect.poll(async () => (await theFacts(mergedSheet))[t('record.section.mergedInto')], POLL).toContain('Made-up department merged into')
  expect(errors).toEqual([])
}, 180_000)

it('6: one department opens as a reading; Change it and Save write what was typed and keep its decisions; a refused filing says why', async () => {
  if (opened === '') throw new Error('case 5 files the department this case changes')
  await openThePage(opened)
  const sheet = page.locator(`.dp-one[data-department="${opened}"]`)
  await sheet.waitFor()
  expect(await theForm(t('departments.change')).count()).toBe(0)
  expect(await sheet.getByRole('textbox').count()).toBe(0)

  await thePress(sheet, t('departments.change')).click()
  const form = theForm(t('departments.change'))
  await form.waitFor()
  const typed = 'It does made-up work, changed by the person on the page.'
  await form.getByLabel(t('record.section.doesEn')).fill(typed)
  await thePress(form, t('departments.form.save')).click()
  await form.waitFor({ state: 'detached' })
  await expect.poll(async () => (await one(opened)).department.does.en, POLL).toBe(typed)
  expect((await one(opened)).department.restsOn).toEqual([decision])

  const before = (await theTree()).total
  await openThePage()
  await thePress(page, t('departments.add')).click()
  const adding = theForm(t('departments.add'))
  await adding.waitFor()
  await adding.getByLabel(t('record.section.nameEn')).fill('Made-up department refused for its code')
  await adding.getByLabel(t('record.section.codes')).fill(OPENED.codes[0] ?? '')
  await thePress(adding, t('departments.form.save')).click()
  const refusal = adding.locator('.px-error[role="alert"]')
  await refusal.waitFor()
  expect(await refusal.innerText()).toContain(t('departments.form.refused'))
  expect(await refusal.evaluate((note) => note.textContent ?? '')).toContain(opened)
  expect((await theTree()).total).toBe(before)
  expect(errors).toEqual([])
}, 180_000)

it('7: the project row sits on top, holding the top departments, with its title, the owner, no state and the counts', async () => {
  const project = await theProject()
  await named(project.owner, 'Made-up Owner Name')
  await openThePage()
  const tree = page.locator('.dp-table > ul.dp-tree')
  await theProjectRow().waitFor()
  expect(await tree.locator(':scope > li.dp-node').count()).toBe(1)
  expect(await tree.locator(':scope > li.dp-node').first().evaluate((node) => node.classList.contains('dp-project'))).toBe(true)
  const tops = (await theTree()).departments ?? []
  expect(tops.length).toBeGreaterThan(0)
  for (const top of tops) expect(await page.locator(`li.dp-project > ul.dp-tree > li.dp-node[data-department="${top.id}"]`).count(), top.id).toBe(1)

  const row = theProjectRow()
  expect(await theCell(row, 'name').innerText()).toContain(project.title)
  expect(await theCell(row, 'name').innerText()).toContain(t('departments.tree.project'))
  await expect.poll(async () => theCell(row, 'charge').innerText(), POLL).toContain('Made-up Owner Name')
  expect(await theCell(row, 'state').innerText()).toBe(t('departments.tree.noState'))
  expect(await theCell(row, 'does').innerText()).toBe(
    t('departments.tree.counts', {
      departments: t('departments.tree.departments', { n: project.departments }),
      teams: t('departments.tree.teams', { n: project.teams }),
    }),
  )
  expect(errors).toEqual([])
}, 180_000)

/** The groups and lines cases 8 and 9 file, by a short name. */
const g: Record<string, string> = {}

it('8: each group head is drawn in its words, from its lines where agreed; a resting line says resting and none stored', async () => {
  // AN AGREED GROUP: two lines whose supervisors the person started, so the person owns both; one whose supervisor's
  // owner is taken away; one resting with no supervisor. A GROUP WHOSE LINES DISAGREE: one line owned by the person, one
  // moved to a made-up secretary. A GROUP WITH NO LEADER: one resting line with no supervisor.
  const secretary = await started('made-up-head-secretary', 'Made-up Head Secretary', THE_SECRETARY)
  const supervisors = {
    a1: await started('made-up-agreed-line-one', 'Made-up Agreed Line One', THE_SUPERVISOR),
    a2: await started('made-up-agreed-line-two', 'Made-up Agreed Line Two', THE_SUPERVISOR),
    a3: await started('made-up-agreed-line-three', 'Made-up Agreed Line Three', THE_SUPERVISOR),
    d1: await started('made-up-disagreeing-line-one', 'Made-up Disagreeing Line One', THE_SUPERVISOR),
    d2: await started('made-up-disagreeing-line-two', 'Made-up Disagreeing Line Two', THE_SUPERVISOR),
  }
  g.agreed = await filed({ nameEn: 'Made-up agreed group', state: 'running' })
  g.disagree = await filed({ nameEn: 'Made-up disagreeing group', state: 'running' })
  g.none = await filed({ nameEn: 'Made-up group with no leader', state: 'running' })
  g.a1 = await filed({ nameEn: 'Made-up agreed line one', parent: g.agreed, supervisor: { kind: 'agent', id: supervisors.a1.id }, state: 'running' })
  g.a2 = await filed({ nameEn: 'Made-up agreed line two', parent: g.agreed, supervisor: { kind: 'agent', id: supervisors.a2.id }, state: 'running' })
  g.a3 = await filed({ nameEn: 'Made-up agreed line three', parent: g.agreed, supervisor: { kind: 'agent', id: supervisors.a3.id }, state: 'running' })
  g.a4 = await filed({ nameEn: 'Made-up resting agreed line', parent: g.agreed, state: 'resting' })
  g.d1 = await filed({ nameEn: 'Made-up disagreeing line one', parent: g.disagree, supervisor: { kind: 'agent', id: supervisors.d1.id }, state: 'running' })
  g.d2 = await filed({ nameEn: 'Made-up disagreeing line two', parent: g.disagree, supervisor: { kind: 'agent', id: supervisors.d2.id }, state: 'running' })
  g.n1 = await filed({ nameEn: 'Made-up resting line with no leader', parent: g.none, state: 'resting' })
  await ownedBy(supervisors.d2.id, secretary.id)
  db.client.sqlite.prepare('UPDATE agents SET owner_id = NULL, owner_kind = NULL WHERE id = ?').run(supervisors.a3.id)

  const leader = (await one(g.a1)).department.leader
  if (leader.state !== 'recorded') throw new Error(`the door reads a leader for a supervisor the person started, and said ${leader.state}`)
  await named(leader.leader, 'Made-up Head Person Name')
  await expect.poll(async () => (await theHeadOf(g.agreed!))?.state, POLL).toBe('agreed')
  expect((await theHeadOf(g.disagree))?.state).toBe('the-lines-disagree')
  expect((await theHeadOf(g.none))?.state).toBe('no-line-has-a-leader')

  await openThePage()
  await expect.poll(async () => inCharge(g.agreed!).innerText(), POLL).toContain('Made-up Head Person Name')
  expect(await inCharge(g.agreed).innerText()).toContain(t('departments.head.fromItsLines'))
  await expect.poll(async () => inCharge(g.disagree!).innerText(), POLL).toContain('Made-up Head Secretary')
  const disagreeing = await inCharge(g.disagree).innerText()
  expect(disagreeing).toContain(t('departments.head.disagree'))
  expect(disagreeing).toContain('Made-up Head Person Name')
  expect(disagreeing).not.toContain(t('departments.head.fromItsLines'))
  expect(await inCharge(g.none).innerText()).toContain(t('departments.head.none'))

  for (const resting of [g.a4, g.n1]) {
    if (resting === undefined) throw new Error('this case files two resting lines')
    expect(await theCell(theRow(resting), 'state').innerText(), resting).toBe(theStateWord('resting'))
    expect(await isQuiet(theCell(theRow(resting), 'state')), resting).toBe(false)
    expect(await inCharge(resting).innerText(), resting).toBe(t('departments.tree.noneStored'))
  }
  expect(await isQuiet(theCell(theRow(g.a1 ?? ''), 'state'))).toBe(true)
  expect(errors).toEqual([])
}, 180_000)

it('9: a line names its leader only where it is not its group’s agreed head, in the normal weight', async () => {
  if (g.a1 === undefined) throw new Error('case 8 files the groups and lines this case reads')
  await openThePage()
  await theRow(g.a1).waitFor()
  await expect.poll(async () => inCharge(g.a1 ?? '').innerText(), POLL).toContain('Made-up Agreed Line One')
  expect(await theLeaderOn(g.a1).count()).toBe(0)
  expect(await theLeaderOn(g.a2 ?? '').count()).toBe(0)
  expect(await theLeaderOn(g.a3 ?? '').innerText()).toContain(t('departments.leader.notRecorded'))
  await expect.poll(async () => theLeaderOn(g.d1 ?? '').innerText(), POLL).toContain('Made-up Head Person Name')
  await expect.poll(async () => theLeaderOn(g.d2 ?? '').innerText(), POLL).toContain('Made-up Head Secretary')
  for (const shown of [g.a3, g.d1, g.d2]) expect(await isQuiet(theLeaderOn(shown ?? '')), shown).toBe(false)
  expect(errors).toEqual([])
}, 180_000)

it('10: every row is a list item, nested as the door nests the departments, under the project row', async () => {
  const tops = (await theTree()).departments ?? []
  await openThePage()
  await theProjectRow().waitFor()
  await theRow(tops[0]?.id ?? '').waitFor()
  const wrong = await page.evaluate((nodes: DepartmentNode[]) => {
    const found: string[] = []
    for (const row of Array.from(document.querySelectorAll('.dp-table .dp-tree-row'))) {
      const item = row.parentElement
      if (!(item instanceof HTMLLIElement) || !item.classList.contains('dp-node') || !(item.parentElement instanceof HTMLUListElement)) {
        found.push(`a row is not a list item of a list: ${row.textContent ?? ''}`)
      }
    }
    const walk = (under: DepartmentNode[], above: string): void => {
      for (const node of under) {
        const item = document.querySelector(`li.dp-node[data-department="${node.id}"]`)
        const parent = item?.parentElement?.parentElement
        if (!(parent instanceof HTMLLIElement) || !parent.matches(above)) found.push(`${node.id} is not drawn under ${above}`)
        walk(node.subDepartments, `li.dp-node[data-department="${node.id}"]`)
      }
    }
    walk(nodes, 'li.dp-node.dp-project')
    return found
  }, tops)
  expect(wrong).toEqual([])
  expect(errors).toEqual([])
}, 180_000)

it('11: at 1440, 990, 660 and 390, light and dark, the columns line up where drawn, stop below 60rem, and fit the window', async () => {
  const owner = (await theProject()).owner
  const ownersName = NAMES_GIVEN.get([owner.kind, owner.id].join(':'))
  if (ownersName === undefined) throw new Error('case 7 names the office owner before this case reads the project row')
  try {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.emulateMedia({ colorScheme: theme })
        await openThePage()
        await theProjectRow().waitFor()
        await expect.poll(async () => theCell(theProjectRow(), 'charge').innerText(), POLL).toContain(ownersName)
        const at = `${theme} at ${String(width)}`
        const drawn = await page.evaluate(() => {
          const box = (element: Element | null): DOMRect => {
            if (element === null) throw new Error('a row lacks one of its cells')
            return element.getBoundingClientRect()
          }
          const rows = Array.from(document.querySelectorAll('.dp-table .dp-tree-row'))
          return {
            rows: rows.map((row) => {
              const cell = (which: string): Element | null => row.querySelector(`:scope > .dp-${which}`)
              const label = cell('charge')?.querySelector('.dp-charge-label') ?? null
              const labelBox = box(label)
              const others = ['name', 'state', 'does'].map((which) => box(cell(which)))
              return {
                name: box(cell('name')).toJSON() as DOMRect,
                charge: box(cell('charge')).toJSON() as DOMRect,
                state: box(cell('state')).toJSON() as DOMRect,
                does: box(cell('does')).toJSON() as DOMRect,
                chargeSays: (cell('charge') as HTMLElement | null)?.innerText.trim() ?? '',
                labelShown: labelBox.width > 1 && labelBox.height > 1,
                // ANOTHER CELL ON THE LABEL'S LINE, TO ITS LEFT: then the in-charge words do not lead their line.
                beforeTheLabel: others.some((other) => other.top < labelBox.bottom - 1 && other.bottom > labelBox.top + 1 && other.left < labelBox.left - 1),
              }
            }),
            headingsShown: Array.from(document.querySelectorAll('.dp-heads')).some((heads) => {
              const at = heads.getBoundingClientRect()
              return at.width > 0 && at.height > 0 && getComputedStyle(heads).visibility !== 'hidden'
            }),
            pageWidth: document.documentElement.scrollWidth,
            windowWidth: window.innerWidth,
          }
        })
        expect(drawn.rows.length, at).toBeGreaterThan(3)
        expect(drawn.pageWidth, `${at}: the page is no wider than the window`).toBeLessThanOrEqual(drawn.windowWidth)
        const spread = (lefts: number[]): number => Math.max(...lefts) - Math.min(...lefts)
        if (width >= 990) {
          expect(spread(drawn.rows.map((row) => row.charge.left)), `${at}: every in-charge cell starts at one left edge`).toBeLessThanOrEqual(1)
          expect(spread(drawn.rows.map((row) => row.state.left)), `${at}: every state cell starts at one left edge`).toBeLessThanOrEqual(1)
          expect(drawn.headingsShown, `${at}: the column headings are drawn`).toBe(true)
        }
        if (width === 1440) {
          for (const row of drawn.rows) {
            expect(row.does.top < row.name.bottom && row.does.bottom > row.name.top, `${at}: what it does is on the row's line`).toBe(true)
            expect(row.does.left, `${at}: what it does is right of the state`).toBeGreaterThanOrEqual(row.state.right - 1)
          }
        }
        if (width === 990) {
          for (const row of drawn.rows) expect(row.does.top, `${at}: what it does is below the row's line`).toBeGreaterThanOrEqual(row.name.bottom - 1)
        }
        if (width <= 660) {
          expect(drawn.headingsShown, `${at}: no column heading is drawn`).toBe(false)
          for (const row of drawn.rows) {
            expect(row.chargeSays.startsWith(t('departments.tree.inCharge')), `${at}: ${row.chargeSays}`).toBe(true)
            expect(row.labelShown, `${at}: the in-charge words are drawn`).toBe(true)
            expect(row.beforeTheLabel, `${at}: the in-charge words lead their line`).toBe(false)
          }
        }
      }
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ colorScheme: 'light' })
  }
  expect(errors).toEqual([])
}, 300_000)

it('12: what a department does is one line in its row, cut by the page alone; its codes follow its name, and at 660 its state is on the name’s line', async () => {
  const words = Array.from({ length: 60 }, (_, at) => `made-up work ${String(at)}`).join(', ')
  const code = 'made-up-cut'
  const cut = await filed({ nameEn: 'Made-up cut row', codes: [code], doesEn: words, state: 'running' })
  const bare = await filed({ nameEn: 'Made-up row with no code', state: 'running' })
  try {
    for (const width of [1440, 990, 660, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await openThePage()
      await theRow(cut).waitFor()
      const at = `at ${String(width)}`
      expect(await theCell(theRow(cut), 'does').evaluate((cell) => cell.textContent), `${at}: the element holds the whole text`).toBe(words)
      expect((await theCell(theRow(cut), 'name').innerText()).trim().endsWith(code), `${at}: its code follows its name`).toBe(true)
      expect((await theCell(theRow(bare), 'name').innerText()).trim(), `${at}: a department with no code shows none`).toBe('Made-up row with no code')
      const drawn = await page.evaluate((id) => {
        const cellOf = (row: Element | null, which: string): HTMLElement => {
          const cell = row?.querySelector(`:scope > .dp-${which}`) ?? null
          if (!(cell instanceof HTMLElement)) throw new Error(`a row lacks its ${which} cell`)
          return cell
        }
        const row = document.querySelector(`li.dp-node[data-department="${id}"] > .dp-tree-row`)
        const does = cellOf(row, 'does')
        const box = (cell: HTMLElement): DOMRect => cell.getBoundingClientRect().toJSON() as DOMRect
        return {
          does: box(does),
          // THE PROJECT ROW'S COUNTS ARE SHORT, so their height is one line of the same cell.
          oneLine: box(cellOf(document.querySelector('li.dp-node.dp-project > .dp-tree-row'), 'does')).height,
          longerThanItsLine: does.scrollWidth > does.clientWidth + 1,
          cutWith: getComputedStyle(does).textOverflow,
          name: box(cellOf(row, 'name')),
          state: box(cellOf(row, 'state')),
          charge: box(cellOf(row, 'charge')),
          pageWidth: document.documentElement.scrollWidth,
          windowWidth: window.innerWidth,
        }
      }, cut)
      expect(drawn.longerThanItsLine, `${at}: the text is longer than its line`).toBe(true)
      expect(drawn.does.height, `${at}: what it does is one line high`).toBeLessThanOrEqual(drawn.oneLine + 1)
      expect(drawn.cutWith, `${at}: the line is cut with an ellipsis`).toBe('ellipsis')
      expect(drawn.pageWidth, `${at}: the page is no wider than the window`).toBeLessThanOrEqual(drawn.windowWidth)
      if (width === 660) {
        expect(drawn.state.top < drawn.name.bottom && drawn.state.bottom > drawn.name.top, `${at}: the state is on the name's line`).toBe(true)
        expect(drawn.charge.top, `${at}: the in-charge line comes after the name's line`).toBeGreaterThanOrEqual(drawn.name.bottom - 1)
      }
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  expect(errors).toEqual([])
}, 180_000)

it('13: past one page of top departments the page says which it shows, and Next shows the rest', async () => {
  const read = await theTree()
  for (let n = read.total; n < read.limit + 2; n += 1) await filed({ nameEn: `Made-up paged department ${String(n)}`, state: 'running' })
  const total = (await theTree()).total
  expect(total).toBe(read.limit + 2)

  await openThePage()
  const shown = page.locator('.dp > .dp-presses .dp-quiet')
  await expect.poll(async () => shown.innerText(), POLL).toBe(t('departments.page.shown', { from: 1, to: read.limit, total }))
  expect(await page.locator('.dp li.dp-project > ul.dp-tree > li.dp-node').count()).toBe(read.limit)
  await thePress(page.locator('.dp > .dp-presses').last(), t('departments.page.next')).click()
  await expect.poll(async () => shown.innerText(), POLL).toBe(t('departments.page.shown', { from: read.limit + 1, to: total, total }))
  expect(await page.locator('.dp li.dp-project > ul.dp-tree > li.dp-node').count()).toBe(total - read.limit)
  expect(errors).toEqual([])
}, 300_000)
