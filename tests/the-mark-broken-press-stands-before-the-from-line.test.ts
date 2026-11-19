// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE "MARK BROKEN" PRESS STANDS BEFORE THE REPLY'S "FROM" LINE (wave 13y, the owner's writing row).
 *
 * The person tried the press on an agent's reply to a message that carried a label, and asked for it to move left, to
 * the left of the reply's "from …" line, so that it stands under the label on their own message above. It stood after
 * the "from" line in the person's conversation and at the end of the foot in a group.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   1. IN THE PERSON'S CONVERSATION WITH AN AGENT, the press on the agent's reply stands directly before the "from"
 *      line: the next thing after it is that line. They share a line when the source fits inside the bubble; otherwise
 *      the source begins below the press at its left edge and wraps inside the bubble. The tag stays first. The press
 *      stays under the label at 1440, 990 and 660 beside the page and in the window, with Edit open and shut.
 *      The original 390 window case stays as well.
 *   2. IN A GROUP, the press on the agent's reply stands in the same place, before the "from" line.
 *   3. THE EDGE THE "FROM" LINE IS JUDGED BY. The page moves the line below the press when, written on one line beside
 *      the press, it would end past the bubble's content edge: the bubble's right less its right border and right
 *      padding. Every case here judges by that edge too, never by the bubble's outer right. One case, at 1440 with the
 *      chat beside the page, chooses the reply's "from" text at run time from widths measured in the page, so that on
 *      one line it would end between the content edge and the outer edge. It expects the line below the press. When
 *      no text can end there, that case fails and says so.
 *
 * Every made-up message's "from" line is the same on every machine. `aWindow` sets it in the conversation's read and in
 * the group's own read, GET /api/groups/<id>, because a group's messages do not come through the conversation.
 *
 *   MUTATION A: the press after the "from" line again, in the person's conversation. Red on 1.
 *   MUTATION B: the press first in the foot, before the tool's tag. Red on 1 and 2.
 *   MUTATION C: the press at the end of the group's foot again. Red on 2.
 *   MUTATION D: the press and the "from" line as separate pieces is red where the source fits; a source that never
 *               moves below the press is red where it would cross the bubble's content edge.
 *   MUTATION E: the check in FromBesideTheMark (src/web/components/Chat.tsx) judged by the bubble's outer right
 *               instead of its content edge. Red on 3: the line stays beside the press, inside the bubble's padding.
 *
 * Everything here is made up: the agent, its run, the group and their messages. The servers come from `liveApp` in
 * tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { OPEN_AT, groupOpenKey } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-builder' }

const ASKED = 'Made-up ask: show me how you would do it before you build it.'
const REPLIED = 'Made-up reply: I built it instead of showing you first.'
const ASKED_IN_THE_GROUP = 'Made-up ask in the group: a plan first, please.'
const REPLIED_IN_THE_GROUP = 'Made-up reply in the group: it is built already.'

type Where = 'window' | 'right'
/** The machine the reply was written from: a short name, a long one, or one a case chose. */
type Source = 'short' | 'long' | { machine: string }

let app: LiveApp
let agentId = ''
let groupId = ''

