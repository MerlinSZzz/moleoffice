// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD FLASHES THE THING IT NAMES ONCE, AND THEN NOTHING OF IT STAYS ON THE PAGE.
 *
 * A browser that follows an agent is moved by the agent's lead at once. The page goes to the thing the
 * lead names, the thing flashes once, and then the page is as it was before: no box, no wash, no
 * highlighted words and no selection that a click, a scroll or a right click has to clear. A comment
 * the reader presses is different: it keeps its mark until the reader asks for something else, and
 * this file does not ask about that.
 *
 * WHAT EACH CASE DOES. It opens the records list in a browser following a made-up agent, has that
 * agent send a lead, and watches the page from the moment the lead is sent until long after the flash
 * would have ended. Three leads: one paragraph of a report, one picture in it, and the whole report.
 * Each is followed once with no motion preference and once with reduced motion.
 *
 * WHAT IT ASKS:
 *   1. The page lands on the report, and exactly one flash is drawn, on the thing the lead names: on
 *      the paragraph and not its neighbours, on the picture and not its neighbours, and on the whole
 *      report for the report. The flash is on the screen when it is drawn.
 *   2. With no motion preference the flash is the jump wash: one animation over the linger period.
 *      With reduced motion it is a still mark, with no animation while it is shown, that then fades by
 *      a colour change before it is taken off.
 *   3. After the flash nothing is drawn: no piece of the shown mark, no highlight of the shown words,
 *      no wash left on any element, and no selected text.
 *
 * THE LEAD TO THE WHOLE REPORT IS SENT WHILE THE LIST IS OPEN, and the list has a row for the same
 * report. That row is still on the page for a moment after the address changes, so a flash drawn on it
 * is a flash nobody sees. The case asks for the flash on the report's own page.
 *
 * RECORDINGS. With W13Y_LEAD_FILMS naming a folder, each case is filmed at 1440 by 900 into it, in the
 * theme W13Y_LEAD_THEME names (light unless it says dark). The report and its words say they are made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = 'lead-flash-agent'
const AS_THE_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

/** How long each case watches the page after the lead is sent: well past the flash and past the layer's own wait. */
const WATCH_MS = 9000

let app: LiveApp
let folder = ''
let previousRoots: string | undefined
let picture = ''
let agentId = ''

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<{ id: string }> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, text).toBe(201)
  return (JSON.parse(text) as { record: { id: string } }).record
}

beforeAll(async () => {
  folder = aTestDatabaseFolder('a-lead-flashes-once')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = folder
  app = await liveApp({ name: 'a-lead-flashes-once', database: join(folder, 'panelx.db'), viewport: { width: 1440, height: 900 } })
  await app.page.goto(`${app.site}/`)
  await waitForThePage(app.page)
  const drawn = await app.page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 500
    const pen = canvas.getContext('2d')
    if (pen === null) return ''
    pen.fillStyle = '#587b9b'
    pen.fillRect(0, 0, 800, 500)
    return canvas.toDataURL('image/png')
  })
  expect(drawn, 'the browser drew the made-up picture').not.toBe('')
  const stored = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ bytes: drawn.split(',')[1], name: 'a-made-up-picture.png' }),
  })
  const said = await stored.text()
  expect(stored.status, said).toBe(201)
  picture = (JSON.parse(said) as { file: { path: string } }).file.path
  await post('/api/records', AS_THE_PERSON, { kind: 'agent', title: 'A made-up guide', data: { handle: AGENT, runtime: 'claude-code', state: 'active' } })
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as { agents: { id: string; handle: string }[] }
  agentId = listed.agents.find((one) => one.handle === AGENT)?.id ?? ''
  expect(agentId, 'the made-up agent is listed').not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  if (folder !== '') removeThisTestFolder(folder)
}, 60_000)

/** A made-up report of seven paragraphs with a picture after the third. */
async function aReport(name: string): Promise<string> {
  const words = (n: number): string => `Made-up paragraph ${String(n)}. ` + 'These words are made up for a test and say nothing about anything. '.repeat(4)
  const blocks = [
    { id: 'b1', type: 'text', text: words(1) },
    { id: 'b2', type: 'text', text: words(2) },
    { id: 'b3', type: 'text', text: words(3) },
    { id: 'i1', type: 'image', path: picture, alt: 'A made-up picture' },
    { id: 'b4', type: 'text', text: words(4) },
    { id: 'b5', type: 'text', text: words(5) },
    { id: 'b6', type: 'text', text: words(6) },
    { id: 'b7', type: 'text', text: words(7) },
  ]
  return (await post('/api/records', AS_THE_PERSON, { kind: 'report', title: `A made-up report: ${name}`, data: { blocks } })).id
}

