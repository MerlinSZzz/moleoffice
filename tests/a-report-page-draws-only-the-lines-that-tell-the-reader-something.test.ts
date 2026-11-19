// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD'S PAGE DRAWS ONLY THE LINES THAT TELL THE READER SOMETHING (decision 8SkQQo1x69IV, revision 3).
 *
 * Criterion, written before the change.
 *
 * OLD, in developer mode:
 *   - a report's header drew a line for each detail nobody wrote ("no day written on it", "does not say which
 *     chapters it read", "not marked read"), a sentence when the filer's run or model was not recorded, a line
 *     when nobody recorded who filed it, the read rule's whole sentence, and the report's day in other words than
 *     normal mode's;
 *   - the origin section was drawn for an ordinary authored record;
 *   - a kind with no state field drew a state section that said so;
 *   - the "what is still open around this" section was drawn when nothing was open.
 *
 * NEW, in both modes:
 *   (a) the header draws who filed it (with the model in developer mode when one is recorded), whom it is for when
 *       written, "About {day}." when that day is not the filing day, the chapters read when written, a stored read
 *       mark and the mark-read press, and no other line;
 *   (b) the origin section is drawn only for an origin that is not the ordinary authored one;
 *   (c) no kind draws "No state field". A kind with no state field draws no state section, unless the kind takes a
 *       pause or a consequence, and then the section holds only those lines. An unknown kind, an empty state field
 *       and a stored state are drawn as before;
 *   (d) nothing open draws no open-around section. A failed read is still drawn, and so is a list of open records.
 *
 * WHY: each removed line only says that a detail is missing, or explains the office's own rule. A reader does
 * nothing with it, and the page is shorter without it.
 *
 * ADDED LATER, for the same reason:
 *   (g) a report's History fold is closed at load, in both modes, and open when the address names the history
 *       section. This was already so when the case was written, so the case is a guard;
 *   (i) in normal mode a report's page draws no cost line when no run is named. Developer mode keeps its fold, and
 *       every other kind keeps the line that says nobody recorded a cost.
 *
 * The words are read from the word lists by `t`, or from the export that writes them.
 *
 * MADE-UP RECORDS ONLY. The static cases draw records built here. The live cases start their own test office,
 * register an agent named "Glaze Tally" under the handle glaze-tally, and file a report and a task as it.
 *
 * PICTURES: only when REPORT_PAGE_LINES_SHOTS names a folder. The report's page, which has two versions, each light and
 * dark, in English, of the whole page:
 *   - in normal mode at rest, with no fold opened, at 1440, 990, 660 and 390;
 *   - in normal mode with only the History fold opened, at 1440 and 390;
 *   - in developer mode with every fold on the page opened, at 1440, 990, 660 and 390.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createI18n, setWordLanguage } from '../src/shared/i18n.ts'
import { CHAPTERS_READ } from '../src/shared/chapters.ts'
import { joined } from '../src/shared/zoom.ts'
import { reportNoteOnAPage, reportReading } from '../src/shared/attention.ts'
import { wordWithSpacedValues } from '../src/shared/spacing.ts'
import { progressOf } from '../src/shared/work.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { kindWord } from '../src/shared/words.ts'
import type { RecordDetail } from '../src/web/api.ts'
import type { OpenLoop, OpenLoops } from '../src/server/lib/openloops.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { deleteTheCopiedDefaultChapters, liveApp, type LiveApp, waitForThePage } from './helpers.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
let page: RecordPage
let mode: typeof import('../src/web/lib/mode.ts')
let formatDue: (stamp: string) => string
let writerNamed: typeof import('../src/web/lib/participant-lookup.ts').writerNamed
let recordPath: typeof import('../src/web/components/router.tsx').recordPath

const en = createI18n('en').t