/** File one record, and say the answer when it is not the one this office gives. */
async function file(headers: Record<string, string>, body: { kind: string; title: string; data: Record<string, unknown> }, answer = 201): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(filed.status, await filed.clone().text()).toBe(answer)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'mark-broken-place', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await file(AS_THE_OWNER, { kind: 'agent', title: 'Made-up Builder', data: { handle: 'made-up-builder', runtime: 'claude-code', state: 'active' } })
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-builder')?.id ?? ''
  expect(agentId, 'made-up-builder has no registry row').not.toBe('')
  // A RUN THAT SAYS WHICH TOOL RAN IT, so each reply's foot carries the tool's tag before the press.
  const run = await file(AS_THE_OWNER, {
    kind: 'session',
    title: 'A made-up run',
    data: { state: 'finished', runtime: 'claude-code', model: 'claude-opus-5-5', doing: 'made-up work' },
  })

  // THE PERSON'S LABELLED MESSAGE, AND THE AGENT'S REPLY UNDER IT, in their conversation.
  const asked = { kind: 'message', title: 'Made-up ask', data: { body: ASKED, to: [{ kind: 'agent', id: agentId }], intent: 'proposal-first' } }
  await file(AS_THE_OWNER, asked, theAnswerToAWriteInATestOffice(AS_THE_OWNER, asked))
  await file(AS_THE_AGENT, { kind: 'message', title: 'Made-up reply', data: { body: REPLIED, to: [{ kind: 'person', id: THE_PERSON }], fromRun: run } })

  // AND THE SAME IN A GROUP OF THE TWO.
  const group = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'Made-up group',
      because: 'A made-up group for the place of the press.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the person is in it' },
        { who: { kind: 'agent', id: 'made-up-builder' }, because: 'it does the made-up work' },
      ],
    }),
  })
  expect(group.status, await group.clone().text()).toBe(201)
  groupId = ((await group.json()) as { group: { id: string } }).group.id
  await file(AS_THE_OWNER, { kind: 'message', title: 'Made-up ask in the group', data: { body: ASKED_IN_THE_GROUP, toGroup: groupId, intent: 'proposal-first' } })
  await file(AS_THE_AGENT, { kind: 'message', title: 'Made-up reply in the group', data: { body: REPLIED_IN_THE_GROUP, toGroup: groupId, fromRun: run } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own on Home, with the chat in its window or beside the page, open at one conversation. */
async function aWindow(width: number, where: Where, key: string, source?: Source): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: 'light' })
  await context.addInitScript((open) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', open)
    localStorage.setItem('mole-office.chat.split-side', 'right')
  }, where === 'window' ? 'yes' : 'split')
  const page = await context.newPage()
  const replyFrom = source === undefined ? undefined : source === 'short' ? 'x' : source === 'long' ? 'wide'.repeat(40) : source.machine
  const fromMadeUpMachines = async (route: Route): Promise<void> => {
    const response = await route.fetch()
    const answer = await response.json() as { messages: { body: string; writtenFrom: unknown }[] }
    for (const message of answer.messages) {
      if (message.body === ASKED || message.body === ASKED_IN_THE_GROUP || message.body === REPLIED_IN_THE_GROUP) {
        message.writtenFrom = { machine: 'made-up-source', how: 'this machine', program: null }
      } else if (message.body === REPLIED && replyFrom !== undefined) {
        message.writtenFrom = { machine: replyFrom, how: 'this machine', program: null }
      }
    }
    await route.fulfill({ response, json: answer })
  }
  await page.route('**/api/messages/conversation**', fromMadeUpMachines)
  // A GROUP'S MESSAGES COME FROM THE GROUP'S OWN READ, so without this its reply names the machine the test runs on.
  await page.route((url) => url.pathname === `/api/groups/${encodeURIComponent(groupId)}`, fromMadeUpMachines)
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([event, detail]) => window.dispatchEvent(new CustomEvent(event, { detail })), [OPEN_AT, key] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  return { context, page }
}

/** The one message that says these words. */
function theMessage(page: Page, words: string) {
  return page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: words }) })
}

/** The reply's foot as the page draws it, and where its "from" line would end on one line. */
interface TheFoot {
  presses: number
  order: (string | null)[]
  next: string | null
  labelLeft: number
  pressLeft: number
  pressRight: number
  contentLeft: number
  /** The bubble's right less its right border and right padding. The page judges the "from" line by this edge. */
  contentRight: number
  bubbleRight: number
  /** The "from" line's words, the font they are drawn in, and their width on one line in that font. */
  words: string
  font: string
  natural: number
  /** Where the "from" line would end if it were written on one line beside the press. */
  oneLineEnds: number
  wouldCross: boolean
  sameLine: boolean
  below: boolean
}

