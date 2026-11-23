// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old display fixture supplies historical, invented base and worktree metadata. Its runs are now explicitly inventoried before finishing, preserving those exact UI assertions without treating that metadata as a new seal. */
import { aMadeUpModuleForPackage, httpPackageFixture } from './module-package-fixture.ts'
import Database from 'better-sqlite3'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
/** Eligibility fixture update: old checked runs omitted their checkout; worker fixtures now record a resolvable workingDirectory and a registered work area. */
/**
 * THE CHECK IS ON THE RUN'S PAGE, IN SENTENCES, WITHOUT SWITCHING TO INSPECT.
 *
 * Criterion C27 of design/rules/ACCEPTANCE.md and problem `r0vUx5VGffP2`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The API had answered everything about a check since 7 September: which inspector the office
 * asked, what one assembly of the prompt measured, the verdict, the group a refusal opened, the
 * worktree it read. A person opening the run saw none of it. Every one of those facts is stored in
 * an OBJECT field, and `drawableAsWords` in src/shared/sections.ts draws only scalars, words from a
 * list, and arrays of scalars — so the record page put all five behind the Inspect switch. That
 * rule is right, and the fix is a panel rather than a change to the rule.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS MEASURED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what a person can read on a screen with Inspect off, and the fault was fields
 * nothing drew. Reading the record back would have passed on the day the owner opened the page and saw
 * nothing. So this starts a stack, draws the run's page, and reads what was drawn — at 1440 and at
 * 390, in light and in dark, because a panel that overflows at 390 is not readable either.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control
 * ---------------------------------------------------------------------------------------
 *
 *   - Make `TheCheckOnARun` return null always, and every case here goes red while the API tests
 *     stay green — which is the whole shape of the defect.
 *   - Take the `<TheCheckOnARun>` line out of RecordPage.tsx, and the same.
 *   - Drop the `WhatItWouldRead` part, and the case about the base and the files goes red.
 *   - Drop the group link out of `TheVerdict`, and the group case goes red.
 *   - THE RENAME, G1 of design/regulations/ACCEPTANCE.md: "code of law" became "office regulations"
 *     in the words a reader sees. Control green on 11 September 2026; reverted the assertion at
 *     "says who refused it, on what rule, and what is missing" to the old words alone
 *     ('chapter 5 of the code of law') while the product said the new ones, and it went red on
 *     that one case, showing the rendered sentence now said "chapter 5 of the office regulations".
 *     Restored, green again.
 *   - THE BASE IN DEVELOPER MODE ONLY, by item 2 of a decision. Control green on 30 September
 *     2026; drew the base line and the base's sentence in normal mode again in `WhatItWouldRead`, and
 *     the case about the files and the base went red on '7d7845b9' in normal mode. Restored, green.
 *
 * AS DECIDED IN NOVEMBER 2026 (explanations off the pages): a standing whose sentence is one of the fixed ones is drawn
 * as its word alone, the press that closes a run has no sentence above it, and a refusal with no group draws the short
 * state "No group opened". The cases that read those sentences now read that the sentence is not drawn, or the state.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { RUN_STANDING } from '../src/shared/releasing.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { createI18n } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

let app: LiveApp
let page: Page

/** The three runs this draws: one being checked, one refused, one released and reporting. */
let beingChecked = ''
let refused = ''
let reporting = ''
const confirmationPictures: { name: string; id: string }[] = []
let wordChecked = ''
let wordRefused = ''
let wordReleased = ''
let packagedTask = ''
let summaryReport = ''
const wordContent = new Set<string>()
const wordShots = process.env['W13K_CX_RP_SHOTS']

const asPerson: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
/**
 * EACH BUILDER WITH ITS OWN KEY, the one the office answered when the builder was registered. A run's own agent ends
 * the run only with a key, even while the key window is open, so each builder finishes its runs with it.
 */
const keys = new Map<string, string>()
function asItself(handle: string): Record<string, string> {
  const key = keys.get(handle)
  if (key === undefined) throw new Error(`this test kept no key for ${handle}`)
  return { ...asAgent(handle), 'x-mole-office-key': key }
}

