// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSIONS PAGE SAYS TRUE COUNTS, at one as at many.
 *
 * Item 99 (8 Nov 2026, from item 84's pictures), wave 13y round 156.
 *
 * (b) A row holding one fact read "1 facts". It now reads the singular.
 * (c) The ended band holding one record read "1 of these 1 were written down as finished". It now says the plain
 *     sentence from its own key.
 * (d) Every row saying the same thing read "2 of these 2 say the same thing". It now says "Both say the same thing:"
 *     for two rows and "All N say the same thing:" for more.
 * (e) The folded-ended line kept "including 0 in 0 whole folded groups". It now leaves that clause out when it is zero.
 * (g) The tool name in an ended row touched the origin pill. The two marks now keep the page's chip gap.
 *
 * Items (a), the finished group's sentence, and (f), the developer note under the This machine box, went with the
 * explanations taken off the page in November 2026, as decided.
 *
 * The tests read every word from its key.
 *
 * The picture case is the made-up Sessions page item 84's pictures came from: two made-up runs on a page intercepted
 * at the sessions door, with their session records made through the office's own write door. It photographs the page,
 * its ended fold, the placement note and the arithmetic line at 1440 and 390 in the light theme. Set TEST_SHOTS to a
 * folder outside the checkout to take them. The dark theme and the widths 990 and 660 are not drawn: the words and the
 * gap do not depend on the colours, and 1440 and 390 are the wide page and the phone.
 */
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '@shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'
import type { Placement, SessionLine, SessionView } from '../src/web/components/SessionPanel.tsx'

type SP = typeof import('../src/web/components/SessionPanel.tsx')
type SessionsPageModule = typeof import('../src/web/pages/SessionsPage.tsx')
let sp: SP
let sessionsPageModule: SessionsPageModule

const SHOTS = process.env[TEST_SHOTS] === undefined ? undefined : testShots('sessions-counts-truly')
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime()

beforeAll(async () => {
  const store = new Map<string, string>([['mole-office.mode', 'inspect']])
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  }
  sp = await import('../src/web/components/SessionPanel.tsx')
  sessionsPageModule = await import('../src/web/pages/SessionsPage.tsx')
})