/**
 * In the page: the reply's foot, measured. This is the one place in the file that says which edge the "from" line is
 * judged by, and it is the edge the page uses. Run it with `page.evaluate`, so it reads nothing from this module.
 */
function theReplyFoot([asked, replied]: readonly [string, string]): TheFoot | null {
  const row = (words: string) => [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(words))
  const label = row(asked)?.querySelector<HTMLElement>('.px-chat-intent-mark')
  const reply = row(replied)
  const foot = reply?.querySelector<HTMLElement>('.px-chat-foot')
  const press = foot?.querySelector<HTMLElement>('.px-chat-mark-broken')
  const from = foot?.querySelector<HTMLElement>('.px-chat-from')
  const bubble = reply?.querySelector<HTMLElement>('.px-chat-bubble')
  if (!label || !foot || !press || !from || !bubble || !press.parentElement) return null
  const canvas = document.createElement('canvas').getContext('2d')
  if (!canvas) return null
  const named = (it: Element | null): string | null => (it === null ? null : (it.getAttribute('class') ?? '').split(' ')[0] ?? null)
  const l = label.getBoundingClientRect(), p = press.getBoundingClientRect(), f = from.getBoundingClientRect(), b = bubble.getBoundingClientRect()
  const style = getComputedStyle(bubble)
  const contentLeft = b.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
  const contentRight = b.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
  const font = getComputedStyle(from).font
  canvas.font = font
  const words = from.textContent ?? ''
  const natural = canvas.measureText(words).width
  const gap = parseFloat(getComputedStyle(press.parentElement).columnGap) || 0
  const oneLineEnds = p.right + gap + natural
  return {
    presses: foot.querySelectorAll('.px-chat-mark-broken').length,
    // THE TOOL'S TAG, THE PRESS AND THE "FROM" LINE IN THE ORDER THE FOOT HOLDS THEM, at whatever depth it holds them.
    order: [...foot.querySelectorAll('.px-chat-ranby, .px-chat-mark-broken, .px-chat-from')].map(named),
    next: named(press.nextElementSibling),
    labelLeft: l.left,
    pressLeft: p.left,
    pressRight: p.right,
    contentLeft,
    contentRight,
    bubbleRight: b.right,
    words,
    font,
    natural,
    oneLineEnds,
    wouldCross: oneLineEnds > contentRight + 0.5,
    sameLine: p.right <= f.left + 0.5 && Math.abs((p.top + p.bottom - f.top - f.bottom) / 2) < 4,
    below: f.top >= p.bottom - 0.5 && Math.abs(f.left - p.left) <= 1 && f.right <= contentRight + 1 && from.scrollWidth <= from.clientWidth + 1,
  }
}

/** What stands on each side of the press in the reply's foot, and where the press is drawn beside the "from" line. */
async function besideThePress(page: Page, asked: string, replied: string) {
  // THE LABEL IS ON THE PERSON'S MESSAGE ABOVE, so the press under the reply is the one this file is about.
  await theMessage(page, asked).locator('.px-chat-foot .px-chat-intent-mark').waitFor({ timeout: 30_000 })
  const reply = theMessage(page, replied)
  await reply.locator('.px-chat-foot .px-chat-mark-broken').waitFor({ timeout: 30_000 })
  await reply.locator('.px-chat-foot .px-chat-from').waitFor({ timeout: 30_000 })
  const foot = await page.evaluate(theReplyFoot, [asked, replied] as const)
  if (foot === null) return null
  return { presses: foot.presses, order: foot.order, next: foot.next, sourcePlaced: foot.wouldCross ? foot.below : foot.sameLine }
}

const IN_ITS_PLACE = {
  presses: 1,
  order: ['px-chat-ranby', 'px-chat-mark-broken', 'px-chat-from'],
  next: 'px-chat-from',
  sourcePlaced: true,
}