/**
 * THE INSPECTOR AS THE CHECK TOOL SPEAKS FOR IT: its name, and the office's own key, which the tool sends with every
 * assembly and every verdict. The door that takes a verdict refuses one that a listener carried with no key
 * (acceptance finding 79), and since keys wave piece 7 the assembly door does too. The key is read from the file this
 * test's office made beside its database, and is never printed or asserted on.
 */
function asTheInspector(): Record<string, string> {
  const held = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office?: unknown }
  if (typeof held.office !== 'string') throw new Error('this test office made no key of its own beside its database')
  return { ...asAgent('inspector-one'), 'x-mole-office-key': held.office }
}

async function post(path: string, body: unknown, headers = asPerson): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function patch(path: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${app.api}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`PATCH ${path} answered ${String(res.status)}: ${await res.text()}`)
}

/** A run of one worker that has said its work is finished, which is what starts a check. */
async function aRun(handle: string, title: string, extra?: Record<string, unknown>): Promise<string> {
  const made = (await post(
    '/api/records',
    { kind: 'session', title, data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd(), doing: 'building it', ...(extra === undefined ? {} : { extra }) } },
    asAgent(handle),
  ))['record'] as { id: string }
  const historical = new Database(join(app.dir, 'panelx.db'))
  try { historical.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id) } finally { historical.close() }
  await patch(`/api/records/${made.id}`, { dataPatch: { state: 'finished' } }, asItself(handle))
  return made.id
}

/** A small run fixture with no checkout path, for the four normal-mode word checks below. */
async function aLanguageRun(handle: string, title: string): Promise<string> {
  const made = (await post(
    '/api/records',
    {
      kind: 'session',
      title,
      data: {
        state: 'running',
        servingAgent: handle,
        workingDirectory: process.cwd(),
        doing: 'Fixture run for the record page word checks.',
        extra: {
          runId: 'cx-never-run-id',
          path: '/cx-never-path',
          branch: 'cx-never-branch',
          port: 'cx-never-port',
          database: 'cx-never-database',
          raw_field: 'cx-never-raw-field',
          door: 'cx-never-door',
          setting: 'cx-never-setting',
        },
      },
    },
    asAgent(handle),
  ))['record'] as { id: string }
  const historical = new Database(join(app.dir, 'panelx.db'))
  try { historical.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id) } finally { historical.close() }
  await patch(`/api/records/${made.id}`, { dataPatch: { state: 'finished' } }, asItself(handle))
  return made.id
}

async function open(where: string, theme: 'light' | 'dark', width: number, language = 'en', mode: 'normal' | 'inspect' = 'normal'): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=${language}&mode=${mode}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Everything one pass over a drawn run page measured. */
interface Seen {
  /** The whole text of the check panel, or the empty string because no panel was drawn. */
  text: string
  /** The heading of every part of the panel, in the order they are drawn. */
  parts: string[]
  /** The standing word drawn large, or null. */
  word: string | null
  /** Every link inside the panel, by the address it goes to. */
  links: string[]
  /** How far the document scrolls sideways past the window. Anything but 0 is an overflow. */
  overflow: number
  /** Whether anything on the page prints raw JSON, which is what this panel exists to replace. */
  json: boolean
}

async function readThePanel(): Promise<Seen> {
  return (await page.evaluate(() => {
    const panel = document.querySelector('.chk')
    const text = panel === null ? '' : (panel.textContent ?? '')
    return {
      text,
      parts: [...document.querySelectorAll('.chk-h')].map((one) => (one.textContent ?? '').trim()),
      word: document.querySelector('.chk-word')?.textContent?.trim() ?? null,
      links: [...document.querySelectorAll('.chk a')].map((one) => one.getAttribute('href') ?? ''),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      json: text.includes('{"') || text.includes('"kind":'),
    }
  })) as Seen
}

/** Visible text in the three panels this round owns, without server-written sentences. */
async function wordsInOwnedPanels(): Promise<string[]> {
  return page.evaluate(() => {
    const result: string[] = []
    const targets = document.querySelectorAll('.chk, .px-panel:has(.tpp-facts), .rd-report')
    for (const target of targets) {
      const walk = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
      while (walk.nextNode()) {
        const node = walk.currentNode as Text
        if (node.parentElement?.closest('style,script,time,.px-sr,.chk-server,.tpp-server,.sb-server,.sb-regions')) continue
        let hidden = false
        for (let up = node.parentElement; up && up !== target.parentElement; up = up.parentElement) {
          if (up.matches('details:not([open])') && !up.querySelector(':scope > summary')?.contains(node)) hidden = true
        }
        if (hidden) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        if (range.getBoundingClientRect().width > 0 && node.textContent?.trim()) result.push(node.textContent.trim())
      }
    }
    return result
  })
}