/** The markup with the hoisted style blocks removed. */
function body(element: React.ReactElement): string {
  return renderToStaticMarkup(element).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** What a reader sees: the screen reader's copies and every tag removed. */
function seen(html: string): string {
  return html.replace(/<span class="px-sr">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '')
}

/** No recorded pipeline or module: the page's honest unassigned group, with no placement sentence on the row. */
const NO_PLACEMENT: Placement = {
  kind: 'unassigned',
  reason: { why: 'reaches-nothing', touched: 0, linked: 0 },
  sentence: '',
  howToPlace: '',
}

/** A made-up placement sentence, with the same shape the server sends. */
function aPlacement(sentence: string): Placement {
  return {
    kind: 'unassigned',
    reason: { why: 'reaches-nothing', touched: 0, linked: 0 },
    sentence,
    howToPlace: '',
  }
}

/** One made-up session, with every field the view reads. */
function aSession(over: Partial<SessionLine> & Pick<SessionView, 'id' | 'state'>): SessionLine {
  return {
    recordId: null,
    title: over.id,
    origin: 'authored',
    stateReason: null,
    purpose: null,
    doing: null,
    tool: 'claude-code',
    recordedAgent: null,
    cwd: null,
    workspace: null,
    lastOutputAt: '2026-11-10 11:00:00',
    lastActivityFrom: 'log',
    resumeCommand: null,
    logPath: null,
    placement: NO_PLACEMENT,
    itsProcess: null,
    written: { kind: 'no-record' },
    detail: null,
    ...over,
  }
}

function aProject(lines: readonly SessionLine[]) {
  const placements = new Map<string, Placement>()
  return sp.projectSessions(lines, placements, NOW)[0]!
}

describe('a count of one takes the singular', () => {
  it('says one fact, not one facts', () => {
    const line = aSession({ id: 'one-fact', state: 'running', purpose: 'Check the kiln shelves before a firing' })
    const shown = seen(body(h(sp.ProjectBlock, { entry: aProject([line]), now: NOW, placements: new Map() })))
    expect(shown).toContain(`1 ${t('g6a.sessions.oneFact')}`)
    expect(shown).not.toContain(`1 ${t('g6a.sessions.factCount')}`)
  })

  it('says the one record was written down as finished, in the plain sentence', () => {
    const line = aSession({ id: 'written', state: 'finished', written: { kind: 'classified', word: 'finished', progress: 'finished' } })
    const shown = seen(body(h(sp.ProjectBlock, { entry: aProject([line]), now: NOW, placements: new Map() })))
    expect(shown).toContain(t('g6a.sessions.itWasWrittenDownAsFinished'))
    expect(shown).not.toContain(t('g6a.sessions.confirmedOne', { confirmed: 1, total: 1 }))
    expect(shown).not.toContain(t('g6a.sessions.confirmed', { confirmed: 1, total: 1 }))
  })
})

/** The placement note's rows: every one says the same sentence, and the page is asked what it prints above them. */
function rowsSaying(sentence: string, count: number): { lines: SessionLine[]; placements: Map<string, Placement> } {
  const placement = aPlacement(sentence)
  const lines = Array.from({ length: count }, (_, i) =>
    aSession({ id: `same-thing-${String(i)}`, state: 'unknown', written: { kind: 'none' }, placement }),
  )
  return { lines, placements: new Map(lines.map((line) => [line.id, placement])) }
}

/** What the placement note above the rows says, on its own, so another sentence's "of these" is not read as it. */
function thePlacementNote(html: string): string {
  const found = html.match(/<p class="sx-place-said"[^>]*>([\s\S]*?)<\/p>/)
  return found === null ? '' : seen(found[1]!)
}

describe('a sentence every row says is said as every row, not as a fraction', () => {
  it('says Both when two rows say the same thing', () => {
    const { lines, placements } = rowsSaying('This made-up run is filed under no pipeline or module.', 2)
    const entry = sp.projectSessions(lines, placements, NOW)[0]!
    const shown = thePlacementNote(body(h(sp.ProjectBlock, { entry, now: NOW, placements })))
    expect(shown).toContain(t('g6a.sessions.bothSayTheSameThing'))
    expect(shown).not.toContain(t('g6a.sessions.ofThese'))
  })

  it('says All N when three rows say the same thing', () => {
    const { lines, placements } = rowsSaying('This made-up run is filed under no pipeline or module.', 3)
    const entry = sp.projectSessions(lines, placements, NOW)[0]!
    const shown = thePlacementNote(body(h(sp.ProjectBlock, { entry, now: NOW, placements })))
    expect(shown).toContain(t('g6a.sessions.allSayTheSameThing', { n: 3 }))
    expect(shown).not.toContain(t('g6a.sessions.ofThese'))
  })
})

/** The page from fixtures, which is where the arithmetic above the list is drawn. */
function thePage(lines: readonly SessionLine[]): string {
  return seen(body(h(sessionsPageModule.SessionsView, {
    lines,
    orphans: [],
    unclaimed: null,
    problems: [],
    searched: [],
    warnings: [],
    now: NOW,
    read: { at: NOW, inFlight: false, inFlightFromAPress: false, theLastReadWasFromAPress: false, failed: null, onReadAgain: () => {} },
    onRelease: async () => { throw new Error('fixture only') },
    onReread: () => {},
  })))
}

describe('the folded-ended line leaves out what is zero and keeps what is not', () => {
  it('leaves the including clause out at zero and keeps it when a whole group is folded', () => {
    const noWholeGroup = [
      aSession({ id: 'still-running', state: 'running', placement: aPlacement('One made-up sentence for this run.') }),
      aSession({ id: 'finished', state: 'finished', placement: aPlacement('A different made-up sentence for this run.') }),
    ]
    const noWholeGroupShown = thePage(noWholeGroup)
    expect(noWholeGroupShown).toContain(t('g6a.sessions.foldedEndedNoGroups', { n: 1 }))
    expect(noWholeGroupShown).not.toContain(t('g6a.sessions.foldedEnded', { n: 1, rows: 0, groups: 0 }))

    const wholeGroup = [
      aSession({ id: 'ended-one', state: 'finished', placement: aPlacement('One made-up sentence for this run.') }),
      aSession({ id: 'ended-two', state: 'unknown', placement: aPlacement('A different made-up sentence for this run.') }),
    ]
    const wholeGroupShown = thePage(wholeGroup)
    expect(wholeGroupShown).toContain(t('g6a.sessions.foldedEnded', { n: 2, rows: 2, groups: 1 }))
    expect(wholeGroupShown).not.toContain(t('g6a.sessions.foldedEndedNoGroups', { n: 2 }))
  })
})

/** The made-up sessions the picture page draws, in the shape the sessions door answers with. */
function madeUpSessions(finishedRecord: string) {
  const clear = { sentence: 'This made-up run is filed under no pipeline or module.', howToPlace: 'A made-up page does not place its runs.' }
  return {
    sessions: [
      {
        id: 'made-up-running',
        recordId: null,
        name: 'A made-up run with one fact',
        title: 'A made-up run with one fact',
        state: 'running',
        stateReason: null,
        purpose: null,
        doing: null,
        tool: 'claude-code',
        recordedAgent: null,
        cwd: null,
        lastActivityAt: '2026-11-10 11:58:00',
        lastActivityFrom: 'log',
        resumeCommand: null,
        logPath: null,
        workspace: null,
        placement: { kind: 'unassigned', reason: { why: 'reaches-nothing' }, ...clear },
        itsProcess: null,
      },
      {
        id: 'made-up-finished',
        recordId: finishedRecord,
        name: 'A made-up run written down as finished',
        title: 'A made-up run written down as finished',
        state: 'finished',
        stateReason: 'the log ends with a clean exit marker.',
        purpose: null,
        doing: null,
        tool: 'claude-code',
        recordedAgent: 'claude-code',
        cwd: null,
        lastActivityAt: '2026-11-10 10:00:00',
        lastActivityFrom: 'log',
        resumeCommand: null,
        logPath: null,
        workspace: null,
        placement: { kind: 'unassigned', reason: { why: 'reaches-nothing' }, ...clear },
        itsProcess: null,
      },
    ],
    searched: [],
    counts: { running: 1, finished: 1 },
    placementRule: 'A made-up rule for a made-up page.',
    placementRead: { rule: 'A made-up rule.', projects: 0, blocks: 0, links: 0, changes: 0, changesCapped: false },
  }
}

async function send(api: string, method: string, path: string, payload: object | null): Promise<Record<string, any>> {
  const reply = await fetch(api + path, { method, headers: PERSON, ...(payload === null ? {} : { body: JSON.stringify(payload) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${path}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function openSessions(page: Page, site: string): Promise<void> {
  // A HASH CHANGE IN THE SAME DOCUMENT IS NOT A VISIT. Open a blank page first, as every browser test here does, so
  // the sessions address is the page that is loaded rather than a scroll inside Home.
  await page.goto('about:blank')
  // INSPECT MODE: the page as a developer reads it.
  await page.goto(`${site}/?lang=en&mode=inspect#/sessions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.sx-proj', { timeout: 30_000 })
}

/** One measured pass over the spacing fault: where the two marks meet. */
interface SpacingMeasured {
  look: string
  width: number
  marks: { display: string; columnGap: number; rowGap: number; gapX: number; gapY: number; sameLine: boolean }
}

interface Said {
  fact: string
  ended: string
  place: string
  arithmetic: string
}

interface Pass {
  look: string
  width: number
  said: Said
  page: Buffer
  ended: Buffer
  place: Buffer
  arithmetic: Buffer
  spacing: SpacingMeasured
}

describe('the made-up Sessions page item 84 drew', () => {
  it('draws its true counts, keeps the spacing fault closed, and photographs them at 1440 and 390 in the light theme', async () => {
    const app: LiveApp = await liveApp({ name: 'sessions-counts-truly', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
    const passes: Pass[] = []
    try {
      const finished = await send(app.api, 'POST', '/api/records', {
        kind: 'session',
        title: 'A made-up run written down as finished',
        data: { state: 'finished', detail: 'A made-up clean exit.' },
      })
      const payload = madeUpSessions(finished['record'].id as string)
      // KEEP THE LIVE ANSWER'S HEADERS. The page refuses a reply that does not say which world answered it, and a page
      // that has read one reply already checks every later one against it; a made-up body must not take that header away.
      await app.page.route('**/api/sessions', async (route) =>
        route.fulfill({ response: await route.fetch(), status: 200, contentType: 'application/json', body: JSON.stringify(payload) }),
      )
      await app.page.route('**/api/resources/orphans', async (route) =>
        route.fulfill({ response: await route.fetch(), status: 200, contentType: 'application/json', body: JSON.stringify({ orphans: [], searched: [] }) }),
      )
      {
        const look = 'light'
        for (const width of [1440, 390]) {
          const where = `${look} ${String(width)}`
          await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
          await app.page.goto(`${app.site}/?lang=en`)
          await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
          await openSessions(app.page, app.site)
          expect(await app.page.locator('html').getAttribute('data-theme'), `${where}: the theme`).toBe(look)

          const row = app.page.locator('.px-scan', { hasText: 'A made-up run with one fact' }).first()
          const fact = (await row.locator('.px-scan-holds').textContent()) ?? ''

          const ended = app.page.locator('details[data-band="ended"]').first()
          const endedText = (await ended.textContent()) ?? ''

          const place = app.page.locator('.sx-place-said').first()
          const placeText = (await place.textContent()) ?? ''

          const arithmetic = app.page.locator('.sx-arithmetic').nth(1)
          const arithmeticText = (await arithmetic.textContent()) ?? ''

          const spacing = await app.page.evaluate((): Omit<SpacingMeasured, 'look' | 'width'> => {
            const lead = document.querySelector('details[data-band="ended"] .sx-line .px-scan-lead') as HTMLElement | null
            const tag = lead?.querySelector('.px-tag') as HTMLElement | null
            const pill = lead?.querySelector('.px-origin[data-origin="unrecorded"]') as HTMLElement | null
            const leadStyle = lead === null ? null : getComputedStyle(lead)
            const tagBox = tag?.getBoundingClientRect() ?? null
            const pillBox = pill?.getBoundingClientRect() ?? null
            const sameLine = tagBox !== null && pillBox !== null ? pillBox.top < tagBox.bottom - 1 : false
            return {
              marks: {
                display: leadStyle?.display ?? 'none',
                columnGap: leadStyle === null ? 0 : parseFloat(leadStyle.columnGap),
                rowGap: leadStyle === null ? 0 : parseFloat(leadStyle.rowGap),
                gapX: tagBox === null || pillBox === null ? Number.NaN : pillBox.left - tagBox.right,
                gapY: tagBox === null || pillBox === null ? Number.NaN : pillBox.top - tagBox.bottom,
                sameLine,
              },
            }
          })

          const pageShot = SHOTS === undefined ? Buffer.alloc(0) : await app.page.screenshot({ path: join(SHOTS, `sessions-counts-page-${look}-${String(width)}.png`), fullPage: true })
          await app.page.locator('details[data-band="ended"] > summary').click()
          const endedShot = SHOTS === undefined ? Buffer.alloc(0) : await ended.screenshot({ path: join(SHOTS, `sessions-counts-ended-${look}-${String(width)}.png`) })
          const placeShot = SHOTS === undefined ? Buffer.alloc(0) : await place.screenshot({ path: join(SHOTS, `sessions-counts-place-${look}-${String(width)}.png`) })
          const arithmeticShot = SHOTS === undefined ? Buffer.alloc(0) : await arithmetic.screenshot({ path: join(SHOTS, `sessions-counts-arithmetic-${look}-${String(width)}.png`) })

          passes.push({ look, width, said: { fact, ended: endedText, place: placeText, arithmetic: arithmeticText }, page: pageShot, ended: endedShot, place: placeShot, arithmetic: arithmeticShot, spacing: { look, width, ...spacing } })
        }
      }

      // WHAT THE PAGE SAID, read from the keys and checked after every picture has been taken, so a fault in the
      // words cannot stop the spacing evidence being captured.
      for (const pass of passes) {
        const where = `${pass.look} ${String(pass.width)}`
        expect(pass.said.fact, `${where}: the row's one fact`).toBe(`1 ${t('g6a.sessions.oneFact')}`)
        expect(pass.said.ended, `${where}: the ended band's one-run sentence`).toContain(t('g6a.sessions.itWasWrittenDownAsFinished'))
        expect(pass.said.ended, `${where}: the old fraction is gone`).not.toContain(t('g6a.sessions.confirmedOne', { confirmed: 1, total: 1 }))
        expect(pass.said.place, `${where}: every row says the same thing`).toContain(t('g6a.sessions.bothSayTheSameThing'))
        expect(pass.said.place, `${where}: the old fraction is gone from the placement note`).not.toContain(t('g6a.sessions.ofThese'))
        expect(pass.said.arithmetic, `${where}: no including clause at zero`).toContain(t('g6a.sessions.foldedEndedNoGroups', { n: 1 }))
        expect(pass.said.arithmetic, `${where}: the old including clause is gone`).not.toContain(t('g6a.sessions.foldedEnded', { n: 1, rows: 0, groups: 0 }))
      }

      // THE TOOL NAME AND THE ORIGIN PILL ARE TWO MARKS, NOT ONE WORD. If they share a line the gap is the lead's
      // column gap; when the narrow widths wrap them the gap is its row gap. Either way it is measured against the
      // stylesheet's own gap, so the check cannot drift from the rule.
      for (const pass of passes.map((one) => one.spacing)) {
        const where = `${pass.look} ${String(pass.width)}`
        expect(pass.marks.display, `${where}: the tool name and the pill sit in their own flow`).toMatch(/flex/)
        expect(pass.marks.columnGap, `${where}: the marks' column gap`).toBeGreaterThan(0)
        expect(pass.marks.rowGap, `${where}: the marks' row gap`).toBeGreaterThan(0)
        if (pass.marks.sameLine) expect(pass.marks.gapX, `${where}: the gap beside the tool name`).toBeGreaterThanOrEqual(pass.marks.columnGap - 0.5)
        else expect(pass.marks.gapY, `${where}: the gap under the tool name`).toBeGreaterThanOrEqual(pass.marks.rowGap - 0.5)
      }
    } finally {
      await app.stop()
    }
  }, 300_000)
})