/** The test moves the label to each reply edge; this is not the product's own label layout. */
async function putTheLabelAt(page: Page, asked: string, replied: string, side: 'left' | 'right' | 'restore'): Promise<void> {
  await page.evaluate(([asked, replied, side]) => {
    const row = (words: string) => [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(words))
    const label = row(asked)?.querySelector<HTMLElement>('.px-chat-intent-mark')
    const reply = row(replied)
    const press = reply?.querySelector<HTMLElement>('.px-chat-mark-broken')
    const bubble = reply?.querySelector<HTMLElement>('.px-chat-bubble')
    if (!label || !press || !bubble) throw new Error('The made-up messages are not drawn.')
    label.style.removeProperty('left')
    label.style.removeProperty('position')
    if (side === 'restore') return
    const original = label.getBoundingClientRect().left
    const b = bubble.getBoundingClientRect(), style = getComputedStyle(bubble)
    const left = b.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
    const right = b.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
    const target = side === 'left' ? left : right - press.getBoundingClientRect().width
    label.style.position = 'relative'
    label.style.left = `${target - original}px`
  }, [asked, replied, side] as const)
}

async function theReplyBubble(page: Page, replied: string): Promise<{ left: number; width: number }> {
  return page.evaluate((words) => {
    const row = [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(words))
    const bubble = row?.querySelector<HTMLElement>('.px-chat-bubble')
    if (!bubble) throw new Error('The made-up reply is not drawn.')
    const rect = bubble.getBoundingClientRect()
    return { left: rect.left, width: rect.width }
  }, replied)
}

/** In the page: whether the reply's bubble keeps its box when the page's own wrapping of the "from" line is taken off. */
function theBubbleKeepsItsBox(replied: string): boolean | null {
  const reply = [...document.querySelectorAll<HTMLElement>('.px-chat-one')].find((one) => one.querySelector('.px-chat-words')?.textContent?.includes(replied))
  const press = reply?.querySelector<HTMLElement>('.px-chat-foot .px-chat-mark-broken')
  const from = reply?.querySelector<HTMLElement>('.px-chat-foot .px-chat-from')
  const bubble = reply?.querySelector<HTMLElement>('.px-chat-bubble')
  const line = press?.parentElement
  if (!from || !bubble || !line) return null
  const b = bubble.getBoundingClientRect()
  const lineStyle = line.getAttribute('style'), fromStyle = from.getAttribute('style')
  line.style.flex = ''; line.style.width = ''; line.style.flexDirection = ''; line.style.alignItems = ''
  from.style.width = ''; from.style.maxWidth = ''; from.style.overflowWrap = ''
  const unwrappedBubble = bubble.getBoundingClientRect()
  if (lineStyle === null) line.removeAttribute('style'); else line.setAttribute('style', lineStyle)
  if (fromStyle === null) from.removeAttribute('style'); else from.setAttribute('style', fromStyle)
  return Math.abs(b.left - unwrappedBubble.left) <= 1 && Math.abs(b.width - unwrappedBubble.width) <= 1
}

/** Measure the hypothetical one-line source as well as the drawn foot, so each fixture proves which rule applies. */
async function sourceStaysInItsPlace(page: Page, source: 'short' | 'long', expected?: 'beside' | 'below'): Promise<void> {
  let last: unknown = null
  try {
    await expect.poll(async () => {
      const foot = await page.evaluate(theReplyFoot, [ASKED, REPLIED] as const)
      const bubbleUnchanged = await page.evaluate(theBubbleKeepsItsBox, REPLIED)
      last = foot === null ? null : { ...foot, bubbleUnchanged }
      if (foot === null) return false
      const aligned = Math.abs(Math.max(foot.labelLeft, foot.contentLeft) - foot.pressLeft) <= 1
      return bubbleUnchanged === true && aligned && foot.next === 'px-chat-from' && (source !== 'long' || foot.wouldCross) && (expected === undefined || (expected === 'below') === foot.wouldCross) && (foot.wouldCross ? foot.below : foot.sameLine)
    }, { timeout: 10_000 }).toBe(true)
  } catch (error) {
    throw new Error(`The reply foot did not fit the ${source} source; what the foot measured: ${JSON.stringify(last)}\n${String(error)}`)
  }
}