beforeAll(async () => {
  // THE PAGE'S MODULES TOUCH `window` WHILE THEY LOAD, and the mode is read from its storage.
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  Object.assign(globalThis, { window: {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    addEventListener: () => {}, removeEventListener: () => {},
  } })
  page = await import('../src/web/pages/RecordPage.tsx')
  mode = await import('../src/web/lib/mode.ts')
  formatDue = (await import('../src/web/lib/attention.ts')).formatDue
  writerNamed = (await import('../src/web/lib/participant-lookup.ts')).writerNamed
  recordPath = (await import('../src/web/components/router.tsx')).recordPath
})
afterEach(() => { mode?.setMode('normal'); setWordLanguage('en') })

const MODES = ['normal', 'inspect'] as const
type Mode = (typeof MODES)[number]

/** The day every made-up record here was filed. */
const FILED = '2026-08-16 09:00:00'

function made(kind: string, data: Record<string, unknown>, over: Record<string, unknown> = {}): PanelRecord {
  return {
    id: `made-up-${kind}`, workspaceId: 'default', ownerId: THE_TEST_OFFICES_OWNER.id, kind,
    title: `A made-up ${kind} for the page's lines`, summary: null, data, origin: 'authored',
    createdAt: FILED, updatedAt: FILED, deletedAt: null, ...over,
  } as unknown as PanelRecord
}