/** The element drawing one paragraph of a report, by the key the page puts on it. */
function paragraph(report: string, block: string): string {
  return `[data-target="${targetAttributeValue({ kind: 'region', recordId: report, regionId: `data.blocks[#${block}].text@0` })}"]`
}

interface Lead {
  /** What the lead names, built for one report. */
  target: (report: string) => Record<string, unknown>
  /** What the flash must hold: every one of these is the flashed element or inside it. */
  holds: (report: string) => string[]
  /** What the flash must not hold, so a flash round the whole page does not pass for one on a paragraph. */
  spares: (report: string) => string[]
}

const LEADS: Record<'paragraph' | 'picture' | 'report', Lead> = {
  paragraph: {
    target: (report) => ({ kind: 'region', recordId: report, regionId: 'data.blocks[#b5]' }),
    holds: (report) => [paragraph(report, 'b5')],
    spares: (report) => [paragraph(report, 'b4'), paragraph(report, 'b6')],
  },
  picture: {
    target: (report) => ({ kind: 'region', recordId: report, regionId: 'data.blocks[#i1]' }),
    holds: () => ['main img[alt="A made-up picture"]'],
    spares: (report) => [paragraph(report, 'b3'), paragraph(report, 'b4')],
  },
  report: {
    target: (report) => ({ kind: 'record', recordId: report, workspaceId: 'default' }),
    holds: (report) => [paragraph(report, 'b1'), paragraph(report, 'b7')],
    spares: () => [],
  },
}

/** One flash seen on the page: where it was, and how it was drawn. */
interface Flash {
  holds: boolean
  spares: boolean
  inView: boolean
  /** With reduced motion: no animation ran on the element when the mark was first seen. */
  still: boolean
  /** With reduced motion: the mark then faded by a change of colour. */
  faded: boolean
}

/**
 * WATCH THE PAGE FOR FLASHES, every frame for `ms`. A flash with motion is an animation over the linger
 * period whose first frame carries the inset edge. A flash without motion is an element given the inset
 * edge in its own style. Each is counted once, when it is first seen, and where it is is read then.
 */
function watchTheFlashes(page: Page, ms: number, holds: string[], spares: string[]): Promise<Flash[]> {
  return page.evaluate(
    async ({ ms, holds, spares }) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-linger-period').trim()
      const linger = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
      const flashes: (Omit<Flash, 'still' | 'faded'> & { still: boolean; faded: boolean; on: Element })[] = []
      const counted = new Set<Animation>()
      const lit = new Set<HTMLElement>()
      const contains = (on: Element, selector: string): boolean => {
        const one = document.querySelector(selector)
        return one !== null && (one === on || on.contains(one))
      }
      const seen = (on: Element, still: boolean) => {
        const box = on.getBoundingClientRect()
        const tall = box.height >= window.innerHeight
        // A PIXEL EITHER WAY IS ROUNDING. The window scrolls by whole pixels and a box's edge need not fall on one,
        // so a box scrolled to the top of the window can start a fraction of a pixel above it.
        const edge = 1
        flashes.push({
          on,
          holds: holds.every((selector) => contains(on, selector)),
          spares: spares.every((selector) => !contains(on, selector)),
          inView: tall ? box.top < window.innerHeight && box.bottom > 0 : box.top >= -edge && box.bottom <= window.innerHeight + edge,
          still,
          faded: false,
        })
      }
      const end = performance.now() + ms
      while (performance.now() < end) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        for (const animation of document.getAnimations()) {
          const effect = animation.effect as KeyframeEffect | null
          const on = effect?.target ?? null
          if (on === null || counted.has(animation)) continue
          if ('transitionProperty' in animation) {
            if ((animation as CSSTransition).transitionProperty !== 'background-color') continue
            const flash = flashes.find((one) => one.on === on)
            if (flash !== undefined) flash.faded = true
            continue
          }
          if (effect?.getTiming().duration !== linger || !String(effect.getKeyframes()[0]?.boxShadow ?? '').includes('inset')) continue
          counted.add(animation)
          seen(on, false)
        }
        for (const on of document.querySelectorAll<HTMLElement>('[style*="box-shadow"]')) {
          if (!on.style.boxShadow.includes('inset') || lit.has(on)) continue
          lit.add(on)
          seen(on, on.getAnimations().length === 0)
        }
        for (const on of [...lit]) if (!on.isConnected || !on.style.boxShadow.includes('inset')) lit.delete(on)
      }
      return flashes.map(({ holds, spares, inView, still, faded }) => ({ holds, spares, inView, still, faded }))
    },
    { ms, holds, spares },
  )
}

