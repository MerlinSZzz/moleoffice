// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNT IS READABLE ON THE GROUND IT STANDS ON, IN EVERY THEME: AT THE FOOT OF NEEDS YOU, IN LATE OR STUCK'S
 * HEADING, AND ON THE PROJECTS PAGE.
 *
 * The three counts share one class, `.hm-section-count`. Only Late or stuck's stands in a heading, on the
 * heading's ground. Needs you's foot stands on the ask row, and the Projects page's count on the page. High
 * contrast draws its headings black with a near-white count, so a count drawn in the heading's colour away from
 * the heading cannot be read, and the heading's count drawn in the page's colour cannot be read either.
 *
 * Each count's colour, as the browser computes it, is measured against the first solid ground beneath it, with
 * any see-through ground laid over the one below. Each is held to 4.5, the floor for text that is not body text
 * (src/shared/readability.ts). An image under a count stops the case with a sentence, because its ground cannot
 * be read from the styles.
 *
 * Seven made-up questions fill Needs you past its five rows, and five made-up pipelines stand still, so Late or
 * stuck says "4 of 5" in its heading.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../src/shared/readability.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THEME_IDS } from '../src/shared/themes.ts'
import { contrast } from './helpers/colour-measures.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AN_AGENT = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }
const COUNTS = {
  'the foot of Needs you': '[data-home-needs-more] .hm-section-count',
  "Late or stuck's heading": '[data-home-section="late"] .hm-section-head .hm-section-count',
  'the Projects page': '[data-home-section="projects"] > .hm-section-count',
} as const
let app: LiveApp

async function send(method: 'POST' | 'PATCH', path: string, body: unknown, headers: Record<string, string>): Promise<{ record: { id: string } }> {
  const answer = await fetch(`${app.api}${path}`, { method, headers, body: JSON.stringify(body) })
  const text = await answer.text()
  if (!answer.ok) throw new Error(`${method} ${path} answered ${String(answer.status)}: ${text}`)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-count-is-readable', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  for (let n = 1; n <= 7; n += 1) {
    await send('POST', '/api/records', {
      kind: 'proposal',
      title: `A made-up question for the person (${String(n)})`,
      data: { question: 'Which of the two made-up ways?', options: ['a — the first way', 'b — the second way'], recommendation: 'Take (a).', because: 'It is made up.', who_settles_it: 'the owner' },
    }, AN_AGENT)
  }
  for (let n = 1; n <= 5; n += 1) {
    const still = await send('POST', '/api/records', { kind: 'pipeline', title: `Made-up stalled line ${String(n)}`, data: { blockIds: [] } }, OWNER)
    const block = await send('POST', `/api/records/${still.record.id}/blocks`, { name: 'Wait for the parts', state: 'todo' }, OWNER)
    await send('PATCH', `/api/records/${block.record.id}`, { dataPatch: { paused: { since: '2026-08-12 10:00:00', why: 'The made-up parts are late.' } } }, OWNER)
  }
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/`)
  await waitForThePage(app.page, 60_000)
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

type Rgba = readonly [number, number, number, number]

function channels(colour: string): Rgba {
  const parts = /^rgba?\(([^)]+)\)$/.exec(colour)?.[1]?.split(/[,\s/]+/).filter(Boolean).map(Number)
  if (parts === undefined || (parts.length !== 3 && parts.length !== 4) || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`The browser gave the colour "${colour}", which this test cannot read as red, green, blue and alpha.`)
  }
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
}

/** One colour laid over a solid one, each channel rounded as a browser draws it. */
function laid(top: Rgba, beneath: Rgba): Rgba {
  const channel = (i: 0 | 1 | 2) => Math.round(top[i] * top[3] + beneath[i] * (1 - top[3]))
  return [channel(0), channel(1), channel(2), 1]
}

const asRgb = (colour: Rgba) => `rgb(${String(colour[0])}, ${String(colour[1])}, ${String(colour[2])})`

/** The count's colour and the solid ground it stands on, from the computed styles of it and what is beneath it. */
async function measure(selector: string): Promise<{ ink: string; ground: string; ratio: number }> {
  const count = app.page.locator(selector)
  await count.waitFor({ timeout: 30_000 })
  expect(await count.count(), `one count at ${selector}`).toBe(1)
  const drawn = await count.evaluate((element) => {
    const grounds: string[] = []
    for (let at: Element | null = element; at !== null; at = at.parentElement) {
      const style = getComputedStyle(at)
      if (style.backgroundImage !== 'none') throw new Error(`An image is drawn under the count, on <${at.tagName.toLowerCase()} class="${at.className}">, so its ground cannot be read from the styles.`)
      grounds.push(style.backgroundColor)
    }
    return { ink: getComputedStyle(element).color, grounds }
  })
  const layers = drawn.grounds.map(channels)
  const solid = layers.findIndex((layer) => layer[3] === 1)
  if (solid < 0) throw new Error(`Nothing solid is drawn under ${selector}: ${drawn.grounds.join(' over ')}.`)
  let ground = layers[solid]!
  for (let i = solid - 1; i >= 0; i -= 1) ground = laid(layers[i]!, ground)
  const ink = channels(drawn.ink)
  const inkOnGround = ink[3] === 1 ? ink : laid(ink, ground)
  return { ink: asRgb(inkOnGround), ground: asRgb(ground), ratio: contrast(asRgb(inkOnGround), asRgb(ground)) }
}

describe('a count on Home and on the Projects page', () => {
  it.each(['light', 'dark', ...THEME_IDS].map((theme) => [theme]))('reads at 4.5 or more on its own ground under %s', async (theme) => {
    await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/`)
    await waitForThePage(app.page, 60_000)
    expect(await app.page.getAttribute('html', 'data-theme'), 'the theme is the one chosen').toBe(theme)
    const measured: Record<string, { ink: string; ground: string; ratio: number }> = {}
    measured['the foot of Needs you'] = await measure(COUNTS['the foot of Needs you'])
    measured["Late or stuck's heading"] = await measure(COUNTS["Late or stuck's heading"])
    await app.page.goto(`${app.site}/?lang=en&mode=normal#/projects`)
    measured['the Projects page'] = await measure(COUNTS['the Projects page'])
    const unreadable = Object.entries(measured).filter(([, one]) => one.ratio < FLOORS.text)
      .map(([where, one]) => `${where}: ${one.ink} on ${one.ground}, ${one.ratio.toFixed(2)}`)
    expect(unreadable, `${theme}: ${JSON.stringify(measured)}`).toEqual([])
  }, 120_000)
})