/** How far inside the band, on each side, the chosen line must end, so that rounding cannot carry it over either edge. */
const INSIDE_THE_BAND = 1.5

/** The most windows the edge case opens: the first measures, and each later one tries a text chosen from the one before. */
const WINDOWS_TO_LAND_IN_THE_BAND = 4

/** The reads that must agree twice in a row before the foot counts as settled. */
const SETTLES_ON = ['pressLeft', 'pressRight', 'contentRight', 'bubbleRight', 'oneLineEnds'] as const

/** The reply's foot once two reads a quarter of a second apart agree, so the page has finished fitting it. */
async function theSettledFoot(page: Page): Promise<TheFoot> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  let before: TheFoot | null = null
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    const now = await page.evaluate(theReplyFoot, [ASKED, REPLIED] as const)
    const last = before
    if (now !== null && last !== null && SETTLES_ON.every((key) => Math.abs(now[key] - last[key]) <= 0.25)) return now
    before = now
    await page.waitForTimeout(250)
  }
  throw new Error(`The reply's foot did not settle within 30 seconds. The last read: ${JSON.stringify(before)}`)
}

/**
 * In the page: the machine name whose "from" line, on one line in the line's own font, is nearest `wanted` pixels wide.
 * The name is made of wide and narrow letters, so its width can be chosen to about a pixel.
 */
function aMachineOfTheWidth([words, machine, font, wanted]: readonly [string, string, string, number]): { machine: string; width: number } | null {
  const canvas = document.createElement('canvas').getContext('2d')
  const at = words.lastIndexOf(machine)
  if (!canvas || at < 0) return null
  canvas.font = font
  let best: { machine: string; width: number } | null = null
  for (let wide = 0; wide <= 160; wide += 1) {
    for (let narrow = wide === 0 ? 1 : 0; narrow <= 4; narrow += 1) {
      const name = 'w'.repeat(wide) + 'i'.repeat(narrow)
      const width = canvas.measureText(words.slice(0, at) + name + words.slice(at + machine.length)).width
      if (best === null || Math.abs(width - wanted) < Math.abs(best.width - wanted)) best = { machine: name, width }
    }
  }
  return best
}

/** The page's answer to a line that would end inside the band: below the press, at its left edge, inside the content edge. */
async function theLineGoesBelowThePress(page: Page): Promise<void> {
  let last: unknown = null
  try {
    await expect.poll(async () => {
      const foot = await page.evaluate(theReplyFoot, [ASKED, REPLIED] as const)
      last = foot
      return foot !== null && foot.wouldCross && foot.below && foot.next === 'px-chat-from'
    }, { timeout: 10_000 }).toBe(true)
  } catch (error) {
    throw new Error(`The page left the "from" line beside the press, though on one line it would end past the bubble's content edge and inside its outer edge: ${JSON.stringify(last)}\n${String(error)}`)
  }
}

describe('the source fits beside or below the aligned press', () => {
  const cases = ([1440, 990, 660] as const).flatMap((width) => (['right', 'window'] as const).flatMap((where) => (['short', 'long'] as const).map((source) => [width, where, source] as const)))
  it.each(cases)('keeps the source inside at %i with chat %s and a %s source', async (width, where, source) => {
    const { context, page } = await aWindow(width, where, participantKey({ kind: 'agent', id: agentId }), source)
    try {
      await sourceStaysInItsPlace(page, source)
      if (source === 'short') {
        const bubble = await theReplyBubble(page, REPLIED)
        for (const [side, expected] of [['left', 'beside'], ['right', 'below']] as const) {
          await putTheLabelAt(page, ASKED, REPLIED, side)
          await sourceStaysInItsPlace(page, source, expected)
          const after = await theReplyBubble(page, REPLIED)
          expect(Math.abs(after.left - bubble.left)).toBeLessThanOrEqual(1)
          expect(Math.abs(after.width - bubble.width)).toBeLessThanOrEqual(1)
        }
        await putTheLabelAt(page, ASKED, REPLIED, 'restore')
        await sourceStaysInItsPlace(page, source)
      }
      const asked = theMessage(page, ASKED)
      await asked.locator('.px-chat-edit').click()
      await asked.locator('.px-chat-editor-words').waitFor()
      await sourceStaysInItsPlace(page, source)
    } finally { await context.close() }
  }, 120_000)
})