/** Letters outside the test language belong to content somebody supplied, or a word left by hand. */
function wordsLeftByHand(words: string[]): string[] {
  return words.filter((word) => {
    let rest = word
    for (const one of [...wordContent].sort((a, b) => b.length - a.length)) rest = rest.split(one).join('')
    let depth = 0
    let outside = ''
    for (const char of rest) {
      if (char === '⟦') depth++
      else if (char === '⟧') depth--
      else if (depth === 0) outside += char
    }
    return /[\p{L}]/u.test(outside)
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'check-on-run', viewport: { width: 1440, height: 900 } })
  page = app.page

  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await post('/api/agents/started', { handle: 'inspector-one', name: 'Inspector One', runtime: 'claude-code', role: 'inspector' })
  for (const handle of ['builder-p', 'builder-q', 'builder-r']) {
    const started = await post(
      '/api/agents/started',
      {
        handle,
        runtime: 'claude-code',
        name: `Builder ${handle.slice(-1).toUpperCase()}`,
        role: 'worker',
        chapters: ['5:full'],
        workArea: ['src/server/lib'],
      },
      asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    )
    keys.set(handle, (started['whatToGiveIt'] as { key: string }).key)
  }

  beingChecked = await aRun('builder-p', 'Builder P, the run being checked')
  // WHAT ONE ASSEMBLY MEASURED, so the panel has a base, a file list and a chapter to draw.
  await post(
    `/api/checks/${beingChecked}/assembled`,
    {
      changes: [
        { path: 'src/server/lib/inspection.ts', changes: '@@ one line @@' },
        { path: 'design/rules/ACCEPTANCE.md', changes: '@@ another @@' },
      ],
      base: { ref: '7d7845b9', how: 'fork point', says: 'The fork point against main.' },
      read: {
        worktree: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-check-of-this-run`,
        tip: '83fababc40337490f1fd53fb26cd60a59080a261',
        ofItsOwn: true,
        says: 'This check read a detached worktree of its own.',
      },
    },
    asTheInspector(),
  )

  refused = await aRun('builder-q', 'Builder Q, the refused run')
  await post(`/api/checks/${refused}/assembled`, { changes: [] }, asTheInspector())
  await post(
    `/api/checks/${refused}`,
    {
      verdict: 'refused',
      check: 'Read chapter 5 and the changes in the work area.',
      missing: ['The test for criterion 2 would pass with the feature deleted.'],
      says: { chapter: 5 },
      chaptersRead: ['5:full'],
    },
    asTheInspector(),
  )

  reporting = await aRun('builder-r', 'Builder R, the released run')
  await post(`/api/checks/${reporting}/assembled`, { changes: [] }, asTheInspector())
  await post(
    `/api/checks/${reporting}`,
    { verdict: 'released', check: 'Read chapter 5 and the changes.', chaptersRead: ['5:full'] },
    asTheInspector(),
  )

  wordContent.add(THE_PERSON)
  wordContent.add(THE_TEST_OFFICES_OWNER.name)

  // THE SAME THREE STANDINGS WITH SMALLER FIXTURES, so the four word checks scan useful page text
  // without a displayed checkout path or a checked-tree address.
  for (const handle of ['builder-cx-checked', 'builder-cx-refused', 'builder-cx-released']) {
    const started = await post(
      '/api/agents/started',
      { handle, runtime: 'claude-code', name: `Fixture ${handle.slice(-4)}`, role: 'worker', chapters: ['5:full'], workArea: ['fixture'] },
      asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    )
    keys.set(handle, (started['whatToGiveIt'] as { key: string }).key)
  }
  wordChecked = await aLanguageRun('builder-cx-checked', 'Fixture run being checked')
  wordContent.add('Fixture run being checked')
  await post(`/api/checks/${wordChecked}/assembled`, { changes: [] }, asTheInspector())

  wordRefused = await aLanguageRun('builder-cx-refused', 'Fixture refused run')
  wordContent.add('Fixture refused run')
  const missingForWordTest = 'Fixture check finding for the word test.'
  wordContent.add(missingForWordTest)
  wordContent.add('Fixture check for the word test.')
  await post(`/api/checks/${wordRefused}/assembled`, { changes: [] }, asTheInspector())
  await post(
    `/api/checks/${wordRefused}`,
    { verdict: 'refused', check: 'Fixture check for the word test.', missing: [missingForWordTest], says: { chapter: 5 }, chaptersRead: ['5:full'] },
    asTheInspector(),
  )

  wordReleased = await aLanguageRun('builder-cx-released', 'Fixture released run')
  wordContent.add('Fixture released run')
  await post(`/api/checks/${wordReleased}/assembled`, { changes: [] }, asTheInspector())
  await post(
    `/api/checks/${wordReleased}`,
    {
      verdict: 'released',
      check: 'Fixture check for the word test.',
      chaptersRead: ['5:full'],
      // C27's evidence is carried by the verdict. In normal mode no line of the panel may show it
      // so check 3 below scans the whole panel with no exception.
      read: {
        worktree: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-check-of-this-run`,
        tip: '83fababc40337490f1fd53fb26cd60a59080a261',
        ofItsOwn: true,
        says: 'Synthetic: a check of its own detached tree.',
      },
    },
    asTheInspector(),
  )
  wordContent.add(`${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-check-of-this-run`)
  wordContent.add('83fababc40337490f1fd53fb26cd60a59080a261')

  const taskTitle = 'Fixture packaged task for record page words'
  const taskOutside = 'Fixture build the shelf from the drawing.'
  const taskAcceptance = 'Fixture the shelf holds the seed trays.'
  wordContent.add(taskTitle)
  wordContent.add(taskOutside)
  wordContent.add(taskAcceptance)
  wordContent.add('Fixture brief')
  wordContent.add('F16')
  wordContent.add('fixture-commit')
  const task = (await post('/api/records', {
    kind: 'task',
    title: taskTitle,
    data: { state: 'todo', whose_move: 'either' },
  }))['record'] as { id: string }
  packagedTask = task.id
  await post(`/api/delegation/${packagedTask}/package`, {
    moduleIds: [await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))],
    forTheOutside: taskOutside,
    suits: 'desk_work',
    acceptance: taskAcceptance,
    acceptanceSource: { file: 'Fixture brief', criterion: 'F16', commit: 'fixture-commit' },
  })

  const reportTitle = 'Fixture summary report for record page words'
  const reportFor = 'Fixture record page checks'
  const reportHeading = 'Fixture summary heading'
  const reportText = 'Fixture report summary text stays as written.'
  const reportSecond = 'Fixture second summary paragraph stays as written.'
  for (const text of [reportTitle, reportFor, reportHeading, reportText, reportSecond]) wordContent.add(text)
  const report = (await post('/api/records', {
    kind: 'report',
    title: reportTitle,
    data: {
      for: reportFor,
      date: '2026-09-28',
      blocks: [
        { id: 'b-1', type: 'text', heading: reportHeading, text: reportText },
        { id: 'b-2', type: 'text', text: reportSecond },
      ],
    },
  }))['record'] as { id: string }
  summaryReport = report.id
  if (wordShots !== undefined) {
    mkdirSync(wordShots, { recursive: true })
    await post('/api/agents/started', { handle: 'confirm-asker', name: 'Confirmation asker', role: 'supervisor' })
    const historical = new Database(join(app.dir, 'panelx.db'))
    try {
      const idOf = (handle: string) => (historical.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
      const ref = (handle: string) => ({ kind: 'agent', id: idOf(handle) })
      const put = (run: string, data: Record<string, unknown>) => historical.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
      const release = { by: ref('inspector-one'), how: 'an inspector', at: '2026-10-15 09:00:00', reportedTo: ref(THE_TEST_OFFICES_SECRETARY.handle) }
      for (const name of ['reporting-two-confirmers', 'closed-by-person', 'closed-by-agent']) {
        const asking = (await post('/api/records', { kind: 'session', title: 'Fixture asking run', data: { state: 'running', servingAgent: 'confirm-asker' } }, asAgent('confirm-asker')))['record'] as { id: string }
        const worker = (await post('/api/records', { kind: 'session', title: `Fixture ${name}`, data: { state: 'running', servingAgent: 'builder-r' } }, asAgent('builder-r')))['record'] as { id: string }
        historical.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(worker.id)
        put(asking.id, { state: 'paused', servingAgent: 'confirm-asker', workerRuns: { worker: { state: 'started', askedAt: '2026-10-15 08:00:00', askedBy: { who: ref('confirm-asker'), session: asking.id }, handle: 'builder-r', brief: { path: '/made/up/brief.md', sha256: 'a'.repeat(64), bytes: 120 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' }, started: { at: '2026-10-15 08:01:00', run: worker.id, runKeyId: 'made-up-key' } } } })
        put(worker.id, { state: 'finished', servingAgent: 'builder-r', released: release, parentAttachment: asking.id })
        if (name !== 'reporting-two-confirmers') await post(`/api/checks/${worker.id}/confirm`, { because: 'The fixture report answers its brief.' }, name === 'closed-by-person' ? asPerson : asAgent(THE_TEST_OFFICES_SECRETARY.handle))
        confirmationPictures.push({ name, id: worker.id })
      }
    } finally { historical.close() }
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('C27 — a person reading a run sees its check without switching to Inspect', () => {
  it('draws the five parts of the check, under headings', async () => {
    await open(`/r/${beingChecked}`, 'light', 1440)
    const seen = await readThePanel()
    expect(seen.parts).toEqual([
      'Where this run stands',
      'Who the office asked',
      'What the check would read',
      'The verdict',
      'Which tree the check read',
    ])
  })

  it('says where the run stands, by the name a person reads', async () => {
    const seen = await readThePanel()
    expect(seen.word).toBe(RUN_STANDING.inspecting.word)
    expect(seen.text).not.toContain(RUN_STANDING.inspecting.sentence)
  })

  it('names the inspector the office asked, and says the run is waiting for it', async () => {
    const seen = await readThePanel()
    expect(seen.text).toContain('inspector-one')
    expect(seen.text).toContain('to release it or refuse it')
  })

  // CRITERION CHANGE, 30 September 2026, by item 2 of a decision: the base the changes were read against
  // is drawn ONLY in developer mode, like the worktree and the tip below.
  // Normal mode keeps the files and the chapters. tests/the-check-panel-names-its-base-only-in-
  // developer-mode.test.ts proves both modes in English and in Chinese.
  it('says what the check would read: the files inside and outside, the chapters, and the base in developer mode only', async () => {
    const seen = await readThePanel()
    expect(seen.text).not.toContain('7d7845b9')
    expect(seen.text).not.toContain('fork point')
    expect(seen.text).toContain('src/server/lib/inspection.ts')
    // A file OUTSIDE the work area is named and not read, and the panel says which it is.
    expect(seen.text).toContain('design/rules/ACCEPTANCE.md')
    expect(seen.text).toContain('Named and not read')
    expect(seen.text).toContain('chapter 5 at full')
    await open(`/r/${beingChecked}`, 'light', 1440, 'en', 'inspect')
    const developer = await readThePanel()
    expect(developer.text).toContain('7d7845b9')
    expect(developer.text).toContain('fork point')
    await open(`/r/${beingChecked}`, 'light', 1440)
  })

  // CRITERION CHANGE, 29 September 2026, by item 3 of a decision: a run's check panel shows its working
  // folder and commit ONLY in developer mode. Normal mode keeps the section and the check's own sentence;
  // developer mode adds the worktree and the tip.
  it('says which worktree and which tip the check read, in developer mode only', async () => {
    const normal = await readThePanel()
    expect(normal.text).not.toContain(`${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-check-of-this-run`)
    expect(normal.text).not.toContain('83fababc40337490f1fd53fb26cd60a59080a261')
    await open(`/r/${beingChecked}`, 'light', 1440, 'en', 'inspect')
    const developer = await readThePanel()
    expect(developer.text).toContain(`${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-check-of-this-run`)
    expect(developer.text).toContain('83fababc40337490f1fd53fb26cd60a59080a261')
    await open(`/r/${beingChecked}`, 'light', 1440)
  })

  it('prints no JSON, which is what this panel exists to replace', async () => {
    expect((await readThePanel()).json).toBe(false)
  })
})

describe('C27 — a refusal is drawn, and its group opens from the run', () => {
  it('says who refused it, on what rule, and what is missing', async () => {
    await open(`/r/${refused}`, 'light', 1440)
    const seen = await readThePanel()
    expect(seen.word).toBe(RUN_STANDING.rebuttal.word)
    expect(seen.text).toContain('inspector-one refused to release this run')
    expect(seen.text).toContain('chapter 5 of the office regulations')
    expect(seen.text).toContain('The test for criterion 2 would pass with the feature deleted.')
  })

  it('opens the group the refusal opened, by a link on this page', async () => {
    const seen = await readThePanel()
    const group = await (await fetch(`${app.api}/api/checks/${refused}`)).json()
    const id = ((group as { stands: { refused: { group: string } } }).stands.refused.group)
    // The old address, #/record/<id>, is not a route. recordPath owns the record page address.
    expect(seen.links).toContain(`#${recordPath(id)}`)
  })
})

describe('C27 — a released run says it is reporting, and the press that closes it is here', () => {
  it('says it is waiting for its supervisor, and offers the press', async () => {
    await open(`/r/${reporting}`, 'light', 1440)
    const seen = await readThePanel()
    expect(seen.word).toBe(RUN_STANDING.reporting.word)
    expect(seen.text).toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(seen.text).toContain('Confirm the report and close the run')
  })
})

describe('C27 — the panel is readable at both widths and in both themes', () => {
  it('overflows nothing at 1440 or 390, light or dark', async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 390]) {
        await open(`/r/${refused}`, theme, width)
        const seen = await readThePanel()
        expect(seen.overflow, `${theme} at ${String(width)}`).toBe(0)
        expect(seen.parts.length, `${theme} at ${String(width)}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('the run check, task package and report summary panels pass the four word checks', () => {
  it('draws checked, released and refused runs, a package and summary blocks in English, Chinese and the test language', async () => {
    const wordKeys = Object.keys(en).filter((key) => key.startsWith('chk.') || key.startsWith('tpp.') || key.startsWith('sb.')) as (keyof typeof en)[]
    expect(wordKeys.length).toBeGreaterThan(100)
    wordKeys.push('actor.human', 'actor.agent')
    // Check 2: every English key used by these panels has Chinese text for each count form.
    expect(wordKeys.filter((key) => zh[key] === undefined), 'English keys without Chinese').toEqual([])
    for (const language of ['en', 'zh'] as const) {
      const reader = createI18n(language)
      for (const key of wordKeys) for (const n of [0, 1, 2]) reader.t(key, { n })
      expect(reader.check().fallbacks, `${language}: words that fell back`).toEqual([])
    }

    const records = [
      { name: 'checked', id: wordChecked, standing: 'inspecting' },
      { name: 'refused', id: wordRefused, standing: 'rebuttal' },
      { name: 'C27 released', id: wordReleased, standing: 'reporting' },
      { name: 'task', id: packagedTask, standing: null },
      { name: 'report', id: summaryReport, standing: null },
    ]
    const never = [
      ...records.map((one) => one.id),
      String(app.apiPort),
      app.dir,
      // C27's read evidence: since a decision, it is drawn in developer mode only, so in normal mode either value
      // anywhere in a panel fails check 3, the evidence line included.
      `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-check-of-this-run`,
      '83fababc40337490f1fd53fb26cd60a59080a261',
      'cx-never-run-id',
      '/cx-never-path',
      'cx-never-branch',
      'cx-never-port',
      'cx-never-database',
      'cx-never-raw-field',
      'cx-never-door',
      'cx-never-setting',
    ]

    for (const language of ['en', 'zh', 'xx']) {
      for (const one of records) {
        await open(recordPath(one.id), 'light', 1440, language)
        expect(await page.locator('html').getAttribute('data-mode'), `${one.name}/${language} mode`).toBe('normal')
        expect(await page.locator('html').getAttribute('lang'), `${one.name}/${language} language`).toBe(language)

        if (one.standing !== null) {
          await page.locator('.chk-word').waitFor({ state: 'visible' })
          expect(await page.locator('.chk-word').getAttribute('data-standing'), `${one.name}/${language} standing`).toBe(one.standing)
        } else if (one.name === 'task') {
          await page.locator('.tpp-responsible').waitFor({ state: 'visible' })
        } else {
          await page.locator('.rd-report .sb').waitFor({ state: 'visible' })
        }

        // Check 1: the test language marks each interface word. User text and server sentences keep
        // their own words, so the reader below leaves those out of the word scan.
        if (language === 'xx') {
          expect(wordsLeftByHand(await wordsInOwnedPanels()), `${one.name}: words left by hand`).toEqual([])
        }

        // Check 3: no record id, test port, database path or stored machine sentinel reaches a panel.
        const text = (await wordsInOwnedPanels()).join('\n')
        for (const value of never) expect(text, `${one.name}/${language} showed ${value}`).not.toContain(value)
        for (const name of ['runId', 'path', 'branch', 'port', 'database', 'raw_field', 'door', 'setting']) {
          expect(text, `${one.name}/${language} showed the stored field ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`, 'i'))
        }

        // Check 4: an ordinary absence stays short and does not become a sentence.
        const absences = await page.evaluate(() => {
          return [...document.querySelectorAll('.chk .px-absent, .px-panel:has(.tpp-facts) .px-absent, .rd-report .px-absent')].map((element) => {
            const visible = element.cloneNode(true) as HTMLElement
            visible.querySelectorAll('.px-sr').forEach((hidden) => hidden.remove())
            return visible.textContent ?? ''
          })
        })
        const longAbsences = absences.filter((absence) => {
          const plain = absence.replace(/[⟦⟧·—]/g, '').trim()
          return plain.split(/\s+/).filter(Boolean).length > 6 || /[.!?。]$/.test(plain)
        })
        expect(longAbsences, `${one.name}/${language}: empty mark`).toEqual([])
        if (one.name === 'task') expect(absences.length, 'the package fixture exercises an ordinary absence').toBeGreaterThan(0)
      }
    }

    if (wordShots !== undefined) {
      const pictureRecords = [
        { name: 'checked', id: wordChecked },
        { name: 'refused', id: wordRefused },
        { name: 'released', id: wordReleased },
        { name: 'task-package', id: packagedTask },
        { name: 'report-summary', id: summaryReport },
      ]
      for (const language of ['en', 'zh']) {
        const widths = language === 'zh' ? [1440] : [1440, 990, 660, 390]
        for (const width of widths) for (const theme of ['light', 'dark'] as const) for (const one of pictureRecords) {
          await open(recordPath(one.id), theme, width, language)
          if (one.name === 'task-package') await page.locator('.tpp-responsible').waitFor({ state: 'visible' })
          else if (one.name === 'report-summary') await page.locator('.rd-report .sb').waitFor({ state: 'visible' })
          else await page.locator('.chk-word').waitFor({ state: 'visible' })
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          expect(overflow, `${one.name}/${language}/${theme}/${width} overflow`).toBeLessThanOrEqual(0)
          await page.screenshot({
            path: join(wordShots, `${one.name}-${width}-${theme}-${language}.png`),
            fullPage: true,
          })
        }
      }
    }
  }, 900_000)
})

// These pictures use the real run page, confirmation answer and panel, in English only. One narrow
// light pass is enough: the confirmation sentence is the same at every width and in either theme.
describe('the confirmation sentences at the narrowest width in one theme', () => {
  it('photographs two possible confirmers, a person-confirmed run and an agent-confirmed run', async () => {
    if (wordShots === undefined) return
    for (const width of [390]) for (const theme of ['light'] as const) for (const one of confirmationPictures) {
      await open(recordPath(one.id), theme, width, 'en')
      await page.locator('.chk-word').waitFor({ state: 'visible' })
      const seen = await readThePanel()
      expect(seen.overflow, `${one.name}/${width}/${theme}`).toBe(0)
      if (one.name === 'reporting-two-confirmers') {
        const sentence = await page.locator('.chk-waiting').textContent()
        expect(sentence).toContain('confirm-asker')
        expect(sentence).toContain(THE_TEST_OFFICES_SECRETARY.handle)
        expect(await page.locator('.chk-confirm .chk-said').count()).toBe(0)
      } else {
        expect(seen.word).toBe('Closed')
        expect(seen.text).not.toContain(RUN_STANDING.closed.sentence)
        expect(seen.text).not.toContain('The supervisor confirmed')
      }
      await page.screenshot({ path: join(wordShots, `${one.name}-${width}-${theme}-en.png`), fullPage: true })
    }
  }, 300_000)
})
