// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT BUBBLES FOLLOW THE THEME (wave 14d, TH-1c).
 *
 * Round 2 made each part of the page read a style name the theme sets, with today's value as its fallback, so Light
 * and Dark looked as they did. The five bubble names already exist in every theme and nothing read them. This file
 * proves that a bubble's ground, ink, border and corners are what the look says: under Light and Dark they are the
 * values the bubble drew before the change, and under each of the six themes they are the theme's own values, read
 * from THEMES.
 *
 * HOW A LOOK IS APPLIED. The office keeps the person's look on their row, and the page draws what the office keeps
 * over anything the browser stored (decision f_fjuBPcB10d). The helper below sets the look on that row, the way the
 * page's own control does, and waits until the page draws it before reading a bubble. Setting localStorage alone
 * draws nothing while the office keeps a look.
 *
 * THE LIGHT AND DARK VALUES BELOW WERE MEASURED at d0eae96e8, with the same page and the same messages, by running
 * this case there: it passed at the base with these values and the case for the six themes failed because the code
 * did not read the five names yet. The values are what each bubble's ground, text colour, border and corner were
 * before the change, so a change to them now is red here.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THEMES } from '../src/shared/themes.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { participantKey } from '../src/shared/messages.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import type { Page } from 'playwright'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-bubbler' }

const NAMES = ['--bubble-mine-bg', '--bubble-mine-ink', '--bubble-theirs-bg', '--bubble-border', '--bubble-radius'] as const

interface Measure {
  background: string
  colour: string
  border: string
  corner: string
}

const LIGHT_BEFORE: { mine: Measure; theirs: Measure } = {
  mine: { background: 'rgb(255, 243, 184)', colour: 'rgb(28, 41, 60)', border: '2px solid rgb(28, 41, 60)', corner: '8px' },
  theirs: { background: 'rgba(0, 0, 0, 0)', colour: 'rgb(28, 41, 60)', border: '2px solid rgb(28, 41, 60)', corner: '8px' },
}
const DARK_BEFORE: { mine: Measure; theirs: Measure } = {
  mine: { background: 'rgb(34, 34, 38)', colour: 'rgb(250, 250, 250)', border: '1px solid rgb(48, 48, 51)', corner: '12px' },
  theirs: { background: 'rgba(0, 0, 0, 0)', colour: 'rgb(250, 250, 250)', border: '1px solid rgb(48, 48, 51)', corner: '12px' },
}

let app: LiveApp
let agentId = ''

async function sendA(headers: Record<string, string>, body: string, toThePerson = false): Promise<void> {
  const to = toThePerson ? [{ kind: 'person', id: THE_PERSON }] : [{ kind: 'agent', id: agentId }]
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers,
    body: JSON.stringify({ kind: 'message', title: 'Made-up bubble line', data: { body, to } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}

/**
 * Keep this look on the person's office row and open the chat once the page has drawn it. The
 * body is the one the page's own look control writes; the wait is what proves the look was drawn
 * rather than assumed from the browser's storage.
 */
async function openTheChat(page: Page, look: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const kept = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER,
    body: JSON.stringify({ themes: { chosen: look, own: [] } }),
  })
  expect(kept.status, await kept.text()).toBe(200)
  // A FULL LOAD, because a goto to the address the page is already on does not load it again and
  // would leave the previous look drawn.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForFunction(
    (wanted) => document.documentElement.getAttribute('data-theme') === wanted,
    look,
    { timeout: 30_000 },
  )
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  if ((await page.locator('.px-chat-one[data-mine="yes"] .px-chat-bubble').count()) === 0) {
    await page.fill('.px-chat-write textarea', 'Made-up words from my side of the bubble.')
    await page.click('.px-chat-write .px-chat-send')
    await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
  }
  await page.waitForSelector('.px-chat-one[data-mine="yes"] .px-chat-bubble', { timeout: 30_000 })
  await page.waitForSelector('.px-chat-one[data-mine="no"] .px-chat-bubble', { timeout: 30_000 })
}