/** The markup without its stylesheets, with the entities put back, so a word is found as it is written. */
function drawn(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// ============================================================ (a) the report's header

type FiledFrom = RecordDetail['filedFrom']

const HANDLE = 'glaze-tally'
const AGENT = 'Glaze Tally'
const READER = 'the glaze room'

function aRun(over: Record<string, unknown>) {
  return { stored: 'made-up-run', recordId: 'made-up-run', title: 'A made-up run', matchedBy: 'recordId', rows: 1, unresolved: false, elsewhereIn: null, ...over }
}

/** The report's header line, as the record's page draws it, in one mode. */
function header(inMode: Mode, data: Record<string, unknown>, filedFrom?: FiledFrom): string {
  mode.setMode(inMode)
  const record = made('report', data)
  const props = {
    record, editable: false, deleted: false, records: [record], detailLinks: [], relations: [], evolutionLinks: [],
    log: { changes: [], sessions: [] }, titles: [], titleById: new Map([[record.id, record.title]]),
    unfilledByRecord: new Map<string, number>(), body: page.bodySections(record), onChanged: () => {},
    ...(filedFrom === undefined ? {} : { filedFrom }),
  }
  const html = drawn(h(page.RecordDetail, props as never))
  const line = /<p class="rd-byline">([\s\S]*?)<\/p>/.exec(html)?.[1]
  expect(line, `${inMode}: the report drew no header line, so nothing is measured`).toBeDefined()
  return line!
}

/** Every line the header no longer draws, for this report, in this mode's words for the filer. */
function neverInTheHeader(inMode: Mode, data: Record<string, unknown>): string[] {
  const record = made('report', data)
  const who = inMode === 'inspect' ? HANDLE : writerNamed({ actorType: 'agent', actorId: HANDLE }, undefined)
  return [
    en('g2b.report.noFor'), en('g2b.report.noForTitle'),
    en('g2b.report.noDay'), en('g2b.report.noDayTitle'),
    en('g2b.report.noChapters'), en('g2b.report.noChaptersTitle'),
    en('g2b.report.notMarkedRead'),
    // The read rule's whole sentence, which developer mode drew on the line and on the read mark's tooltip.
    reportNoteOnAPage(reportReading(record, []), en, formatDue),
    en('g2b.report.filedByNobody'),
    en('g2b.report.filedNoRun', { who }),
    en('g2b.report.filedRunNotHere', { who }),
    en('g2b.report.filedModelNotRecorded', { who }),
  ]
}

function drawsNoneOf(line: string, gone: string[], where: string): void {
  expect(line, `${where}: the line that carried the rule's sentence is back`).not.toContain('rd-byline-said')
  for (const one of gone) expect(line, `${where}: "${one}" is drawn`).not.toContain(one)
}

describe('(a) the report header', () => {
  it('draws whom it is for, the day it is about, and the press, and no line about what nobody wrote', () => {
    const data = { for: READER, date: '2026-08-12', blocks: [] }
    for (const inMode of MODES) {
      const line = header(inMode, data)
      drawsNoneOf(line, neverInTheHeader(inMode, data), inMode)
      expect(line, `${inMode}: whom it is for`).toContain(en('g2b.report.for', { who: READER }))
      expect(line, `${inMode}: the day it is about`).toContain(wordWithSpacedValues(en, 'g2b.report.aboutDay', { day: formatDue('2026-08-12') }))
      expect(line, `${inMode}: the day in developer mode's old words`).not.toContain(wordWithSpacedValues(en, 'g2b.report.day', { day: formatDue('2026-08-12') }))
      expect(line, `${inMode}: the mark-read press`).toContain(en('home.iHaveRead'))
    }
  })

  it('draws no day line when the day is the filing day, and nothing for a report with no reader and no day', () => {
    for (const inMode of MODES) {
      const sameDay = header(inMode, { for: READER, date: FILED.slice(0, 10), blocks: [] })
      expect(sameDay, `${inMode}: the filing day is said again`).not.toContain(formatDue(FILED.slice(0, 10)))
      const bare = { blocks: [] }
      const line = header(inMode, bare)
      drawsNoneOf(line, neverInTheHeader(inMode, bare), `${inMode}, no reader and no day`)
      expect(line, `${inMode}: the mark-read press`).toContain(en('home.iHaveRead'))
    }
  })

  it('keeps the chapters read when written, and a stored read mark', () => {
    for (const inMode of MODES) {
      const read = { for: READER, [CHAPTERS_READ]: [3], read: 'read', blocks: [] }
      const line = header(inMode, read)
      drawsNoneOf(line, neverInTheHeader(inMode, read), `${inMode}, read`)
      expect(line, `${inMode}: the chapters read`).toContain(en('g2b.report.readChapters', { n: 1, chapters: joined(['3']) }))
      expect(line, `${inMode}: the stored read mark`).toContain(en('g2b.report.markedRead'))
      expect(line, `${inMode}: a report already read still asks to be read`).not.toContain(en('home.iHaveRead'))
      const unread = header(inMode, { for: READER, [CHAPTERS_READ]: [], read: 'unread', blocks: [] })
      expect(unread, `${inMode}: no chapter read`).toContain(en('g2b.report.readNoChapter'))
      expect(unread, `${inMode}: the stored unread mark`).toContain(en('g2b.report.markedUnread'))
    }
  })

  it('names the filer, with the model in developer mode when one is recorded, and says nothing about a gap', () => {
    const data = { for: READER, blocks: [] }
    const agent = (run: unknown) => ({ actorType: 'agent', actorId: HANDLE, run }) as FiledFrom
    for (const inMode of MODES) {
      const who = inMode === 'inspect' ? HANDLE : writerNamed({ actorType: 'agent', actorId: HANDLE }, undefined)
      const filedBy = en('g2b.report.filedBy', { who })
      const onAModel = header(inMode, data, agent(aRun({ model: 'made-up-model-7' })))
      expect(onAModel, `${inMode}: the filer and the model`).toContain(
        inMode === 'inspect' ? en('g2b.report.filedByOn', { who, model: 'made-up-model-7' }) : filedBy,
      )
      for (const [gap, run] of [['no run', null], ['a run with no record here', aRun({ unresolved: true, recordId: null })], ['no model', aRun({ model: null })]] as const) {
        const line = header(inMode, data, agent(run))
        drawsNoneOf(line, neverInTheHeader(inMode, data), `${inMode}, ${gap}`)
        expect(/<span data-testid="report-filed-by">([^<]*)<\/span>/.exec(line)?.[1], `${inMode}, ${gap}: the filer`).toBe(filedBy)
      }
      const nobody = header(inMode, data, null)
      drawsNoneOf(nobody, neverInTheHeader(inMode, data), `${inMode}, nobody recorded`)
      expect(nobody, `${inMode}: a filer line where nobody is recorded`).not.toContain('report-filed-by')
    }
  })
})

// ============================================================ (b) the origin section

describe('(b) the origin section', () => {
  it('is not drawn for an ordinary authored record, and is drawn for every other origin', () => {
    for (const inMode of MODES) {
      mode.setMode(inMode)
      expect(drawn(h(page.OriginSays, { record: made('note', {}) })), `${inMode}: authored`).toBe('')
      // A record served with no origin key at all is read as unserved; a stored null is read as unrecorded.
      const unserved = made('note', {})
      delete (unserved as { origin?: unknown }).origin
      const exceptions: [string, PanelRecord][] = [
        ['fixture', made('note', {}, { origin: 'fixture' })],
        ['unrecorded', made('note', {}, { origin: null })],
        ['unserved', unserved],
      ]
      for (const [key, record] of exceptions) {
        const html = drawn(h(page.OriginSays, { record }))
        expect(html, `${inMode}, ${key}: the section's title`).toContain(en('g2b.origin.title'))
        expect(html, `${inMode}, ${key}: the origin's mark`).toContain(`data-origin="${key}"`)
      }
    }
  })
})

// ============================================================ (c) the state section

describe('(c) the state section', () => {
  it('is not drawn for a kind with no state field and nothing to qualify it', () => {
    for (const inMode of MODES) {
      mode.setMode(inMode)
      for (const kind of ['report', 'note', 'notebook']) {
        expect(drawn(h(page.StateSays, { record: made(kind, {}) })), `${inMode}, ${kind}`).toBe('')
      }
    }
  })

  it('keeps only the consequence line on a pipeline, and never the "No state field" mark', () => {
    const what = 'The glaze room waits for the made-up kiln order.'
    for (const inMode of MODES) {
      mode.setMode(inMode)
      for (const [said, data] of [[what, { consequence: { bearer: 'outside', what } }], [en('g2b.state.noConsequence'), {}]] as const) {
        const html = drawn(h(page.StateSays, { record: made('pipeline', data) }))
        expect(html, `${inMode}: the section's title`).toContain(en('g2b.state.title'))
        expect(html, `${inMode}: the consequence line`).toContain(said)
        expect(html, `${inMode}: the "No state field" mark`).not.toContain(en('sheet.noState.noField'))
        expect(html, `${inMode}: the no-state-field sentence`).not.toContain(en('g2b.state.noStateField', { kind: kindWord('pipeline').text }))
      }
    }
  })

  it('is still drawn for a kind with a state field, written or not, and for a kind nobody knows', () => {
    for (const inMode of MODES) {
      mode.setMode(inMode)
      const unwritten = drawn(h(page.StateSays, { record: made('task', {}) }))
      expect(unwritten, `${inMode}: a task with no state`).toContain(en('sheet.noState.unwritten'))
      const written = drawn(h(page.StateSays, { record: made('task', { state: 'open' }) }))
      expect(written, `${inMode}: a task with a state`).toContain(en('g2b.state.title'))
      expect(written, `${inMode}: a stored state read as none`).not.toContain(en('sheet.noState.unwritten'))
      const unknown = drawn(h(page.StateSays, { record: made('kiln-batch', {}) }))
      expect(unknown, `${inMode}: a kind nobody knows`).toContain(en('sheet.noState.kindUnknown'))
    }
  })
})

// ============================================================ (d) the open-around section

function reading(loops: OpenLoop[]): OpenLoops {
  return {
    workspaceId: 'default', standingAt: null, reach: null, rung: { asked: 'full', drew: 'full', why: null }, loops, leftOut: [],
    counts: { candidates: loops.length, carried: loops.length, leftOut: 0, outsideThePopulation: 0 },
    attachment: { openLoopsInProject: loops.length, attachedToNoModule: loops.length, sentence: 'Made-up open population.' },
    whoseMove: { person: 0, agent: 0, either: 0, nobodyHasSaid: loops.length },
    size: { budgetBytes: 16384, fits: true }, note: 'Made-up reading.',
  }
}
const ONE_OPEN: OpenLoop = {
  id: 'made-up-open-one', kind: 'problem', says: 'The made-up kiln door seal leaks heat.', from: 'title', state: 'open',
  progress: progressOf('open'), whoseMove: null, hops: 1, lastChanged: '2026-08-15 10:00:00', modules: [],
}

describe('(d) the open-around section', () => {
  it('is not drawn when nothing is open, and is drawn for a failed read and for a list', () => {
    for (const kind of ['report', 'task']) {
      const record = made(kind, {})
      for (const inMode of MODES) {
        mode.setMode(inMode)
        expect(drawn(h(page.StillOpenHere, { record, relations: [], reading: { status: 'ready', value: reading([]) } })), `${inMode}, ${kind}: nothing open`).toBe('')
        const failed = drawn(h(page.StillOpenHere, { record, relations: [], reading: { status: 'error', message: 'The made-up read failed.' } }))
        expect(failed, `${inMode}, ${kind}: a failed read`).toContain(en('record.section.openAround'))
        expect(failed, `${inMode}, ${kind}: a failed read's words`).toContain('The made-up read failed.')
        const one = drawn(h(page.StillOpenHere, { record, relations: [], reading: { status: 'ready', value: reading([ONE_OPEN]) } }))
        expect(one, `${inMode}, ${kind}: one open record`).toContain(ONE_OPEN.says)
      }
    }
  })
})

// ============================================================ the pages, in a browser

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT: Record<string, string> = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE }
const DAY = '2026-10-02'
/** The variable that, when it names a folder, asks for the pictures. */
const SHOTS_FOLDER = 'REPORT_PAGE_LINES_SHOTS'