/** What is still drawn of a lead after its flash. Every part of it should be nothing. */
function whatIsLeft(page: Page): Promise<Record<string, number | boolean | string>> {
  return page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-linger-period').trim()
    const linger = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    return {
      shownPieces: document.querySelectorAll('.px-subject[data-why="shown"] > i').length,
      shownWords: registry?.has('mole-office-showing') ?? false,
      washes: [...document.querySelectorAll<HTMLElement>('[style*="box-shadow"]')].filter((one) => one.style.boxShadow.includes('inset')).length,
      flashing: document.getAnimations().filter((one) => one.effect?.getTiming().duration === linger).length,
      selected: window.getSelection()?.toString() ?? '',
    }
  })
}

for (const reduced of [false, true])
  for (const name of ['paragraph', 'picture', 'report'] as const)
    it(`a lead to ${name === 'report' ? 'a whole report' : `a ${name}`} flashes it once ${reduced ? 'as a still mark that fades' : 'with the jump wash'}, and leaves nothing drawn`, async () => {
      const lead = LEADS[name]
      const report = await aReport(`${name}${reduced ? ', reduced motion' : ''}`)
      const films = process.env['W13Y_LEAD_FILMS']
      const theme = process.env['W13Y_LEAD_THEME'] === 'dark' ? 'dark' : 'light'
      if (films !== undefined && films !== '') mkdirSync(films, { recursive: true })
      const filming = films !== undefined && films !== ''
      const context = await app.browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: reduced ? 'reduce' : 'no-preference',
        ...(filming ? { recordVideo: { dir: films, size: { width: 1440, height: 900 } } } : {}),
      })
      await context.addInitScript(
        ([key, who, look]) => {
          localStorage.setItem(key as string, who as string)
          localStorage.setItem('mole-office.preset.theme', look as string)
        },
        [FOLLOWING_KEY, `agent:${agentId}`, theme],
      )
      const page = await context.newPage()
      let message = ''
      try {
        await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.waitForTimeout(1000)
        const watching = watchTheFlashes(page, WATCH_MS, lead.holds(report), lead.spares(report))
        message = (
          await post('/api/records', AS_THE_AGENT, {
            kind: 'message',
            title: `Look at the ${name}`,
            data: { body: `Look at the made-up ${name}.`, to: [{ kind: 'person', id: THE_PERSON }], lead: { target: lead.target(report), place: { at: 'surface' } } },
          })
        ).id
        const flashes = await watching
        expect(page.url(), 'the lead took the page to the report').toContain(`#${recordPath(report)}`)
        expect(flashes.length, `one flash, and only one: ${JSON.stringify(flashes)}`).toBe(1)
        const [flash] = flashes
        expect(flash?.holds, 'the flash is on the thing the lead names').toBe(true)
        expect(flash?.spares, 'the flash is on that thing and not round more of the page').toBe(true)
        expect(flash?.inView, 'the flash is on the screen').toBe(true)
        if (reduced) {
          expect(flash?.still, 'with reduced motion the mark is still while it is shown').toBe(true)
          expect(flash?.faded, 'with reduced motion the still mark fades by a change of colour').toBe(true)
        }
        expect(await whatIsLeft(page), 'nothing of the lead is drawn after its flash').toEqual({
          shownPieces: 0,
          shownWords: false,
          washes: 0,
          flashing: 0,
          selected: '',
        })
      } finally {
        // THE LEAD IS MARKED READ WHATEVER HAPPENED, so a lead this case did not take cannot be taken by the next
        // case's browser when it opens.
        if (message !== '')
          await fetch(`${app.api}/api/messages/${message}/mark`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ mark: 'seen' }) })
        const video = page.video()
        await context.close()
        if (filming && video !== null) await video.saveAs(join(films, `lead-${name}-${theme}-${reduced ? 'reduced' : 'motion'}.webm`))
      }
    }, 120_000)