/** The two bubbles as the page draws them now, and the five values the root carries, if any. */
async function theBubblesDrawn(page: Page): Promise<{ mine: Measure; theirs: Measure; root: Record<string, string> }> {
  return page.evaluate((names) => {
    const read = (element: Element): Measure => {
      const style = getComputedStyle(element)
      return {
        background: style.backgroundColor,
        colour: style.color,
        border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        corner: style.borderTopLeftRadius,
      }
    }
    const rootStyle = getComputedStyle(document.documentElement)
    return {
      mine: read(document.querySelector('.px-chat-one[data-mine="yes"] .px-chat-bubble')!),
      theirs: read(document.querySelector('.px-chat-one[data-mine="no"] .px-chat-bubble')!),
      root: Object.fromEntries(names.map((name) => [name, rootStyle.getPropertyValue(name).trim()])),
    }
  }, NAMES as unknown as string[])
}

/** What a bubble draws when it is given these five values, computed by the page itself. */
async function theValuesDraw(page: Page, values: Record<string, string>): Promise<{ mine: Measure; theirs: Measure }> {
  return page.evaluate((css) => {
    const probe = (declarations: Record<string, string>): Measure => {
      const made = document.createElement('span')
      for (const [name, value] of Object.entries(declarations)) made.style.setProperty(name, value)
      document.body.appendChild(made)
      const style = getComputedStyle(made)
      const read = {
        background: style.backgroundColor,
        colour: style.color,
        border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        corner: style.borderTopLeftRadius,
      }
      made.remove()
      return read
    }
    return {
      mine: probe({
        background: css['--bubble-mine-bg']!,
        color: css['--bubble-mine-ink']!,
        border: css['--bubble-border']!,
        'border-radius': css['--bubble-radius']!,
      }),
      theirs: probe({
        background: css['--bubble-theirs-bg']!,
        border: css['--bubble-border']!,
        'border-radius': css['--bubble-radius']!,
      }),
    }
  }, values)
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-bubbles', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Bubbler', data: { handle: 'made-up-bubbler', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-bubbler')?.id ?? ''
  expect(agentId).not.toBe('')
  await sendA(AS_THE_AGENT, 'Made-up words from the other side of the bubble.', true)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('under Light and Dark the page sets none of the five bubble values, and the bubbles draw what they drew before', async () => {
  for (const look of ['light', 'dark'] as const) {
    await openTheChat(app.page, look)
    const drawn = await theBubblesDrawn(app.page)
    for (const name of NAMES) expect(drawn.root[name], `${look} sets ${name}`).toBe('')
    const before = look === 'light' ? LIGHT_BEFORE : DARK_BEFORE
    expect(drawn.mine, look).toEqual(before.mine)
    expect(drawn.theirs, look).toEqual(before.theirs)
  }
}, 240_000)

it('under each of the six themes the bubbles draw the theme’s own five values', async () => {
  for (const theme of THEMES) {
    await openTheChat(app.page, theme.id)
    const values: Record<string, string> = {}
    for (const name of NAMES) {
      const value = theme.values[name]
      expect(value, `${theme.id} sets no ${name}`).toBeTypeOf('string')
      values[name] = value
    }
    const expected = await theValuesDraw(app.page, values)
    const drawn = await theBubblesDrawn(app.page)
    expect(drawn.mine.background, theme.id).toBe(expected.mine.background)
    expect(drawn.mine.colour, theme.id).toBe(expected.mine.colour)
    expect(drawn.theirs.background, theme.id).toBe(expected.theirs.background)
    expect(drawn.mine.border, theme.id).toBe(expected.mine.border)
    expect(drawn.theirs.border, theme.id).toBe(expected.theirs.border)
    expect(drawn.mine.corner, theme.id).toBe(expected.mine.corner)
    expect(drawn.theirs.corner, theme.id).toBe(expected.theirs.corner)
  }
}, 300_000)