describe('the "mark broken" press in the person\'s conversation', () => {
  const cases: [number, Where][] = [
    [1440, 'right'],
    [1440, 'window'],
    [390, 'window'],
  ]
  it.each(cases)('stands before the "from" line, after the tool\'s tag, at %i with the chat %s', async (width, where) => {
    const { context, page } = await aWindow(width, where, participantKey({ kind: 'agent', id: agentId }), 'short')
    try {
      expect(await besideThePress(page, ASKED, REPLIED)).toEqual(IN_ITS_PLACE)
    } finally {
      await context.close()
    }
  }, 120_000)
})

describe('the "mark broken" press in a group', () => {
  it('stands before the "from" line, after the tool\'s tag, at 1440 with the chat beside the page', async () => {
    const { context, page } = await aWindow(1440, 'right', groupOpenKey(groupId))
    try {
      expect(await besideThePress(page, ASKED_IN_THE_GROUP, REPLIED_IN_THE_GROUP)).toEqual(IN_ITS_PLACE)
    } finally {
      await context.close()
    }
  }, 120_000)
})

describe('the "from" line that would end inside the bubble\'s right padding', () => {
  // FOUR WINDOWS AT MOST, each given the 120 seconds a case of one window has here.
  it('goes below the press, because the page judges it by the content edge, at 1440 with the chat beside the page', async () => {
    const tried: Record<string, unknown>[] = []
    let machine = 'x'
    for (let opened = 1; opened <= WINDOWS_TO_LAND_IN_THE_BAND; opened += 1) {
      const { context, page } = await aWindow(1440, 'right', participantKey({ kind: 'agent', id: agentId }), { machine })
      try {
        const foot = await theSettledFoot(page)
        // THE BAND RUNS FROM THE CONTENT EDGE, where the page moves the line below, TO THE OUTER EDGE, where it would not.
        const band = foot.bubbleRight - foot.contentRight
        const past = foot.oneLineEnds - foot.contentRight
        // THE PRESS AND THE LINE FIT INSIDE THE BUBBLE ON ONE LINE, so the foot draws them as wide as they were measured.
        const fits = foot.oneLineEnds - foot.pressLeft <= foot.contentRight - foot.contentLeft
        tried.push({ machine, band, past, fits, words: foot.words, pressLeft: foot.pressLeft, contentLeft: foot.contentLeft, contentRight: foot.contentRight, bubbleRight: foot.bubbleRight })
        if (fits && past >= INSIDE_THE_BAND && past <= band - INSIDE_THE_BAND) {
          await theLineGoesBelowThePress(page)
          return
        }
        // THE NEXT TEXT IS CHOSEN TO END IN THE MIDDLE OF THE BAND, by the widths this window measured.
        const chosen = await page.evaluate(aMachineOfTheWidth, [foot.words, machine, foot.font, foot.natural + band / 2 - past] as const)
        if (chosen === null || chosen.machine === machine) break
        machine = chosen.machine
      } finally {
        await context.close()
      }
    }
    throw new Error(`No "from" text could be made to end between the reply bubble's content edge and its outer edge at 1440 with the chat beside the page, so this case cannot show which edge the page judges by. What each window measured: ${JSON.stringify(tried)}`)
  }, 480_000)
})