describe('the pages, in a browser', () => {
  let app: LiveApp
  let browser: Page
  let reportId = ''
  let taskId = ''

  async function file(body: unknown): Promise<string> {
    const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_AGENT, body: JSON.stringify(body) })
    expect(reply.status, await reply.clone().text()).toBe(201)
    return ((await reply.json()) as { record: { id: string } }).record.id
  }

  /**
   * One record's page in English, in a mode, a width and a look, with its History read and some of its folds open:
   * none, only the History fold, the page's own folds, or every fold on the page.
   */
  async function open(id: string, inMode: Mode, width = 1440, theme: 'light' | 'dark' = 'light', folds: 'none' | 'history' | 'own' | 'every' = 'own'): Promise<void> {
    await browser.setViewportSize({ width, height: 1000 })
    await browser.goto(`${app.site}/?lang=en#/r/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await browser.evaluate(([chosen, look]) => {
      localStorage.setItem('mole-office.mode', chosen!)
      localStorage.setItem('mole-office.preset.theme', look!)
    }, [inMode, theme])
    await browser.reload({ timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await browser.locator('.rd-changed').waitFor({ timeout: 30_000 })
    // THE HISTORY FOLD IS DRAWN AGAIN ONCE ITS VERSIONS ARE READ, and a fold opened before that would be closed by it.
    const history = browser.locator('main.page details.rh-fold[data-versions]')
    await history.waitFor({ state: 'attached', timeout: 30_000 })
    await history.locator('.rh-happened').waitFor({ state: 'attached', timeout: 30_000 })
    const which = { none: null, history: 'main.page details.rh-fold', own: 'main.page details.rh-fold, main.page details.rd-fold', every: 'main.page details' }[folds]
    if (which !== null) await browser.evaluate((chosen) => document.querySelectorAll(chosen).forEach((one) => ((one as HTMLDetailsElement).open = true)), which)
  }

  /** One address in English, in a mode, as the page draws it at load. Nothing here opens a fold. */
  async function arrive(address: string, inMode: Mode): Promise<void> {
    await browser.setViewportSize({ width: 1440, height: 1000 })
    await browser.goto(`${app.site}/?lang=en#${address}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await browser.evaluate((chosen) => {
      localStorage.setItem('mole-office.mode', chosen)
      localStorage.setItem('mole-office.preset.theme', 'light')
    }, inMode)
    await browser.reload({ timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    // THE CHANGE LOG'S LINE IS IN THE SAME RAIL AS THE COST LINE, so once it is drawn the cost line has its place.
    await browser.locator('.rd-changed').waitFor({ timeout: 30_000 })
  }

  /** Whether the History fold is open, once its versions are read. */
  async function historyIsOpen(): Promise<boolean> {
    const fold = browser.locator('main.page details.rh-fold[data-versions]')
    await fold.waitFor({ state: 'attached', timeout: 30_000 })
    return fold.evaluate((one) => (one as HTMLDetailsElement).open)
  }

  /** The titles of the sections the page draws, as written, whatever case the look puts them in. */
  async function sectionTitles(): Promise<string[]> {
    return browser.locator('main.page h2.px-panel-title').evaluateAll((all) => all.map((one) => (one.textContent ?? '').trim()))
  }

  /** The header line's words, and every tooltip in it. */
  async function headerLine(): Promise<string> {
    const line = browser.locator('main.page .rd-byline')
    await line.waitFor({ timeout: 30_000 })
    return line.evaluate((one) => [one.textContent ?? '', ...Array.from(one.querySelectorAll('[title]')).map((tip) => tip.getAttribute('title') ?? '')].join(' | '))
  }

  beforeAll(async () => {
    app = await liveApp({ name: 'report-page-lines', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
    browser = app.page
    await deleteTheCopiedDefaultChapters(app.api)
    const started = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ handle: HANDLE, name: AGENT, runtime: 'codex' }) })
    expect(started.status, await started.clone().text()).toBe(201)
    reportId = await file({
      kind: 'report', title: 'The made-up glaze tests for September',
      summary: 'Nine glaze tiles fired, two crawled.',
      data: { for: READER, date: DAY, blocks: [{ id: 'one', type: 'text', text: 'Nine made-up glaze tiles were fired.' }] },
    })
    // A SECOND VERSION, WRITTEN THROUGH THE DOOR BY THE SAME AGENT, so the History fold in the pictures has a list.
    const changed = await fetch(`${app.api}/api/records/${reportId}`, { method: 'PATCH', headers: AS_THE_AGENT, body: JSON.stringify({ summary: 'Nine glaze tiles fired, two crawled, one cracked.' }) })
    expect(changed.status, await changed.clone().text()).toBe(200)
    taskId = await file({ kind: 'task', title: 'Order the made-up cone pack', data: {} })
  }, 300_000)

  afterAll(async () => {
    await app?.stop()
  }, 120_000)

  it("draws a report's page with no origin, state or open-around section, and a header with only its kept lines", async () => {
    for (const inMode of MODES) {
      await open(reportId, inMode)
      const titles = await sectionTitles()
      for (const gone of [en('g2b.origin.title'), en('g2b.state.title'), en('record.section.openAround')]) {
        expect(titles, `${inMode}: the "${gone}" section is drawn`).not.toContain(gone)
      }
      expect(await browser.locator('main.page .rd-byline-said').count(), `${inMode}: the rule's sentence is drawn`).toBe(0)
      const line = await headerLine()
      for (const gone of [en('g2b.report.noChapters'), en('g2b.report.noChaptersTitle'), en('g2b.report.notMarkedRead')]) {
        expect(line, `${inMode}: "${gone}" is drawn`).not.toContain(gone)
      }
      expect(line, `${inMode}: whom it is for`).toContain(en('g2b.report.for', { who: READER }))
      expect(line, `${inMode}: the day it is about`).toContain(wordWithSpacedValues(en, 'g2b.report.aboutDay', { day: formatDue(DAY) }))
      expect(line, `${inMode}: the mark-read press`).toContain(en('home.iHaveRead'))
      const filer = (await browser.locator('main.page [data-testid="report-filed-by"]').textContent())?.trim()
      expect(filer, `${inMode}: the filer`).toBe(en('g2b.report.filedBy', { who: inMode === 'inspect' ? HANDLE : AGENT }))
    }
  }, 300_000)

  it("keeps a task's state section in developer mode", async () => {
    await open(taskId, 'inspect')
    expect(await sectionTitles(), 'the task lost its state section').toContain(en('g2b.state.title'))
    expect(await browser.locator('main.page').innerText(), 'the task drew the "No state field" mark').not.toContain(en('sheet.noState.noField'))
  }, 300_000)

  it("keeps a report's History fold closed at load, and opens it when the address names the history section", async () => {
    for (const inMode of MODES) {
      await arrive(recordPath(reportId), inMode)
      expect(await historyIsOpen(), `${inMode}: the History fold is open at load`).toBe(false)
      await arrive(recordPath(reportId, undefined, 'history'), inMode)
      expect(await historyIsOpen(), `${inMode}: the History fold is closed at the history section's address`).toBe(true)
    }
  }, 300_000)

  it("draws no cost line on a report's page in normal mode when no run is named, and keeps it elsewhere", async () => {
    const spent = browser.locator('main.page [data-testid="spent-on-this"]')
    await arrive(recordPath(reportId), 'normal')
    expect(await spent.count(), 'normal: the report draws a cost line').toBe(0)
    expect(await browser.locator('main.page').innerText(), 'normal: the report says nobody recorded a cost').not.toContain(en('g2b.spent.summaryNoRuns'))

    await arrive(recordPath(reportId), 'inspect')
    expect(await browser.locator('main.page details.rd-fold[data-testid="spent-on-this"]').count(), 'developer: the report lost its cost fold').toBe(1)

    await arrive(recordPath(taskId), 'normal')
    expect((await spent.textContent())?.trim(), 'normal: the task lost its cost line').toBe(en('g2b.spent.summaryNoRuns'))
  }, 300_000)

  it.skipIf(!process.env[SHOTS_FOLDER])(
    "photographs the report's page at rest and with History open in normal mode, and with every fold open in developer mode, light and dark",
    async () => {
      const shots = process.env[SHOTS_FOLDER] as string
      mkdirSync(shots, { recursive: true })
      const plan = [
        ['report-normal-rest', 'normal', 'none', [1440, 990, 660, 390]],
        ['report-normal-history', 'normal', 'history', [1440, 390]],
        ['report-dev-every', 'inspect', 'every', [1440, 990, 660, 390]],
      ] as const
      for (const [name, inMode, folds, widths] of plan) {
        for (const width of widths) {
          const taken: Partial<Record<'light' | 'dark', Buffer>> = {}
          for (const theme of ['light', 'dark'] as const) {
            await open(reportId, inMode, width, theme, folds)
            // THE FOLDS OPEN WITH A 240 MS MOTION (problem JHuQyB2zuBlC), so each picture waits it out.
            await browser.waitForTimeout(400)
            taken[theme] = await browser.screenshot({ path: join(shots, `${name}-${String(width)}-${theme}.png`), fullPage: true })
          }
          expect(taken.dark!.equals(taken.light!), `${name} at ${String(width)}: the dark picture is the light one`).toBe(false)
        }
      }
    },
    900_000,
  )
})
